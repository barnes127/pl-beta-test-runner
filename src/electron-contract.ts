import { mkdirSync } from 'node:fs';
import { lifecycleError } from './errors';
export interface ElectronAppPaths {
    isReady(): boolean;
    isPackaged: boolean;
    getAppPath(): string;
    getPath(name: string): string;
    setPath(name: string, value: string): void;
    setAppLogsPath(value: string): void;
    commandLine: {
        hasSwitch(name: string): boolean;
    };
}
export function initializeElectronPaths(app: ElectronAppPaths, home: string, version: string, create = (directory: string) => mkdirSync(directory, { recursive: true, mode: 0o700 })) {
    if (version !== '41.10.6')
        throw lifecycleError('ELECTRON_VERSION_MISMATCH');
    if (app.isReady())
        throw lifecycleError('ELECTRON_ALREADY_READY');
    if (app.isPackaged || app.getAppPath() !== '/target')
        throw lifecycleError('APP_PATH_MISMATCH');
    if (home !== '/scratch/home')
        throw lifecycleError('STORAGE_PATH_MISMATCH');
    for (const [flag, reason] of [
        ['no-sandbox', 'SWITCH_NO_SANDBOX'], ['disable-web-security', 'SWITCH_DISABLE_WEB_SECURITY'],
        ['disable-gpu-sandbox', 'SWITCH_DISABLE_GPU_SANDBOX'], ['disable-setuid-sandbox', 'SWITCH_DISABLE_SETUID_SANDBOX']
    ] as const)
        if (app.commandLine.hasSwitch(flag))
            throw lifecycleError(reason);
    create('/scratch/home');
    app.setPath('home', '/scratch/home');
    if (app.getPath('home') !== '/scratch/home')
        throw lifecycleError('STORAGE_PATH_MISMATCH');
    for (const name of ['appData', 'userData', 'sessionData', 'temp', 'crashDumps']) {
        const value = `/scratch/electron-${name}`;
        create(value);
        app.setPath(name, value);
        if (app.getPath(name) !== value)
            throw lifecycleError('STORAGE_PATH_MISMATCH');
    }
    const logs = '/scratch/electron-logs';
    create(logs);
    app.setAppLogsPath(logs);
    if (app.getPath('logs') !== logs)
        throw lifecycleError('STORAGE_PATH_MISMATCH');
}
const intendedPreload = '/target/apps/desktop/preload.js';
export function verifyWebPreferences(preferences: {
    sandbox?: boolean;
    contextIsolation?: boolean;
    nodeIntegration?: boolean;
    preload?: string;
    webSecurity?: boolean;
}, declarationVerified = false) {
    if (preferences.sandbox !== true)
        throw lifecycleError(preferences.sandbox === undefined ? 'PREF_SANDBOX_MISSING' : 'PREF_SANDBOX_INVALID');
    if (preferences.contextIsolation !== true)
        throw lifecycleError(preferences.contextIsolation === undefined ? 'PREF_CONTEXT_ISOLATION_MISSING' : 'PREF_CONTEXT_ISOLATION_INVALID');
    if (preferences.nodeIntegration !== false)
        throw lifecycleError(preferences.nodeIntegration === undefined ? 'PREF_NODE_INTEGRATION_MISSING' : 'PREF_NODE_INTEGRATION_INVALID');
    if (preferences.webSecurity === false)
        throw lifecycleError('PREF_WEB_SECURITY_DISABLED');
    if (preferences.preload === undefined && declarationVerified)
        return 'OMITTED_DECLARATION_VERIFIED' as const;
    if (preferences.preload === undefined)
        throw lifecycleError('PREF_PRELOAD_MISSING');
    if (typeof preferences.preload !== 'string')
        throw lifecycleError('PREF_PRELOAD_TYPE_INVALID');
    if (preferences.preload !== intendedPreload)
        throw lifecycleError('PREF_PRELOAD_PATH_MISMATCH');
    return 'PRESENT' as const;
}
export function verifyPreloadBridge(available: unknown) {
    if (available !== true)
        throw lifecycleError('PRELOAD_BRIDGE_MISSING');
}
// Inspect the single Suite BrowserWindow, not DevTools or unrelated webContents.
// No URL or window metadata is returned or included in diagnostics.
export function verifySuiteWindow(contents: any, windows: any) {
    const win = windows.fromWebContents(contents);
    const all = windows.getAllWindows();
    if (!win || win.isDestroyed() || win.webContents !== contents || all.length !== 1 || all[0] !== win || contents.getType() !== 'window')
        throw lifecycleError('SUITE_WINDOW_IDENTITY_INVALID');
    try {
        const location = new URL(contents.getURL());
        if (location.origin !== 'http://localhost:5173' || location.pathname !== '/' || location.username || location.password)
            throw new Error();
    }
    catch {
        throw lifecycleError('SUITE_WINDOW_LOCATION_INVALID');
    }
}
// Electron's native preference getter is not in the public 41.10.6 declarations.
// Pin the distribution and refuse missing inspection rather than assuming flags.
export function inspectWebPreferences(contents: {
    getLastWebPreferences?: () => Parameters<typeof verifyWebPreferences>[0];
}, declarationVerified = false) {
    if (typeof contents.getLastWebPreferences !== 'function')
        throw lifecycleError('PREFERENCE_INSPECTION_UNAVAILABLE');
    let prefs;
    try {
        prefs = contents.getLastWebPreferences();
    }
    catch {
        throw lifecycleError('PREFERENCE_INSPECTION_UNAVAILABLE');
    }
    if (!prefs || typeof prefs !== 'object')
        throw lifecycleError('PREFERENCE_INSPECTION_UNAVAILABLE');
    return verifyWebPreferences(prefs, declarationVerified);
}
