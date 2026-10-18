import { spawn, ChildProcess } from 'node:child_process';
import { readFile, readdir, readlink } from 'node:fs/promises';
import net from 'node:net';
import { RunnerError } from './errors';
export interface OwnedProcess {
    child: ChildProcess;
    pid: number;
    start: string;
}
export async function processIdentity(pid: number) {
    try {
        const raw = await readFile(`/proc/${pid}/stat`, 'utf8');
        const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
        if (!fields[19] || !/^\d+$/.test(fields[19]))
            throw new Error();
        return { parent: Number(fields[1]), group: Number(fields[2]), session: Number(fields[3]), start: fields[19], state: fields[0] };
    }
    catch {
        throw new RunnerError('OWNERSHIP', 'Cannot prove process identity.');
    }
}
export async function spawnOwned(command: string, args: string[], options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stderrSink?: (chunk: Buffer) => void;
    ipc?: boolean;
}): Promise<OwnedProcess> {
    // No inherited environment, shell, stdin, stdout or stderr evidence.
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, detached: true,
        stdio: options.ipc ? ['ignore', 'ignore', 'ignore', 'ipc'] : options.stderrSink ? ['ignore', 'ignore', 'pipe'] : 'ignore' });
    if (options.stderrSink)
        child.stderr!.on('data', options.stderrSink);
    await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', () => reject(new RunnerError('PROCESS_FAILED', 'Owned process could not start.')));
    });
    try {
        const pid = child.pid!;
        const identity = await processIdentity(pid);
        if (identity.parent !== process.pid || identity.group !== pid || identity.session !== pid)
            throw new RunnerError('OWNERSHIP', 'Launched process does not own its expected process group.');
        return { child, pid, start: identity.start };
    }
    catch (error) {
        child.kill('SIGKILL');
        throw error;
    }
}
export async function waitFor(condition: () => Promise<boolean>, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let ready = false;
        try {
            ready = await Promise.race([condition(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new RunnerError('TIMEOUT', 'Startup readiness deadline exceeded.')), Math.max(1, deadline - Date.now())); })]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
        if (ready)
            return;
        await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(0, deadline - Date.now()))));
    }
    throw new RunnerError('TIMEOUT', 'Startup readiness deadline exceeded.');
}
async function liveGroupMembers(owned: OwnedProcess) {
    const members: number[] = [];
    for (const name of await readdir('/proc')) {
        if (!/^\d+$/.test(name))
            continue;
        let identity;
        try {
            identity = await processIdentity(Number(name));
        }
        catch {
            // A process may exit during enumeration. A visible but unreadable entry
            // is ambiguous and must not permit cleanup or signaling.
            try {
                await readFile(`/proc/${name}/stat`, 'utf8');
            }
            catch (error) {
                if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? ''))
                    continue;
            }
            throw new RunnerError('OWNERSHIP', 'Process group inspection is incomplete.');
        }
        if (identity.group !== owned.pid)
            continue;
        if (identity.session !== owned.pid || BigInt(identity.start) < BigInt(owned.start))
            throw new RunnerError('OWNERSHIP', 'Process group ownership is ambiguous.');
        if (identity.state !== 'Z')
            members.push(Number(name));
    }
    return members;
}
export async function stopOwned(owned: OwnedProcess, graceMs = 500) {
    let identity;
    try {
        identity = await processIdentity(owned.pid);
    }
    catch {
        if (owned.child.exitCode === null && owned.child.signalCode === null)
            throw new RunnerError('OWNERSHIP', 'Cannot safely stop an unidentified process.');
    }
    if (identity && (identity.start !== owned.start || identity.group !== owned.pid || identity.session !== owned.pid))
        throw new RunnerError('OWNERSHIP', 'Process identity changed; shutdown refused.');
    if ((await liveGroupMembers(owned)).length === 0) {
        await waitFor(async () => owned.child.exitCode !== null || owned.child.signalCode !== null, 1000);
        return;
    }
    try {
        process.kill(-owned.pid, 'SIGTERM');
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
            throw error;
    }
    const end = Date.now() + graceMs;
    while (Date.now() < end) {
        if ((await liveGroupMembers(owned)).length === 0) {
            await waitFor(async () => owned.child.exitCode !== null || owned.child.signalCode !== null, 1000);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    if ((await liveGroupMembers(owned)).length > 0) {
        try {
            process.kill(-owned.pid, 'SIGKILL');
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
                throw error;
        }
        await waitFor(async () => (await liveGroupMembers(owned)).length === 0, 1000);
        await waitFor(async () => owned.child.exitCode !== null || owned.child.signalCode !== null, 1000);
    }
}
export async function assertPortFree(port: number) {
    for (const host of ['0.0.0.0', '::']) {
        await new Promise<void>((resolve, reject) => {
            const server = net.createServer();
            let settled = false;
            const finish = (error?: RunnerError) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                error ? reject(error) : resolve();
            };
            const timer = setTimeout(() => {
                try {
                    server.close(() => { });
                }
                catch { }
                finish(new RunnerError('PORT_UNAVAILABLE', 'Listener probe deadline exceeded.'));
            }, 1000);
            // A transient bind probe must never retain an unsolicited connection.
            server.on('connection', socket => socket.destroy());
            server.once('error', (error: NodeJS.ErrnoException) => {
                if (host === '::' && error.code === 'EAFNOSUPPORT')
                    finish();
                else
                    finish(error.code === 'EADDRINUSE' ? new RunnerError('PORT_CONFLICT', 'Required listener port is already occupied.') : new RunnerError('PORT_UNAVAILABLE', 'Required listener port cannot be checked in this environment.'));
            });
            server.listen({ port, host, exclusive: true, ipv6Only: host === '::' }, () => server.close(error => finish(error ? new RunnerError('PORT_UNAVAILABLE', 'Port probe did not close cleanly.') : undefined)));
        });
    }
}
export async function assertNoExistingSuite() {
    try {
        for (const name of await readdir('/proc')) {
            if (!/^\d+$/.test(name))
                continue;
            let command: string;
            try {
                command = await readFile(`/proc/${name}/comm`, 'utf8');
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ESRCH')
                    continue;
                throw error;
            }
            if (/electron|pl-creators|vite/i.test(command))
                throw new RunnerError('OWNERSHIP', 'An existing Suite-related process makes launch ambiguous.');
        }
    }
    catch (error) {
        if (error instanceof RunnerError)
            throw error;
        throw new RunnerError('OWNERSHIP', 'Process inventory is unavailable; launch refused.');
    }
}
export async function assertListenerOwner(port: number, expectedPid: number, expectedStart: string) {
    try {
        if ((await processIdentity(expectedPid)).start !== expectedStart)
            throw new Error();
        const inodes = new Set<string>();
        for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
            for (const line of (await readFile(table, 'utf8')).trim().split('\n').slice(1)) {
                const cols = line.trim().split(/\s+/);
                if (Number.parseInt(cols[1]!.split(':')[1]!, 16) === port && cols[3] === '0A') {
                    if (cols[1]!.split(':')[0] !== '0100007F')
                        throw new Error();
                    inodes.add(cols[9]!);
                }
            }
        }
        if (inodes.size !== 1)
            throw new Error();
        const sockets = new Set<string>();
        for (const fd of await readdir(`/proc/${expectedPid}/fd`)) {
            try {
                sockets.add(await readlink(`/proc/${expectedPid}/fd/${fd}`));
            }
            catch { /* descriptor closed concurrently */ }
        }
        if ((await processIdentity(expectedPid)).start !== expectedStart || ![...inodes].every(inode => sockets.has(`socket:[${inode}]`)))
            throw new Error();
    }
    catch {
        throw new RunnerError('OWNERSHIP', 'Listener ownership is absent, ambiguous or unobservable.');
    }
}
