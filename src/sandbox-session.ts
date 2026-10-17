import { access, readFile, writeFile } from 'node:fs/promises';
import { proveInsideSandbox } from './isolation-proof';
import { spawnOwned, stopOwned, waitFor, assertPortFree, assertListenerOwner, OwnedProcess } from './processes';
async function session() {
    await proveInsideSandbox();
    await access('/usr/bin/Xvfb'); // Private display only; no host X11/Wayland sockets.
    await assertPortFree(5173);
    await assertPortFree(38741);
    const owned: OwnedProcess[] = [];
    const environment = { ...process.env, DISPLAY: ':97' };
    let electron: OwnedProcess | undefined;
    try {
        owned.push(await spawnOwned('/usr/bin/Xvfb', [':97', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { cwd: '/scratch', env: process.env }));
        await waitFor(async () => {
            try {
                await access('/tmp/.X11-unix/X97');
                return true;
            }
            catch {
                return false;
            }
        }, 5000);
        const renderer = await spawnOwned('/runtime/node', ['/runner/renderer-server.js'], { cwd: '/scratch', env: environment });
        owned.push(renderer);
        await waitFor(async () => {
            try {
                await assertListenerOwner(5173, renderer.pid, renderer.start);
                return true;
            }
            catch {
                return false;
            }
        }, 5000);
        electron = await spawnOwned('/electron/electron', ['/runner/electron-entry.js'], { cwd: '/scratch', env: environment });
        owned.push(electron);
        await waitFor(async () => {
            if (electron!.child.exitCode !== null || electron!.child.signalCode !== null)
                throw new Error();
            try {
                const state = JSON.parse(await readFile('/scratch/electron-ready.json', 'utf8'));
                if (state.ready !== true)
                    return false;
                await assertListenerOwner(38741, electron!.pid, electron!.start);
                await assertListenerOwner(5173, renderer.pid, renderer.start);
                return true;
            }
            catch {
                return false;
            }
        }, 15000);
        await writeFile('/scratch/session-ready', 'ready', { mode: 0o600 });
    }
    finally {
        if (electron) {
            await writeFile('/scratch/stop-electron', 'stop', { mode: 0o600 });
            try {
                await waitFor(async () => electron!.child.exitCode !== null || electron!.child.signalCode !== null, 2000);
            }
            catch { /* bounded fallback below */ }
        }
        let stopFailed = false;
        for (const child of [...owned].reverse()) {
            try {
                await stopOwned(child, 500);
            }
            catch {
                stopFailed = true;
            }
        }
        if (stopFailed)
            throw new Error();
    }
    // Shutdown evidence: both internal ports released after all owned groups exit.
    await assertPortFree(5173);
    await assertPortFree(38741);
    await writeFile('/scratch/session-result.json', JSON.stringify({ status: 'LIFECYCLE_VERIFIED', guiMutations: false, securityVerified: true }), { mode: 0o600 });
}
if (require.main === module)
    session().catch(() => { process.exitCode = 3; });
