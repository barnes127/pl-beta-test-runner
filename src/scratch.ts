import { lstat, realpath, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RunnerError } from './errors';
const active = new Set<string>();
export function markScratchBusy(scratch: Scratch) { active.add(scratch.directory); }
export function markScratchIdle(scratch: Scratch) { active.delete(scratch.directory); }
const MARKER = '.pl-beta-runner-owner.json';
const ROOT_MARKER = '.pl-beta-runner-root.json';
export interface Scratch {
    root: string;
    directory: string;
    nonce: string;
}
export function isWithin(root: string, candidate: string) {
    const relative = path.relative(root, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function rejectSymlinkComponents(filename: string) {
    const resolved = path.resolve(filename);
    let cursor = path.parse(resolved).root;
    for (const part of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        if ((await lstat(cursor)).isSymbolicLink())
            throw new RunnerError('UNSAFE_PATH', 'Symlink path components are forbidden.');
    }
}
async function checkRoot(root: string) {
    await rejectSymlinkComponents(root);
    const canonical = await realpath(root);
    const info = await lstat(canonical);
    if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)
        throw new RunnerError('UNSAFE_PATH', 'Scratch root must be private and owned by the current user.');
    await rejectSymlinkComponents(path.join(root, ROOT_MARKER));
    const marker = JSON.parse(await readFile(path.join(root, ROOT_MARKER), 'utf8'));
    if (marker.kind !== 'pl-beta-runner-root-v1' || marker.root !== canonical)
        throw new RunnerError('UNSAFE_PATH', 'Scratch root ownership is invalid.');
    return canonical;
}
export async function initializeScratchRoot(base: string) {
    // Dedicated child only. Never adopt, chmod, or mark an existing directory.
    await rejectSymlinkComponents(base);
    const root = path.join(await realpath(base), '.scratch');
    try {
        await mkdir(root, { mode: 0o700 });
        await writeFile(path.join(root, ROOT_MARKER), JSON.stringify({ kind: 'pl-beta-runner-root-v1', root }), { flag: 'wx', mode: 0o600 });
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
            throw error;
    }
    return checkRoot(root);
}
export async function createScratch(root: string): Promise<Scratch> {
    root = await checkRoot(root);
    const directory = await mkdtemp(path.join(root, 'run-'));
    const nonce = randomUUID();
    await writeFile(path.join(directory, MARKER), JSON.stringify({ kind: 'pl-beta-runner-run-v1', nonce, root, directory }), { flag: 'wx', mode: 0o600 });
    return { root, directory, nonce };
}
export async function validateScratch(scratch: Scratch) {
    try {
        const root = await checkRoot(scratch.root);
        await rejectSymlinkComponents(scratch.directory);
        const directory = await realpath(scratch.directory);
        if (directory !== scratch.directory || !isWithin(root, directory) || path.dirname(directory) !== root)
            throw new Error();
        const info = await lstat(directory);
        if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)
            throw new Error();
        await rejectSymlinkComponents(path.join(directory, MARKER));
        const marker = JSON.parse(await readFile(path.join(directory, MARKER), 'utf8'));
        if (marker.kind !== 'pl-beta-runner-run-v1' || marker.nonce !== scratch.nonce || marker.root !== root || marker.directory !== directory)
            throw new Error();
        return directory;
    }
    catch {
        throw new RunnerError('UNSAFE_PATH', 'Scratch ownership or containment could not be verified.');
    }
}
export async function cleanupScratch(scratch: Scratch) {
    if (active.has(scratch.directory))
        throw new RunnerError('OWNERSHIP', 'Scratch still has an active or unconfirmed process; cleanup refused.');
    await validateScratch(scratch);
    // rm removes nested symlinks themselves; never traverse them. Caller must stop
    // all owned writers first. Same-UID hostile concurrent mutation is not supported.
    await rm(scratch.directory, { recursive: true, force: false });
}
