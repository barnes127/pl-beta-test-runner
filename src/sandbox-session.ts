import { existsSync } from 'node:fs';
import { SmokeReport, validateSmokePlan, validateSmokeReport } from './smoke-contract';
import { access, readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { proveInsideSandbox, verifyApplicationMounts } from './isolation-proof';
import { spawnOwned, stopOwned, waitFor, assertPortFree, assertListenerOwner, processIdentity, OwnedProcess } from './processes';
import { lifecycleError, RunnerError } from './errors';
import { SessionResult, sanitizeLifecycle } from './lifecycle-diagnostics';
export async function assertNoRemainingProcesses() {
    for (const name of await readdir('/proc')) {
        if (!/^\d+$/.test(name) || Number(name) === 1 || Number(name) === process.pid)
            continue;
        let identity;
        try {
            identity = await processIdentity(Number(name));
        }
        catch {
            throw lifecycleError('UNEXPECTED_PROCESS_REMAINS');
        }
        if (identity.state !== 'Z')
            throw lifecycleError('UNEXPECTED_PROCESS_REMAINS');
    }
}
export async function session(smokeRequested = existsSync('/isolation-inputs/smoke-plan.json')) {
    let runId = '';
    let shutdownComplete = false;
    let failure: RunnerError | undefined;
    const owned: OwnedProcess[] = [];
    let electron: OwnedProcess | undefined;
    let ready = false;
    let mutationsEnabled = false;
    let smoke: SmokeReport | undefined;
    try {
        runId = JSON.parse(await readFile('/isolation-inputs/expected-namespaces.json', 'utf8')).runId;
        if (smokeRequested) {
            try {
                validateSmokePlan(JSON.parse(await readFile('/isolation-inputs/smoke-plan.json', 'utf8')), runId);
            }
            catch {
                throw lifecycleError('SMOKE_GATE_INVALID');
            }
        }
        try {
            await proveInsideSandbox();
            verifyApplicationMounts(await readFile('/proc/self/mountinfo', 'utf8'));
        }
        catch {
            throw lifecycleError('FINAL_CONTAINMENT_FAILED');
        }
        try {
            await access('/usr/bin/Xvfb');
        }
        catch {
            throw lifecycleError('DISPLAY_STARTUP_FAILED');
        }
        await assertPortFree(5173);
        await assertPortFree(38741);
        const env = { ...process.env, DISPLAY: ':97' };
        try {
            const display = await spawnOwned('/usr/bin/Xvfb', [':97', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { cwd: '/scratch', env: process.env });
            owned.push(display);
            await waitFor(async () => {
                if (display.child.exitCode !== null || display.child.signalCode !== null)
                    throw new Error();
                try {
                    await access('/tmp/.X11-unix/X97');
                    return true;
                }
                catch {
                    return false;
                }
            }, 5000);
        }
        catch {
            throw lifecycleError('DISPLAY_STARTUP_FAILED');
        }
        let renderer: OwnedProcess;
        try {
            renderer = await spawnOwned('/runtime/node', ['/runner/renderer-server.js'], { cwd: '/scratch', env });
            owned.push(renderer);
            await waitFor(async () => {
                if (renderer.child.exitCode !== null || renderer.child.signalCode !== null)
                    throw new Error();
                try {
                    await assertListenerOwner(5173, renderer.pid, renderer.start);
                    return true;
                }
                catch {
                    return false;
                }
            }, 5000);
        }
        catch {
            throw lifecycleError('RENDERER_STARTUP_FAILED');
        }
        try {
            electron = await spawnOwned('/electron/electron', ['/target'], { cwd: '/scratch', env });
            owned.push(electron);
        }
        catch {
            throw lifecycleError('ELECTRON_STARTUP_FAILED');
        }
        await waitFor(async () => {
            let state;
            try {
                state = JSON.parse(await readFile('/scratch/electron-status.json', 'utf8'));
            }
            catch {
                if (electron!.child.exitCode !== null || electron!.child.signalCode !== null)
                    throw lifecycleError('ELECTRON_STARTUP_FAILED');
                return false;
            }
            if (state.status === 'BLOCKED')
                throw lifecycleError(sanitizeLifecycle(state.diagnostic).reasonCode);
            if (state.status !== 'READY' || state.securityVerified !== true || state.preloadVerified !== true || state.preloadDeclaredVerified !== true || state.preloadBridgeVerified !== true || !['PRESENT', 'OMITTED_DECLARATION_VERIFIED'].includes(state.preloadInspection) || state.electron !== '41.10.6')
                return false;
            try {
                await assertListenerOwner(38741, electron!.pid, electron!.start);
                await assertListenerOwner(5173, renderer.pid, renderer.start);
            }
            catch {
                throw lifecycleError('RPC_OWNERSHIP_FAILED');
            }
            return true;
        }, 15000);
        ready = true;
        if (smokeRequested) {
            // Permit follows actual Electron readiness, exact listener ownership
            // and a fresh full filesystem/network proof in this namespace.
            await proveInsideSandbox();
            verifyApplicationMounts(await readFile('/proc/self/mountinfo', 'utf8'));
            await assertListenerOwner(5173, renderer.pid, renderer.start);
            await assertListenerOwner(38741, electron.pid, electron.start);
            await writeFile('/scratch/smoke-permit.tmp', JSON.stringify({ version: 1, runId }), { flag: 'wx', mode: 0o600 });
            await rename('/scratch/smoke-permit.tmp', '/scratch/smoke-permit.json');
            mutationsEnabled = true;
            try {
                await waitFor(async () => {
                    if (electron!.child.exitCode !== null || electron!.child.signalCode !== null)
                        throw lifecycleError('ELECTRON_EXIT_FAILED');
                    let text;
                    try {
                        text = await readFile('/scratch/smoke-result.json', 'utf8');
                    }
                    catch (error) {
                        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                            return false;
                        throw lifecycleError('SMOKE_GATE_INVALID');
                    }
                    try {
                        smoke = validateSmokeReport(JSON.parse(text), runId);
                    }
                    catch {
                        throw lifecycleError('SMOKE_GATE_INVALID');
                    }
                    return true;
                }, 105000);
            }
            catch (error) {
                throw error instanceof RunnerError && error.lifecycle ? error : lifecycleError('SMOKE_TIMEOUT');
            }
            if (smoke!.status !== 'PASS')
                throw lifecycleError('SMOKE_SCENARIO_FAILED');
        }
    }
    catch (error) {
        failure = error instanceof RunnerError && error.lifecycle ? error : lifecycleError('ELECTRON_STARTUP_FAILED');
    }
    finally {
        if (electron) {
            try {
                try {
                    await writeFile('/scratch/stop-electron', 'stop', { mode: 0o600 });
                }
                catch {
                    throw lifecycleError('STOP_REQUEST_FAILED');
                }
                await waitFor(async () => electron!.child.exitCode !== null || electron!.child.signalCode !== null, 3000);
                if (ready && (electron.child.exitCode !== 0 || electron.child.signalCode !== null))
                    failure = lifecycleError('ELECTRON_EXIT_FAILED');
            }
            catch (error) {
                failure = error instanceof RunnerError && error.lifecycle ? error : lifecycleError('ELECTRON_SHUTDOWN_TIMEOUT');
            }
        }
        let stopFailed = false;
        for (const child of [...owned].reverse())
            try {
                await stopOwned(child, 500);
            }
            catch {
                stopFailed = true;
            }
        if (stopFailed)
            failure = lifecycleError('OWNED_SHUTDOWN_FAILED');
        else {
            try {
                try {
                    await assertPortFree(5173);
                    await assertPortFree(38741);
                }
                catch {
                    throw lifecycleError('PORT_RELEASE_FAILED');
                }
                await assertNoRemainingProcesses();
                // No app or host display process remains before rechecking isolation.
                await proveInsideSandbox();
                verifyApplicationMounts(await readFile('/proc/self/mountinfo', 'utf8'));
                shutdownComplete = true;
            }
            catch (error) {
                failure = error instanceof RunnerError && error.lifecycle ? error : lifecycleError('FINAL_CONTAINMENT_FAILED');
            }
        }
    }
    const result: SessionResult = { version: 1, runId, status: failure ? 'BLOCKED' : 'LIFECYCLE_VERIFIED', shutdownComplete, guiMutations: mutationsEnabled, ...(smoke ? { smoke } : {}), ...(failure ? { diagnostic: failure.lifecycle! } : {}) };
    await writeFile('/scratch/session-result.json', JSON.stringify(result), { mode: 0o600 });
    if (failure)
        process.exitCode = 3;
}
if (require.main === module)
    session().catch(() => { process.exitCode = 3; });
