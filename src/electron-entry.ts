// Runs under Electron only, inside the proved sandbox. No target source edits.
import { waitFor } from './processes';
import fs from 'node:fs';
import os from 'node:os';
import { isWithin } from './scratch';
const electron = require('electron');
const { app } = electron;
function safePath(value: string) {
    if (!isWithin('/scratch', value))
        throw new Error();
}
for (const name of ['home', 'userData', 'sessionData', 'appData', 'temp', 'logs', 'crashDumps']) {
    const destination = `/scratch/electron-${name}`;
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    app.setPath(name, destination);
    safePath(app.getPath(name));
}
if (os.homedir() !== '/scratch/home' || app.commandLine.hasSwitch('no-sandbox') || app.commandLine.hasSwitch('disable-web-security'))
    throw new Error();
app.setAppPath('/target');
app.on('web-contents-created', (_event: unknown, contents: any) => {
    contents.once('did-finish-load', async () => {
        try {
            const prefs = contents.getLastWebPreferences();
            if (prefs.sandbox !== true || prefs.contextIsolation !== true || prefs.nodeIntegration !== false || prefs.preload !== '/target/apps/desktop/preload.js')
                throw new Error();
            // Fixed read-only DOM query: no UI action, no token/URL collection.
            await waitFor(async () => Boolean(await contents.executeJavaScript(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'New Project' && b.getBoundingClientRect().width > 0)`)), 10000);
            if (process.versions.electron !== '41.10.6')
                throw new Error();
            fs.writeFileSync('/scratch/electron-ready.json', JSON.stringify({ ready: true, sandbox: true, contextIsolation: true, nodeIntegration: false, electron: process.versions.electron }), { mode: 0o600 });
        }
        catch {
            app.exit(3);
        }
    });
});
const timer = setInterval(() => {
    if (fs.existsSync('/scratch/stop-electron'))
        app.quit();
}, 50);
timer.unref();
require('/target/apps/desktop/main.js');
