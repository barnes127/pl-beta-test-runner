import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { runtimeTreeDigest } from './runtime-files';
import { lifecycleError, RunnerError } from './errors';
// Exact bytes independently reviewed for the one Suite BrowserWindow's
// path.join(__dirname, 'preload.js') declaration and contextBridge exposure.
// Never regenerate these pins automatically. A changed source requires review.
export const reviewedPreloadContract = Object.freeze({
    main: '02f9b57581b477f48953d8610b64e82f7c60bf97201e9e4484b28cb8a62a0537',
    preload: '0964512c1529b4c66bea67074baef277a95f902cc3fbc829c2f33970cd31e8d2'
});
export async function verifyStagedPreloadDeclaration(target: string, manifestFile: string, runId: string) {
    try {
        const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
        if (!manifest || Object.keys(manifest).sort().join(',') !== 'runId,snapshotDigest,version' || manifest.version !== 1 || typeof runId !== 'string' || !runId || manifest.runId !== runId || typeof manifest.snapshotDigest !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.snapshotDigest))
            throw new Error();
        for (const [name, digest] of Object.entries(reviewedPreloadContract)) {
            const file = path.join(target, 'apps/desktop', `${name}.js`);
            let bytes;
            try {
                if (await realpath(file) !== path.resolve(file) || !(await lstat(file)).isFile())
                    throw new Error();
                bytes = await readFile(file);
            }
            catch {
                throw lifecycleError('PRELOAD_FILE_INVALID');
            }
            if (createHash('sha256').update(bytes).digest('hex') !== digest)
                throw lifecycleError('PRELOAD_REVIEW_MISMATCH');
        }
        // The nonce-bound manifest is generated outside the target and mounted
        // read-only. Check the complete staged tree, not just two file names.
        if (await runtimeTreeDigest(target) !== manifest.snapshotDigest)
            throw new Error();
    }
    catch (error) {
        if (error instanceof RunnerError && error.lifecycle)
            throw error;
        throw lifecycleError('PRELOAD_SNAPSHOT_INVALID');
    }
}
