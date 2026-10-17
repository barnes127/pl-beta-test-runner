import { createHash } from 'node:crypto';
import path from 'node:path';
import { readdir, lstat, realpath, mkdir, copyFile, writeFile, readFile, stat } from 'node:fs/promises';
import { isWithin, Scratch, validateScratch } from './scratch';
import { TargetConfig } from './config';
import { RunnerError } from './errors';
// Only source/build inputs are copied; no target Git data, environment files,
// user profiles, project folders or dependency stores enter the sandbox.
export async function copyInputs(source: string, destination: string, extensions: Set<string>) {
    const root = await realpath(source);
    if (root !== path.resolve(source) || (await lstat(source)).isSymbolicLink())
        throw new RunnerError('UNSAFE_PATH', 'Input root cannot be a symlink.');
    async function visit(from: string, to: string) {
        await mkdir(to, { mode: 0o700 });
        for (const item of await readdir(from, { withFileTypes: true })) {
            if (item.name === 'node_modules' && item.isDirectory())
                continue; // Desktop uses built-ins; never copy dependency stores.
            if (item.isSymbolicLink() || /^\./.test(item.name))
                throw new RunnerError('UNSAFE_PATH', 'Hidden files and symlinks are forbidden in runtime inputs.');
            const file = path.join(from, item.name);
            if (!isWithin(root, await realpath(file)))
                throw new RunnerError('UNSAFE_PATH', 'Runtime input escapes source root.');
            if (item.isDirectory())
                await visit(file, path.join(to, item.name));
            else if (item.isFile() && extensions.has(path.extname(item.name))) {
                const before = createHash('sha256').update(await readFile(file)).digest('hex');
                await copyFile(file, path.join(to, item.name));
                const after = createHash('sha256').update(await readFile(file)).digest('hex');
                const copied = createHash('sha256').update(await readFile(path.join(to, item.name))).digest('hex');
                if (before !== after || copied !== before)
                    throw new RunnerError('UNSAFE_PATH', 'Runtime inputs changed during staging.');
            }
            else if (path.extname(item.name) !== '.map')
                throw new RunnerError('UNSAFE_PATH', 'Unsupported runtime input file.');
        }
    }
    await visit(root, destination);
}
export async function prepareRuntime(config: TargetConfig, scratch: Scratch) {
    const run = await validateScratch(scratch);
    const build = await inspectRendererBuild(config.targetRoot);
    const target = path.join(run, 'target');
    await mkdir(target, { mode: 0o700 });
    await mkdir(path.join(target, 'apps'), { mode: 0o700 });
    await copyInputs(path.join(config.targetRoot, 'apps/desktop'), path.join(target, 'apps/desktop'), new Set(['.js', '.json']));
    await mkdir(path.join(target, 'apps/renderer'), { mode: 0o700 });
    await copyInputs(path.join(config.targetRoot, 'apps/renderer/dist'), path.join(target, 'apps/renderer/dist'), new Set(['.js', '.json', '.html', '.css', '.svg', '.png', '.ico', '.woff', '.woff2']));
    const pkg = JSON.parse(await readFile(path.join(config.targetRoot, 'package.json'), 'utf8'));
    await writeFile(path.join(target, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, description: pkg.description, main: '/runner/electron-entry.js' }), { flag: 'wx', mode: 0o600 });
    const after = await inspectRendererBuild(config.targetRoot);
    if (after.sourceDigest !== build.sourceDigest || after.assetDigest !== build.assetDigest || after.desktopDigest !== build.desktopDigest)
        throw new RunnerError('UNSAFE_PATH', 'Build inputs changed during staging.');
    const snapshotDigest = await runtimeTreeDigest(target);
    await mkdir(path.join(run, 'inputs'), { recursive: true, mode: 0o700 });
    await writeFile(path.join(run, 'inputs', 'preload-contract.json'), JSON.stringify({ version: 1, runId: scratch.nonce, snapshotDigest }), { flag: 'wx', mode: 0o600 });
    await writeFile(path.join(run, 'build-evidence.json'), JSON.stringify({ ...build, snapshotDigest }), { flag: 'wx', mode: 0o600 });
    return target;
}
export async function assertDisposableProject(scratch: Scratch, projectPath: string) {
    const directory = await validateScratch(scratch);
    const expected = path.join(directory, 'home', 'PLProjects');
    const resolved = await realpath(projectPath);
    if (!isWithin(expected, resolved) || path.resolve(projectPath) !== resolved)
        throw new RunnerError('UNSAFE_PATH', 'Project path is outside the disposable project root.');
    return resolved;
}
// Timestamp drift is a conservative stale-build detector, not build provenance.
// Hashes bind review evidence to specific inputs/assets without reporting paths.
export async function inspectRendererBuild(targetRoot: string) {
    const inputs: string[] = [];
    async function visit(root: string, files: string[]) {
        if ((await realpath(root)) !== path.resolve(root))
            throw new RunnerError('UNSAFE_PATH', 'Build inputs contain a symlink.');
        for (const item of await readdir(root, { withFileTypes: true })) {
            if (item.name.startsWith('.') || item.isSymbolicLink())
                throw new RunnerError('UNSAFE_PATH', 'Hidden or linked build input refused.');
            const file = path.join(root, item.name);
            if (item.isDirectory())
                await visit(file, files);
            else if (item.isFile())
                files.push(file);
            else
                throw new RunnerError('UNSAFE_PATH', 'Unsupported build input.');
        }
    }
    for (const folder of ['apps/renderer/src', 'apps/renderer/public', 'packages/platform/src'])
        await visit(path.join(targetRoot, folder), inputs);
    for (const file of ['package.json', 'pnpm-lock.yaml', 'apps/renderer/package.json', 'apps/renderer/index.html', 'apps/renderer/vite.config.ts', 'apps/renderer/tsconfig.json', 'apps/renderer/tsconfig.app.json', 'apps/renderer/tsconfig.node.json'])
        inputs.push(path.join(targetRoot, file));
    const outputs: string[] = [];
    await visit(path.join(targetRoot, 'apps/renderer/dist'), outputs);
    if (!outputs.includes(path.join(targetRoot, 'apps/renderer/dist/index.html')))
        throw new RunnerError('CONFIG', 'Built renderer index is missing.');
    let newest = 0;
    for (const file of [...inputs, ...outputs])
        if (await realpath(file) !== path.resolve(file))
            throw new RunnerError('UNSAFE_PATH', 'Build input symlink refused.');
    for (const file of inputs)
        newest = Math.max(newest, (await stat(file)).mtimeMs);
    for (const file of outputs)
        if ((await stat(file)).mtimeMs < newest)
            throw new RunnerError('CONFIG', 'Renderer build freshness is blocked: output predates source/configuration inputs. Owner rebuild required through Suite workflow.');
    async function digest(files: string[]) {
        const hash = createHash('sha256');
        for (const file of files.sort()) {
            hash.update(path.relative(targetRoot, file));
            hash.update('\0');
            hash.update(await readFile(file));
            hash.update('\0');
        }
        return hash.digest('hex');
    }
    return { freshness: 'TIMESTAMP_CHECK_PASSED', provenance: 'NOT_PROVEN', sourceDigest: await digest(inputs), assetDigest: await digest(outputs), desktopDigest: await runtimeTreeDigest(path.join(targetRoot, 'apps/desktop'), true) };
}
export async function runtimeTreeDigest(root: string, skipDependencies = false) {
    if (await realpath(root) !== path.resolve(root))
        throw new RunnerError('UNSAFE_PATH', 'Snapshot root symlink refused.');
    const hash = createHash('sha256');
    async function visit(directory: string) {
        for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
            if (skipDependencies && item.name === 'node_modules' && item.isDirectory())
                continue;
            const file = path.join(directory, item.name);
            if (item.name.startsWith('.'))
                throw new RunnerError('UNSAFE_PATH', 'Runtime snapshot contains hidden input.');
            if (item.isSymbolicLink())
                throw new RunnerError('UNSAFE_PATH', 'Runtime snapshot contains a symlink.');
            if (item.isDirectory())
                await visit(file);
            else if (item.isFile()) {
                hash.update(path.relative(root, file));
                hash.update('\0');
                hash.update(await readFile(file));
                hash.update('\0');
            }
            else
                throw new RunnerError('UNSAFE_PATH', 'Runtime snapshot contains a special file.');
        }
    }
    await visit(root);
    return hash.digest('hex');
}
