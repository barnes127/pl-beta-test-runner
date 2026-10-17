import { RunnerError } from './errors';
import { diagnostic, IsolationReason } from './isolation-diagnostics';
// These are sandbox paths, never inherited host values. Bubblewrap sets PWD
// after --chdir even with --clearenv; require its exact private value and cwd.
export const isolatedEnvironment = Object.freeze({
    PATH: '/usr/bin:/bin',
    HOME: '/scratch/home',
    XDG_CONFIG_HOME: '/scratch/config',
    XDG_CACHE_HOME: '/scratch/cache',
    XDG_DATA_HOME: '/scratch/data',
    TMPDIR: '/scratch/tmp',
    PWD: '/scratch'
});
const mismatchReasons: Record<keyof typeof isolatedEnvironment, IsolationReason> = {
    PATH: 'ENV_PATH_MISMATCH', HOME: 'ENV_HOME_MISMATCH',
    XDG_CONFIG_HOME: 'ENV_XDG_CONFIG_MISMATCH', XDG_CACHE_HOME: 'ENV_XDG_CACHE_MISMATCH',
    XDG_DATA_HOME: 'ENV_XDG_DATA_MISMATCH', TMPDIR: 'ENV_TMPDIR_MISMATCH', PWD: 'ENV_PWD_MISMATCH'
};
export function verifyIsolatedEnvironment(environment: NodeJS.ProcessEnv, cwd: string) {
    const fail = (reason: IsolationReason): never => {
        throw new RunnerError('ISOLATION_BLOCKED', 'Private environment assertion failed.', diagnostic('FILESYSTEM_CONTAINMENT', reason));
    };
    if (cwd !== '/scratch')
        fail('ENV_WORKING_DIRECTORY_MISMATCH');
    if (Object.keys(environment).some(key => !Object.hasOwn(isolatedEnvironment, key)))
        fail('ENV_UNEXPECTED_VARIABLE');
    for (const key of Object.keys(isolatedEnvironment) as (keyof typeof isolatedEnvironment)[]) {
        if (environment[key] !== isolatedEnvironment[key])
            fail(mismatchReasons[key]);
    }
}
