import path from 'node:path';
import { readFile, realpath, access } from 'node:fs/promises';
import { TargetConfig, validateConfig } from './config';
import { doctor } from './doctor';
import { isolationPreflight, sandboxArgs, BWRAP } from './isolation';
import { cleanupScratch, createScratch, initializeScratchRoot, markScratchBusy, markScratchIdle } from './scratch';
import { RunnerError } from './errors';
import { prepareRuntime } from './runtime-files';
import { spawnOwned, stopOwned, waitFor } from './processes';
export async function launch(config: TargetConfig, runnerRoot: string) {
    validateConfig(config);
    const checked = await doctor(config);
    const scratch = await createScratch(await initializeScratchRoot(runnerRoot));
    let owned;
    try {
        await isolationPreflight(scratch, runnerRoot);
        // No host display access is inherited. Missing prerequisites fail closed.
        try {
            await access('/usr/bin/Xvfb');
        }
        catch {
            throw new RunnerError('LAUNCH_BLOCKED', 'Private Xvfb display is unavailable; no target launched.');
        }
        const target = await prepareRuntime(config, scratch);
        const args = [...sandboxArgs(scratch.directory, path.join(runnerRoot, 'dist'), await realpath(process.execPath)),
            '--ro-bind', target, '/target', '--ro-bind', path.dirname(checked.electronExecutable), '/electron',
            '--', '/runtime/node', '/runner/sandbox-session.js'];
        owned = await spawnOwned(BWRAP, args, { cwd: runnerRoot, env: { PATH: '/usr/bin:/bin' } });
        markScratchBusy(scratch);
        await waitFor(async () => owned!.child.exitCode !== null || owned!.child.signalCode !== null, 35000);
        if (owned.child.exitCode !== 0)
            throw new RunnerError('PROCESS_FAILED', 'Isolated lifecycle did not complete; raw app output withheld.');
        const result = JSON.parse(await readFile(path.join(scratch.directory, 'session-result.json'), 'utf8'));
        if (result.status !== 'LIFECYCLE_VERIFIED' || result.guiMutations !== false)
            throw new RunnerError('OWNERSHIP', 'Lifecycle evidence is incomplete.');
        return { status: 'LIFECYCLE_VERIFIED', guiMutations: 'DISABLED', scope: 'boot-and-stop-only', isolationReview: 'PENDING' };
    }
    finally {
        if (owned) {
            await stopOwned(owned);
            markScratchIdle(scratch);
        }
        await cleanupScratch(scratch);
    }
}
