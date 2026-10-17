import { TargetConfig } from './config';
import { doctor } from './doctor';
import { isolationPreflight } from './isolation';
import { cleanupScratch, createScratch, initializeScratchRoot } from './scratch';
import { RunnerError } from './errors';
// Runtime isolation proof must be reviewed before an app session is enabled.
// No config field can bypass this Batch 1 gate.
export async function launch(config: TargetConfig, runnerRoot: string) {
    await doctor(config);
    const scratch = await createScratch(await initializeScratchRoot(runnerRoot));
    try {
        await isolationPreflight(scratch, runnerRoot);
        throw new RunnerError('LAUNCH_BLOCKED', 'Isolation preflight passed, but target launch remains disabled pending review and Electron ownership/compatibility validation.');
    }
    finally {
        await cleanupScratch(scratch);
    }
}
