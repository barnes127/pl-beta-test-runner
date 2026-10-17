import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { RunnerError } from './errors';
// Owner approval covers the adjacent disposable checkout only, never an alias
// to a different checkout. This does not authorize GUI mutation scenarios.
export async function assertApprovedLaunchTarget(targetRoot: string, runnerRoot: string) {
    const expected = path.join(path.dirname(await realpath(runnerRoot)), 'pl-creators-suite');
    try {
        if (await realpath(expected) === expected && targetRoot === expected && await realpath(targetRoot) === expected)
            return;
    }
    catch { /* Missing or inaccessible paths do not expand authorization. */ }
    throw new RunnerError('LAUNCH_BLOCKED', 'Launch approval covers only the adjacent disposable checkout; GUI mutations remain disabled.');
}
