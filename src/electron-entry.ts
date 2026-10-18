import { runSmokeScenarios } from './smoke';
import { validateSmokePlan, validateSmokePermit } from './smoke-contract';
// Electron-only entry, selected by the /target package wrapper. No app source edits.
import { assertListenerOwner, processIdentity, waitFor } from './processes';
import fs from 'node:fs';
import os from 'node:os';
import { initializeElectronPaths, inspectWebPreferences, verifySuiteWindow, verifyPreloadBridge } from './electron-contract';
import { verifyStagedPreloadDeclaration } from './preload-contract';
import { RunnerError } from './errors';
import { sanitizeLifecycle, LifecycleReason } from './lifecycle-diagnostics';
import { verifyApplicationMounts } from './isolation-proof';
import { captureFailedUi, omittedScreenshot, verifySyntheticFixtures } from './screenshot';
const electron = require('electron');
const { app, BrowserWindow } = electron;
function blocked(reason: LifecycleReason) {
    try {
        fs.writeFileSync('/scratch/electron-status.json', JSON.stringify({ status: 'BLOCKED', diagnostic: { reasonCode: reason } }), { mode: 0o600 });
    }
    finally {
        app.exit(3);
    }
}
async function boot() {
    try {
        process.once('uncaughtException', error => blocked(error instanceof RunnerError && error.lifecycle ? sanitizeLifecycle(error.lifecycle).reasonCode : 'ELECTRON_STARTUP_FAILED'));
        process.once('unhandledRejection', error => blocked(error instanceof RunnerError && error.lifecycle ? sanitizeLifecycle(error.lifecycle).reasonCode : 'ELECTRON_STARTUP_FAILED'));
        initializeElectronPaths(app, os.homedir(), process.versions.electron ?? '');
        const runId = JSON.parse(fs.readFileSync('/isolation-inputs/expected-namespaces.json', 'utf8')).runId;
        await verifyStagedPreloadDeclaration('/target', '/isolation-inputs/preload-contract.json', runId);
        const smokeRequested = fs.existsSync('/isolation-inputs/smoke-plan.json');
        let evidenceProbe = false;
        if (smokeRequested) {
            try {
                evidenceProbe = validateSmokePlan(JSON.parse(fs.readFileSync('/isolation-inputs/smoke-plan.json', 'utf8')), runId).evidenceProbe;
            }
            catch {
                blocked('SMOKE_GATE_INVALID');
                return;
            }
        }
        let smokeStarted = false;
        app.on('web-contents-created', (_event: unknown, contents: any) => {
            contents.once('preload-error', () => blocked('PRELOAD_EXECUTION_FAILED'));
            contents.once('did-fail-load', () => blocked('ELECTRON_STARTUP_FAILED'));
            contents.once('render-process-gone', () => blocked('ELECTRON_STARTUP_FAILED'));
            contents.once('did-finish-load', async () => {
                try {
                    verifySuiteWindow(contents, BrowserWindow);
                    await verifyStagedPreloadDeclaration('/target', '/isolation-inputs/preload-contract.json', runId);
                    const preloadInspection = inspectWebPreferences(contents, true);
                    await waitFor(async () => Boolean(await contents.executeJavaScript(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'New Project' && b.getBoundingClientRect().width > 0)`)), 10000);
                    const bridge = await contents.executeJavaScript(`typeof window.plMenu?.onMenuAction === 'function'`);
                    verifyPreloadBridge(bridge);
                    fs.writeFileSync('/scratch/electron-status.json', JSON.stringify({ status: 'READY', securityVerified: true, preloadVerified: true, preloadDeclaredVerified: true, preloadBridgeVerified: true, preloadInspection, electron: '41.10.6' }), { mode: 0o600 });
                    if (smokeRequested) {
                        if (smokeStarted) {
                            blocked('SMOKE_GATE_INVALID');
                            return;
                        }
                        smokeStarted = true;
                        await waitFor(async () => fs.existsSync('/scratch/smoke-permit.json'), 15000);
                        const verifySession = async () => {
                            validateSmokePermit(JSON.parse(fs.readFileSync('/scratch/smoke-permit.json', 'utf8')), runId);
                            verifySuiteWindow(contents, BrowserWindow);
                            await verifyStagedPreloadDeclaration('/target', '/isolation-inputs/preload-contract.json', runId);
                            inspectWebPreferences(contents, true);
                            verifyPreloadBridge(await contents.executeJavaScript(`typeof window.plMenu?.onMenuAction === 'function'`));
                        };
                        const report = await runSmokeScenarios(contents, runId, verifySession, evidenceProbe);
                        if (report.status === 'FAIL') {
                            const failedScenario = report.scenarios.find(item => item.status === 'FAIL')!.id;
                            let capture;
                            try {
                                const observedProbeFailure = report.trace?.some(item => item.target === 'BOOT_EVIDENCE_PROBE_CONTEXT_MISMATCH' && item.kind === 'ASSERTION' && item.outcome === 'FAIL' && item.actual === 'NOT_OBSERVED');
                                if (!evidenceProbe || failedScenario !== 'PL-QA-BOOT-001' || !observedProbeFailure) {
                                    capture = { record: omittedScreenshot(runId, failedScenario, 'OMITTED_SAFETY_GATE', 'CAPTURE_SCOPE_UNAPPROVED') };
                                }
                                else {
                                    const verifyCapture = async () => {
                                        await verifySession();
                                        if (BrowserWindow.fromWebContents(contents) !== window)
                                            throw new Error();
                                        const permit = validateSmokePermit(JSON.parse(fs.readFileSync('/scratch/smoke-permit.json', 'utf8')), runId);
                                        if (permit.electronPid !== process.pid || (await processIdentity(process.pid)).start !== permit.electronStart || process.env.DISPLAY !== ':97')
                                            throw new Error();
                                        await assertListenerOwner(38741, permit.electronPid, permit.electronStart);
                                        await assertListenerOwner(5173, permit.rendererPid, permit.rendererStart);
                                        verifyApplicationMounts(await fs.promises.readFile('/proc/self/mountinfo', 'utf8'));
                                        for (const location of ['/home', '/root', '/run'])
                                            if ((await fs.promises.readdir(location)).length)
                                                throw new Error();
                                        const interfaces = (await fs.promises.readFile('/proc/net/dev', 'utf8')).split('\n').slice(2).map(line => line.split(':')[0]?.trim()).filter(Boolean);
                                        if (interfaces.length !== 1 || interfaces[0] !== 'lo' || fs.existsSync('/scratch/stop-electron'))
                                            throw new Error();
                                        await verifySyntheticFixtures(runId);
                                        try {
                                            if ((await fs.promises.readdir('/scratch/home/PLProjects')).length !== 0)
                                                throw new Error();
                                        }
                                        catch (error) {
                                            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                                                throw error;
                                        }
                                    };
                                    const manifest = JSON.parse(fs.readFileSync('/isolation-inputs/preload-contract.json', 'utf8'));
                                    const window = BrowserWindow.fromWebContents(contents);
                                    capture = await captureFailedUi(contents, window, report, runId, verifyCapture, manifest.snapshotDigest, () => fs.existsSync('/scratch/stop-electron'));
                                }
                            }
                            catch {
                                capture = { record: omittedScreenshot(runId, failedScenario, 'OMITTED_SAFETY_GATE', 'SAFETY_CHECK_FAILED') };
                            }
                            if (typeof process.send === 'function') {
                                const payload = { kind: 'PL_BETA_SCREENSHOT_V1', record: capture.record, ...(capture.png ? { png: capture.png.toString('base64') } : {}) };
                                try {
                                    await Promise.race([new Promise<void>((resolve, reject) => process.send!(payload, error => error ? reject(error) : resolve())), new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error()), 2000))]);
                                }
                                catch { /* A missing IPC image is reported separately by the supervisor. */ }
                            }
                        }
                        const temporary = '/scratch/smoke-result.tmp';
                        fs.writeFileSync(temporary, JSON.stringify(report), { flag: 'wx', mode: 0o600 });
                        fs.renameSync(temporary, '/scratch/smoke-result.json');
                    }
                }
                catch (error) {
                    blocked(error instanceof RunnerError && error.lifecycle ? sanitizeLifecycle(error.lifecycle).reasonCode : 'UI_READY_TIMEOUT');
                }
            });
        });
        const timer = setInterval(() => {
            if (fs.existsSync('/scratch/stop-electron'))
                app.quit();
        }, 50);
        timer.unref();
        try {
            require('/target/apps/desktop/main.js');
        }
        catch (error) {
            blocked(error instanceof RunnerError && error.lifecycle ? sanitizeLifecycle(error.lifecycle).reasonCode : 'TARGET_IMPORT_FAILED');
        }
    }
    catch (error) {
        blocked(error instanceof RunnerError && error.lifecycle ? sanitizeLifecycle(error.lifecycle).reasonCode : 'ELECTRON_BOOTSTRAP_FAILED');
    }
}
void boot();
