import path from 'node:path';
import { readFile, realpath, access } from 'node:fs/promises';
import { TargetConfig, validateConfig } from './config';
import { doctor } from './doctor';
import { isolationPreflight, sandboxArgs, BWRAP } from './isolation';
import { cleanupScratch, createScratch, initializeScratchRoot, markScratchBusy, markScratchIdle } from './scratch';
import { lifecycleError, RunnerError } from './errors';
import { prepareRuntime } from './runtime-files';
import { spawnOwned, stopOwned, waitFor } from './processes';
import { validateSessionResult } from './lifecycle-diagnostics';
// Internal integration only. The CLI remains gated until separate owner approval.
export async function launch(config: TargetConfig, runnerRoot: string) {
    validateConfig(config);
    const checked = await doctor(config);
    const scratch = await createScratch(await initializeScratchRoot(runnerRoot));
    let owned;
    let lease = false;
    let cleanupAllowed = true;
    try {
        await isolationPreflight(scratch, runnerRoot);
        try {
            await access('/usr/bin/Xvfb');
        }
        catch {
            throw lifecycleError('DISPLAY_STARTUP_FAILED');
        }
        const target = await prepareRuntime(config, scratch);
        const args = [...sandboxArgs(scratch.directory, path.join(runnerRoot, 'dist'), await realpath(process.execPath)),
            '--ro-bind', target, '/target', '--ro-bind', path.dirname(checked.electronExecutable), '/electron',
            '--', '/runtime/node', '/runner/sandbox-session.js'];
        markScratchBusy(scratch);
        lease = true;
        cleanupAllowed = false;
        try {
            owned = await spawnOwned(BWRAP, args, { cwd: runnerRoot, env: { PATH: '/usr/bin:/bin' } });
        }
        catch (error) {
            if (error instanceof RunnerError && error.code === 'PROCESS_FAILED')
                cleanupAllowed = true;
            throw lifecycleError('ELECTRON_STARTUP_FAILED');
        }
        try {
            await waitFor(async () => owned!.child.exitCode !== null || owned!.child.signalCode !== null, 50000);
        }
        catch {
            throw lifecycleError('LIFECYCLE_TIMEOUT');
        }
        let result;
        try {
            result = validateSessionResult(JSON.parse(await readFile(path.join(scratch.directory, 'state', 'session-result.json'), 'utf8')), scratch.nonce, owned.child.exitCode);
        }
        catch {
            throw lifecycleError('RESULT_INVALID');
        }
        cleanupAllowed = result.shutdownComplete;
        if (result.status === 'BLOCKED')
            throw lifecycleError(result.diagnostic!.reasonCode);
        const build = JSON.parse(await readFile(path.join(scratch.directory, 'build-evidence.json'), 'utf8'));
        if (!['sourceDigest', 'assetDigest', 'desktopDigest', 'snapshotDigest'].every(key => typeof build[key] === 'string' && /^[a-f0-9]{64}$/.test(build[key])))
            throw lifecycleError('RESULT_INVALID');
        return { status: 'LIFECYCLE_VERIFIED', guiMutations: 'DISABLED', scope: 'boot-and-stop-only', isolationReview: 'PENDING', build: { sourceDigest: build.sourceDigest, assetDigest: build.assetDigest, snapshotDigest: build.snapshotDigest, desktopDigest: build.desktopDigest, provenance: 'NOT_PROVEN' } };
    }
    catch (error) {
        if (!cleanupAllowed && error instanceof RunnerError && error.lifecycle)
            throw lifecycleError(error.lifecycle.reasonCode, true);
        throw error;
    }
    finally {
        if (owned) {
            try {
                await stopOwned(owned);
            }
            catch {
                cleanupAllowed = false;
                throw lifecycleError('OWNED_SHUTDOWN_FAILED', true);
            }
        }
        if (lease && cleanupAllowed) {
            try {
                markScratchIdle(scratch);
            }
            catch {
                throw lifecycleError('OWNED_SHUTDOWN_FAILED', true);
            }
        }
        if (cleanupAllowed) {
            try {
                await cleanupScratch(scratch);
            }
            catch {
                throw lifecycleError('SCRATCH_CLEANUP_FAILED', true);
            }
        }
        // Retain both the lease and scratch if inner shutdown was not verified.
    }
}
