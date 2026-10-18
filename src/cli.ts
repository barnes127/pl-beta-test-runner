import { smokeIds } from './smoke-contract';
import { environmentReport } from './environment';
import path from 'node:path';
import { assertRuntime, loadConfig } from './config';
import { publicError, RunnerError } from './errors';
import { doctor } from './doctor';
import { initializeScratchRoot, createScratch, cleanupScratch } from './scratch';
import { isolationPreflight } from './isolation';
import { assertApprovedLaunchTarget } from './launch-authorization';
import { launch } from './launch';
import { LaunchObservation } from './launch';
import { makeRunReport, writeRunReport } from './report';
async function main() {
    assertRuntime(process.versions.node, process.env.npm_config_user_agent);
    const [command, ...args] = process.argv.slice(2);
    const root = path.resolve(__dirname, '..');
    if (command === 'help' && args.length === 0)
        return { commands: ['environment', 'doctor', 'isolation-check', 'launch', 'list', 'run'], usage: 'pnpm qa <command> [--config <file>]' };
    if (args.length && (args.length !== 2 || args[0] !== '--config' || !args[1]))
        throw new RunnerError('CONFIG', 'Expected --config <file>; shell commands and extra arguments are unsupported.');
    if (command === 'environment' && args.length === 0)
        return environmentReport();
    if (command === 'list')
        return { status: 'IMPLEMENTED_HOST_VERIFIED', scenarios: smokeIds, guiMutations: 'RUN_ONLY_AFTER_RUNTIME_GATES', isolationReview: 'PENDING' };
    if (command === 'isolation-check') {
        const scratch = await createScratch(await initializeScratchRoot(root));
        try {
            return await isolationPreflight(scratch, root);
        }
        finally {
            await cleanupScratch(scratch);
        }
    }
    if (command !== 'doctor' && command !== 'launch' && command !== 'run')
        throw new RunnerError('CONFIG', 'Unknown command; use help.');
    if (command === 'run') {
        const observation: LaunchObservation = {};
        let result: Awaited<ReturnType<typeof launch>> | undefined;
        let failure: unknown;
        try {
            const config = await loadConfig(args[1] ?? path.join(root, 'config/example.target.json'));
            await assertApprovedLaunchTarget(config.targetRoot, root);
            result = await launch(config, root, true, observation);
        }
        catch (error) {
            failure = error;
        }
        let report;
        let files;
        try {
            report = makeRunReport(observation, result, failure);
            files = await writeRunReport(root, report);
        }
        catch {
            throw new RunnerError('LAUNCH_BLOCKED', 'Report output could not be safely written.');
        }
        if (failure) {
            process.exitCode = failure instanceof RunnerError && (failure.code === 'CONFIG' || failure.code === 'RUNTIME') ? 2 : 3;
            return { ...publicError(failure), overall: report.overall, report: files };
        }
        if (report.overall !== 'PASS') {
            process.exitCode = 3;
            return { status: 'BLOCKED', code: 'REPORT_RESULT_INVALID', overall: report.overall, report: files };
        }
        return { ...result, report: files };
    }
    const config = await loadConfig(args[1] ?? path.join(root, 'config/example.target.json'));
    if (command === 'launch') {
        await assertApprovedLaunchTarget(config.targetRoot, root);
        return launch(config, root);
    }
    const result = await doctor(config);
    // Do not expose local executable paths or other sensitive machine metadata.
    return { status: result.status, targetMode: result.targetMode, isolation: result.isolation, guiMutations: result.guiMutations, build: result.build };
}
main().then(result => { process.stdout.write(JSON.stringify(result) + '\n'); }, error => {
    process.stdout.write(JSON.stringify(publicError(error)) + '\n');
    process.exitCode = error instanceof RunnerError ? (error.code === 'CONFIG' || error.code === 'RUNTIME' ? 2 : 3) : 4;
});
