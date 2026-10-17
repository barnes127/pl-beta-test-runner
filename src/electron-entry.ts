// Electron-only entry, selected by the /target package wrapper. No app source edits.
import { waitFor } from './processes';
import fs from 'node:fs';
import os from 'node:os';
import { initializeElectronPaths, inspectWebPreferences } from './electron-contract';
import { RunnerError } from './errors';
import { sanitizeLifecycle, LifecycleReason } from './lifecycle-diagnostics';
const { app } = require('electron');
function blocked(reason: LifecycleReason) {
    try {
        fs.writeFileSync('/scratch/electron-status.json', JSON.stringify({ status: 'BLOCKED', diagnostic: { reasonCode: reason } }), { mode: 0o600 });
    }
    finally {
        app.exit(3);
    }
}
try {
    process.once('uncaughtException', () => blocked('ELECTRON_STARTUP_FAILED'));
    process.once('unhandledRejection', () => blocked('ELECTRON_STARTUP_FAILED'));
    initializeElectronPaths(app, os.homedir(), process.versions.electron ?? '');
    app.on('web-contents-created', (_event: unknown, contents: any) => {
        contents.once('did-fail-load', () => blocked('ELECTRON_STARTUP_FAILED'));
        contents.once('render-process-gone', () => blocked('ELECTRON_STARTUP_FAILED'));
        contents.once('did-finish-load', async () => {
            try {
                inspectWebPreferences(contents);
                await waitFor(async () => Boolean(await contents.executeJavaScript(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'New Project' && b.getBoundingClientRect().width > 0)`)), 10000);
                const bridge = await contents.executeJavaScript(`typeof window.plMenu?.onMenuAction === 'function'`);
                if (!bridge) {
                    blocked('PRELOAD_BRIDGE_MISSING');
                    return;
                }
                fs.writeFileSync('/scratch/electron-status.json', JSON.stringify({ status: 'READY', securityVerified: true, preloadVerified: true, electron: '41.10.6' }), { mode: 0o600 });
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
    catch {
        blocked('TARGET_IMPORT_FAILED');
    }
}
catch (error) {
    blocked(error instanceof RunnerError && error.lifecycle ? sanitizeLifecycle(error.lifecycle).reasonCode : 'ELECTRON_BOOTSTRAP_FAILED');
}
