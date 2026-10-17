import { verifyIsolatedEnvironment } from './isolation-environment';
import { readFile, readdir, writeFile, readlink } from 'node:fs/promises';
import net from 'node:net';
import { RunnerError } from './errors';
import { diagnostic, emptyChecks, IsolationCheck, IsolationReason, IsolationStage, sanitizeDiagnostic } from './isolation-diagnostics';
function fail(stage: IsolationStage, reason: IsolationReason): never {
    throw new RunnerError('ISOLATION_BLOCKED', 'Isolation proof did not complete.', diagnostic(stage, reason));
}
export function verifyMounts(mounts: string) {
    const entries = mounts.trim().split('\n').map(line => line.split(' '));
    for (const destination of ['/', '/usr', '/bin', '/lib', '/lib64', '/runner', '/runtime/node']) {
        const mount = entries.find(fields => fields[4] === destination);
        if (!mount)
            fail('MOUNT_SETUP', 'MOUNT_REQUIRED_MISSING');
        if (!mount[5]?.split(',').includes('ro'))
            fail('MOUNT_SETUP', 'MOUNT_NOT_READ_ONLY');
    }
    if (!entries.some(fields => fields[4] === '/scratch' && fields[5]?.split(',').includes('rw')))
        fail('MOUNT_SETUP', 'SCRATCH_NOT_WRITABLE');
    for (const fields of entries) {
        const destination = fields[4] ?? '';
        if (['/usr', '/bin', '/lib', '/lib64', '/runner', '/runtime', '/target', '/electron'].some(root => destination === root || destination.startsWith(root + '/')) && !fields[5]?.split(',').includes('ro'))
            fail('MOUNT_SETUP', 'MOUNT_NOT_READ_ONLY');
    }
}
async function expectedNamespaces() {
    try {
        const expected = JSON.parse(await readFile('/scratch/expected-namespaces.json', 'utf8'));
        if (expected.version !== 1 || typeof expected.runId !== 'string' || !expected.runId || !expected.namespaces || !['pid', 'net', 'mnt', 'user', 'ipc'].every(name => typeof expected.namespaces[name] === 'string'))
            throw new Error();
        return expected as {
            version: 1;
            runId: string;
            namespaces: Record<string, string>;
        };
    }
    catch {
        return fail('PROOF_VALIDATION', 'PROOF_MALFORMED');
    }
}
export async function proveInsideSandbox() {
    const checks = emptyChecks();
    async function check(stage: IsolationStage, fallback: IsolationReason, action: () => Promise<void>) {
        try {
            await action();
            checks.find(item => item.stage === stage)!.status = 'PASS';
        }
        catch (error) {
            const reported = error instanceof RunnerError && error.diagnostic ? sanitizeDiagnostic(error.diagnostic) : undefined;
            throw new RunnerError('ISOLATION_BLOCKED', 'Isolation proof did not complete.', diagnostic(stage, reported?.reasonCode ?? fallback, checks));
        }
    }
    // Reaching this JavaScript proves the proof executable and its loader ran;
    // this is not a claim about Electron, Xvfb or other future binaries.
    checks.find(item => item.stage === 'BINARY_LIBRARY_AVAILABILITY')!.status = 'PASS';
    const outside = await expectedNamespaces();
    await check('NAMESPACE_CREATION', 'NAMESPACE_INSPECTION_FAILED', async () => {
        for (const name of ['pid', 'net', 'mnt', 'user', 'ipc'])
            if (await readlink(`/proc/self/ns/${name}`) === outside.namespaces[name])
                fail('NAMESPACE_CREATION', 'NAMESPACE_IDENTITY_MISMATCH');
        if (await readlink('/proc/1/ns/pid') !== await readlink('/proc/self/ns/pid'))
            fail('NAMESPACE_CREATION', 'NAMESPACE_IDENTITY_MISMATCH');
    });
    await check('MOUNT_SETUP', 'MOUNT_INSPECTION_FAILED', async () => verifyMounts(await readFile('/proc/self/mountinfo', 'utf8')));
    await check('PRIVATE_LOOPBACK_NETWORKING', 'LOOPBACK_INSPECTION_FAILED', async () => {
        const interfaces = (await readFile('/proc/net/dev', 'utf8')).split('\n').slice(2).map(line => line.split(':')[0]?.trim()).filter(Boolean);
        if (interfaces.length !== 1 || interfaces[0] !== 'lo')
            fail('PRIVATE_LOOPBACK_NETWORKING', 'LOOPBACK_INTERFACE_INVALID');
        try {
            await new Promise<void>((resolve, reject) => {
                const server = net.createServer();
                server.once('error', reject);
                server.listen(0, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()));
            });
        }
        catch {
            fail('PRIVATE_LOOPBACK_NETWORKING', 'LOOPBACK_BIND_DENIED');
        }
    });
    await check('FILESYSTEM_CONTAINMENT', 'CONTAINMENT_INSPECTION_FAILED', async () => {
        for (const location of ['/home', '/root', '/run'])
            if ((await readdir(location)).length)
                fail('FILESYSTEM_CONTAINMENT', 'HOST_DIRECTORY_VISIBLE');
        verifyIsolatedEnvironment(process.env, process.cwd());
        for (const file of ['/etc/.pl-runner-probe', '/runner/.pl-runner-probe', '/usr/.pl-runner-probe']) {
            try {
                await writeFile(file, 'probe', { flag: 'wx' });
            }
            catch (error) {
                // Missing paths, EEXIST and unrelated failures do not prove a
                // read-only boundary. The mount proof already required ro.
                if ((error as NodeJS.ErrnoException).code === 'EROFS')
                    continue;
                fail('FILESYSTEM_CONTAINMENT', 'WRITE_CONTAINMENT_FAILED');
            }
            fail('FILESYSTEM_CONTAINMENT', 'WRITE_CONTAINMENT_FAILED');
        }
    });
    checks.find(item => item.stage === 'PROOF_VALIDATION')!.status = 'PASS';
    return checks;
}
export async function writeProofReport() {
    let runId = '';
    let checks: IsolationCheck[] = emptyChecks();
    let result;
    try {
        runId = (await expectedNamespaces()).runId;
        checks = await proveInsideSandbox();
        result = { version: 1, runId, status: 'PROBE_VERIFIED', checks };
    }
    catch (error) {
        const safe = error instanceof RunnerError && error.diagnostic ? sanitizeDiagnostic(error.diagnostic) : diagnostic('PROOF_VALIDATION', 'PROOF_PROCESS_FAILED');
        result = { version: 1, runId, status: 'BLOCKED', checks: safe.checks, diagnostic: safe };
        process.exitCode = 3;
    }
    try {
        await writeFile('/scratch/isolation-proof.json', JSON.stringify(result), { mode: 0o600 });
    }
    catch {
        process.stderr.write('PL_ISOLATION_PROOF_WRITE_FAILED\n');
        process.exitCode = 3;
    }
}
if (require.main === module)
    void writeProofReport();
