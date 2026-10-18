import { assertApprovedLaunchTarget } from './launch-authorization';
import { publicSmokeReport } from './smoke-contract';
import path from 'node:path';
import { readFile, realpath, access, writeFile } from 'node:fs/promises';
import { TargetConfig, validateConfig } from './config';
import { doctor } from './doctor';
import { isolationPreflight, sandboxArgs, BWRAP } from './isolation';
import { cleanupScratch, createScratch, initializeScratchRoot, markScratchBusy, markScratchIdle } from './scratch';
import { lifecycleError, RunnerError } from './errors';
import { prepareRuntime } from './runtime-files';
import { spawnOwned, stopOwned, waitFor } from './processes';
import { validateSessionResult } from './lifecycle-diagnostics';
import { SmokeReport } from './smoke-contract';
import { RegistryInventory } from './coverage';
export interface LaunchObservation {
    runId?: string;
    build?: {
        sourceDigest: string;
        assetDigest: string;
        desktopDigest: string;
        snapshotDigest: string;
        provenance: 'NOT_PROVEN';
    };
    smoke?: SmokeReport;
    shutdownComplete?: boolean;
    cleanupVerified?: boolean;
    retained?: boolean;
    appVersion?: string;
    registry?: RegistryInventory;
}
async function readValidatedBuild(file: string): Promise<NonNullable<LaunchObservation['build']>> {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw lifecycleError('RESULT_INVALID');
    const value = raw as Record<string, unknown>;
    if (!['sourceDigest', 'assetDigest', 'desktopDigest', 'snapshotDigest'].every(key => typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key] as string)))
        throw lifecycleError('RESULT_INVALID');
    return { sourceDigest: value.sourceDigest as string, assetDigest: value.assetDigest as string, desktopDigest: value.desktopDigest as string, snapshotDigest: value.snapshotDigest as string, provenance: 'NOT_PROVEN' };
}
// Default lifecycle is non-mutating. Explicit smoke mode additionally gates
// scratch-only actions behind fresh readiness, isolation and listener ownership.
export async function launch(config: TargetConfig, runnerRoot: string, smoke = false, observation?: LaunchObservation) {
    validateConfig(config);
    if (typeof smoke !== 'boolean')
        throw new RunnerError('CONFIG', 'Unsupported run mode.');
    if (smoke)
        await assertApprovedLaunchTarget(config.targetRoot, runnerRoot);
    const checked = await doctor(config);
    const scratch = await createScratch(await initializeScratchRoot(runnerRoot));
    if (observation)
        observation.runId = scratch.nonce;
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
        if (observation) {
            const stagedPackage = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8')) as {
                version?: unknown;
            };
            if (typeof stagedPackage.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(stagedPackage.version) || stagedPackage.version.length > 32)
                throw lifecycleError('RESULT_INVALID');
            observation.appVersion = stagedPackage.version;
        }
        let build: NonNullable<LaunchObservation['build']> | undefined;
        if (observation) {
            build = await readValidatedBuild(path.join(scratch.directory, 'build-evidence.json'));
            observation.build = build;
        }
        if (smoke)
            await writeFile(path.join(scratch.directory, 'inputs/smoke-plan.json'), JSON.stringify({ version: 1, runId: scratch.nonce, suite: 'batch-2-v1', isolationReview: 'PENDING' }), { flag: 'wx', mode: 0o600 });
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
            await waitFor(async () => owned!.child.exitCode !== null || owned!.child.signalCode !== null, smoke ? 150000 : 50000);
        }
        catch {
            throw lifecycleError('LIFECYCLE_TIMEOUT');
        }
        let result;
        try {
            result = validateSessionResult(JSON.parse(await readFile(path.join(scratch.directory, 'state', 'session-result.json'), 'utf8')), scratch.nonce, owned.child.exitCode, smoke);
        }
        catch {
            throw lifecycleError('RESULT_INVALID');
        }
        cleanupAllowed = result.shutdownComplete;
        if (observation) {
            observation.shutdownComplete = result.shutdownComplete;
            observation.smoke = result.smoke;
        }
        if (result.status === 'BLOCKED') {
            const error = lifecycleError(result.diagnostic!.reasonCode);
            error.smoke = result.smoke;
            throw error;
        }
        if (!build)
            build = await readValidatedBuild(path.join(scratch.directory, 'build-evidence.json'));
        return { status: 'LIFECYCLE_VERIFIED', guiMutations: smoke ? 'SCRATCH_ONLY' : 'DISABLED', scope: smoke ? 'batch-2-smoke' : 'boot-and-stop-only', ...(result.smoke ? { smoke: publicSmokeReport(result.smoke) } : {}), isolationReview: 'PENDING', build: { sourceDigest: build.sourceDigest, assetDigest: build.assetDigest, snapshotDigest: build.snapshotDigest, desktopDigest: build.desktopDigest, provenance: 'NOT_PROVEN' } };
    }
    catch (error) {
        if (!cleanupAllowed && error instanceof RunnerError && error.lifecycle) {
            const retained = lifecycleError(error.lifecycle.reasonCode, true);
            retained.smoke = error.smoke;
            throw retained;
        }
        throw error;
    }
    finally {
        if (owned) {
            try {
                await stopOwned(owned);
            }
            catch {
                cleanupAllowed = false;
                if (observation) {
                    observation.shutdownComplete = false;
                    observation.retained = true;
                }
                throw lifecycleError('OWNED_SHUTDOWN_FAILED', true);
            }
        }
        if (lease && cleanupAllowed) {
            try {
                markScratchIdle(scratch);
            }
            catch {
                if (observation)
                    observation.retained = true;
                throw lifecycleError('OWNED_SHUTDOWN_FAILED', true);
            }
        }
        if (cleanupAllowed) {
            try {
                await cleanupScratch(scratch);
                if (observation)
                    observation.cleanupVerified = true;
            }
            catch {
                throw lifecycleError('SCRATCH_CLEANUP_FAILED', true);
            }
        }
        // Retain both the lease and scratch if inner shutdown was not verified.
        else if (observation)
            observation.retained = true;
    }
}
