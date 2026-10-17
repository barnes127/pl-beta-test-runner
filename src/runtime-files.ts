import path from 'node:path';
import { readdir, lstat, realpath, mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
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
            else if (item.isFile() && extensions.has(path.extname(item.name)))
                await copyFile(file, path.join(to, item.name));
            else if (path.extname(item.name) !== '.map')
                throw new RunnerError('UNSAFE_PATH', 'Unsupported runtime input file.');
        }
    }
    await visit(root, destination);
}
export async function prepareRuntime(config: TargetConfig, scratch: Scratch) {
    const run = await validateScratch(scratch);
    const target = path.join(run, 'target');
    await mkdir(target, { mode: 0o700 });
    await mkdir(path.join(target, 'apps'), { mode: 0o700 });
    await copyInputs(path.join(config.targetRoot, 'apps/desktop'), path.join(target, 'apps/desktop'), new Set(['.js', '.json']));
    await mkdir(path.join(target, 'apps/renderer'), { mode: 0o700 });
    await copyInputs(path.join(config.targetRoot, 'apps/renderer/dist'), path.join(target, 'apps/renderer/dist'), new Set(['.js', '.json', '.html', '.css', '.svg', '.png', '.ico', '.woff', '.woff2']));
    const pkg = JSON.parse(await readFile(path.join(config.targetRoot, 'package.json'), 'utf8'));
    await writeFile(path.join(target, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, description: pkg.description }), { flag: 'wx', mode: 0o600 });
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
