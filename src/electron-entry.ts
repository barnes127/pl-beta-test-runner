import { runSmokeScenarios } from './smoke';
import { validateSmokePlan, validateSmokePermit } from './smoke-contract';
// Electron-only entry, selected by the /target package wrapper. No app source edits.
import { waitFor } from './processes';
import fs from 'node:fs';
import os from 'node:os';
import { initializeElectronPaths, inspectWebPreferences, verifySuiteWindow, verifyPreloadBridge } from './electron-contract';
import { verifyStagedPreloadDeclaration } from './preload-contract';
import { RunnerError } from './errors';
import { sanitizeLifecycle, LifecycleReason } from './lifecycle-diagnostics';
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
        if (smokeRequested) {
            try {
                validateSmokePlan(JSON.parse(fs.readFileSync('/isolation-inputs/smoke-plan.json', 'utf8')), runId);
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
                        const report = await runSmokeScenarios(contents, runId, verifySession);
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
