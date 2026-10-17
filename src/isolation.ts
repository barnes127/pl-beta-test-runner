import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnOwned, stopOwned, waitFor } from './processes';
import { Scratch, validateScratch, markScratchBusy, markScratchIdle } from './scratch';
import { RunnerError } from './errors';
export const BWRAP = '/usr/bin/bwrap';
export function sandboxArgs(directory: string, runnerRoot: string) {
    return ['--unshare-all', '--die-with-parent', '--new-session',
        '--ro-bind', '/', '/', '--tmpfs', '/home', '--tmpfs', '/root', '--tmpfs', '/tmp',
        '--tmpfs', '/run', '--proc', '/proc', '--dev', '/dev', '--bind', directory, '/scratch',
        '--ro-bind', runnerRoot, '/runner', '--clearenv',
        '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'HOME', '/scratch/home',
        '--setenv', 'XDG_CONFIG_HOME', '/scratch/config', '--setenv', 'XDG_CACHE_HOME', '/scratch/cache',
        '--setenv', 'XDG_DATA_HOME', '/scratch/data', '--setenv', 'TMPDIR', '/scratch/tmp',
        '--chdir', '/scratch'];
}
export async function isolationPreflight(scratch: Scratch, runnerRoot: string) {
    const directory = await validateScratch(scratch);
    for (const child of ['home', 'config', 'cache', 'data', 'tmp'])
        await mkdir(path.join(directory, child), { mode: 0o700 });
    // Fail closed on missing bwrap, network setup errors, or ineffective mounts.
    // The shell receives a fixed script; no scenario/config string interpolation.
    const args = [...sandboxArgs(directory, runnerRoot), '--', '/bin/sh', '-c',
        'set -eu; test "$HOME" = /scratch/home; test -z "$(ls -A /home)"; test -z "$(ls -A /root)"; if touch /runner/.isolation-write-probe 2>/dev/null; then exit 9; fi; if touch /etc/.pl-runner-write-probe 2>/dev/null; then exit 10; fi; printf isolated > /scratch/probe-result'];
    await writeFile(path.join(directory, 'probe-result'), 'pending', { flag: 'wx', mode: 0o600 });
    let child;
    try {
        child = await spawnOwned(BWRAP, args, { cwd: runnerRoot, env: { PATH: '/usr/bin:/bin' } });
        markScratchBusy(scratch);
        await waitFor(async () => child!.child.exitCode !== null || child!.child.signalCode !== null, 3000);
        if (child.child.exitCode !== 0 || await readFile(path.join(directory, 'probe-result'), 'utf8') !== 'isolated')
            throw new Error();
        return { status: 'PREFLIGHT_VERIFIED' as const, mechanism: 'bubblewrap', reviewed: false as const };
    }
    catch {
        throw new RunnerError('ISOLATION_BLOCKED', 'Unprivileged filesystem and network isolation could not be demonstrated. No target was launched.');
    }
    finally {
        if (child) {
            await stopOwned(child);
            markScratchIdle(scratch);
        }
    }
}
