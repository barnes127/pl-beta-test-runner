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
    for (const flag of ['no-sandbox', 'disable-web-security', 'disable-gpu-sandbox', 'disable-setuid-sandbox'])
        if (app.commandLine.hasSwitch(flag))
            throw lifecycleError('SECURITY_PREFERENCES_INVALID');
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
export function verifyWebPreferences(preferences: {
    sandbox?: boolean;
    contextIsolation?: boolean;
    nodeIntegration?: boolean;
    preload?: string;
    webSecurity?: boolean;
}) {
    if (preferences.sandbox !== true || preferences.contextIsolation !== true || preferences.nodeIntegration !== false || preferences.webSecurity === false || preferences.preload !== '/target/apps/desktop/preload.js')
        throw lifecycleError('SECURITY_PREFERENCES_INVALID');
}
// Electron's native preference getter is not in the public 41.10.6 declarations.
// Pin the distribution and refuse missing inspection rather than assuming flags.
export function inspectWebPreferences(contents: {
    getLastWebPreferences?: () => Parameters<typeof verifyWebPreferences>[0];
}) {
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
    verifyWebPreferences(prefs);
}
