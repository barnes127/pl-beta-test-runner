import { inspectRendererBuild } from './runtime-files';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { TargetConfig, assertRuntime } from './config';
import { RunnerError } from './errors';
import { assertNoExistingSuite, assertPortFree } from './processes';
export async function doctor(config: TargetConfig) {
    assertRuntime(process.versions.node, process.env.npm_config_user_agent);
    try {
        for (const file of ['package.json', 'apps/desktop/package.json', 'apps/desktop/main.js', 'apps/desktop/preload.js'])
            if (await realpath(path.join(config.targetRoot, file)) !== path.resolve(config.targetRoot, file))
                throw new RunnerError('UNSAFE_PATH', 'Target metadata or entrypoint is a symlink.');
        const pkg = JSON.parse(await readFile(path.join(config.targetRoot, 'package.json'), 'utf8'));
        const desktop = JSON.parse(await readFile(path.join(config.targetRoot, 'apps/desktop/package.json'), 'utf8'));
        if (pkg.engines?.node !== '22.12.0' || pkg.packageManager !== 'pnpm@10.31.0' ||
            pkg.devDependencies?.electron !== config.electronVersionDeclared || desktop.main !== 'main.js')
            throw new RunnerError('CONFIG', 'Target runtime or entrypoint contract changed; rediscovery required.');
        // Resolve executable without executing target package code or modifying it.
        const electronPackage = await realpath(path.join(config.targetRoot, 'node_modules/electron'));
        const executableName = (await readFile(path.join(electronPackage, 'path.txt'), 'utf8')).trim();
        if (executableName !== 'electron')
            throw new RunnerError('CONFIG', 'Unsupported Electron executable layout.');
        const executable = await realpath(path.join(electronPackage, 'dist', executableName));
        if (!executable.startsWith(config.targetRoot + path.sep) || !(await stat(executable)).isFile())
            throw new RunnerError('CONFIG', 'Electron executable escapes target or is unavailable.');
        if ((await readFile(path.join(electronPackage, 'dist/version'), 'utf8')).trim() !== config.electronVersionDeclared)
            throw new RunnerError('CONFIG', 'Installed Electron version does not match the approved target contract.');
        if (!(await stat(path.join(config.targetRoot, 'apps/renderer/dist/index.html'))).isFile())
            throw new Error();
        const build = await inspectRendererBuild(config.targetRoot);
        await assertNoExistingSuite();
        await assertPortFree(5173);
        await assertPortFree(38741);
        return { status: 'CHECKS_PASSED', targetMode: config.buildMode, isolation: 'UNPROVEN', guiMutations: 'DISABLED', electronExecutable: executable, build };
    }
    catch (error) {
        if (error instanceof RunnerError)
            throw error;
        throw new RunnerError('CONFIG', 'Target dependencies or built renderer are unavailable. Target was not modified.');
    }
}
