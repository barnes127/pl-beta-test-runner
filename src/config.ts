import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { RunnerError } from './errors';
export interface TargetConfig {
    targetRoot: string;
    buildMode: 'development-built-renderer';
    desktopAppRelativePath: 'apps/desktop';
    electronVersionDeclared: '41.10.6';
    renderer: {
        url: 'http://localhost:5173';
        requiredPort: 5173;
        requireOwnedProcess: true;
        strictPort: true;
    };
    rpc: {
        host: '127.0.0.1';
        requiredPort: 38741;
        owner: 'launched-electron-process';
        tokenPersistence: 'forbidden';
    };
    isolation: {
        status: 'unproven';
        requireFilesystemContainment: true;
    };
    allowGuiMutations: false;
    contractStatus: 'batch-1-unverified';
    packagedExecutable: null;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
    if (Object.keys(value).some(k => !keys.includes(k)))
        throw new RunnerError('CONFIG', 'Unknown configuration setting.');
}
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new RunnerError('CONFIG', 'Expected configuration object.');
    return value as Record<string, unknown>;
}
export function validateConfig(input: unknown): TargetConfig {
    const v = object(input);
    exactKeys(v, ['targetRoot', 'buildMode', 'desktopAppRelativePath', 'electronVersionDeclared', 'renderer', 'rpc', 'isolation', 'allowGuiMutations', 'contractStatus', 'packagedExecutable']);
    const r = object(v.renderer), rpc = object(v.rpc), isolation = object(v.isolation);
    exactKeys(r, ['url', 'requiredPort', 'requireOwnedProcess', 'strictPort']);
    exactKeys(rpc, ['host', 'requiredPort', 'owner', 'tokenPersistence']);
    exactKeys(isolation, ['status', 'requireFilesystemContainment']);
    if (typeof v.targetRoot !== 'string' || !v.targetRoot.trim() || v.targetRoot.includes('\0') ||
        v.buildMode !== 'development-built-renderer' || v.desktopAppRelativePath !== 'apps/desktop' ||
        v.electronVersionDeclared !== '41.10.6' || v.allowGuiMutations !== false ||
        v.contractStatus !== 'batch-1-unverified' || v.packagedExecutable !== null ||
        r.url !== 'http://localhost:5173' || r.requiredPort !== 5173 || r.requireOwnedProcess !== true || r.strictPort !== true ||
        rpc.host !== '127.0.0.1' || rpc.requiredPort !== 38741 || rpc.owner !== 'launched-electron-process' || rpc.tokenPersistence !== 'forbidden' ||
        isolation.status !== 'unproven' || isolation.requireFilesystemContainment !== true)
        throw new RunnerError('CONFIG', 'Unsupported or unsafe configuration; mutations and unverified launch modes are forbidden.');
    return v as unknown as TargetConfig;
}
export async function loadConfig(filename: string): Promise<TargetConfig> {
    try {
        const value = validateConfig(JSON.parse(await readFile(filename, 'utf8')));
        value.targetRoot = await realpath(path.resolve(path.dirname(filename), value.targetRoot));
        if (!(await stat(path.join(value.targetRoot, 'apps/desktop/main.js'))).isFile())
            throw new Error();
        return value;
    }
    catch (error) {
        if (error instanceof RunnerError)
            throw error;
        throw new RunnerError('CONFIG', 'Cannot read configuration or resolve target entrypoint.');
    }
}
export function assertRuntime(version = process.versions.node, packageManager?: string) {
    if (version !== '22.12.0')
        throw new RunnerError('RUNTIME', 'Node 22.12.0 is required.');
    if (packageManager !== undefined && !/^pnpm\/10\.31\.0(?:\s|$)/.test(packageManager))
        throw new RunnerError('RUNTIME', 'pnpm 10.31.0 is required.');
}
