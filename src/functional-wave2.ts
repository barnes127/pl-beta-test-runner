import path from 'node:path';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { waitFor } from './processes';
import { assertSmokePath, pageOperation } from './smoke';
import { wave2Ids, smokeReasons, SmokeReport, SmokeTraceEvent } from './smoke-contract';
interface Contents {
    executeJavaScript(code: string): Promise<unknown>;
}
type Reason = Extract<typeof smokeReasons[number], `W2_${string}`>;
class Wave2Failure extends Error {
    constructor(readonly reason: Reason) { super(reason); }
}
const projects = '/scratch/home/PLProjects';
const exportsRoot = '/scratch/home/.plcs/diagnostic-exports';
export const diagnosticsExportStatusCheck = String.raw `(() => { const matches=Array.from(document.querySelectorAll('.healthContextRail [role="status"]')).filter(el => /^Diagnostics exported: \/scratch\/home\/\.plcs\/diagnostic-exports\/pl-diagnostics-[a-zA-Z0-9-]+\.json$/.test(el.textContent?.trim() || '')); return matches.length===1; })()`;
// Return only fixed states. The Health service and platform contract both
// define "unknown" as a valid loaded severity; an alert takes precedence over
// a stale snapshot that the hook may keep after a failed refresh.
export function healthResultState(): 'READY' | 'LOADING' | 'ERROR' | 'UNAVAILABLE' | 'INVALID' | 'MISSING' {
    const rail = document.querySelector('.healthContextRail');
    if (!rail)
        return 'MISSING';
    if (rail.querySelector('[role="alert"]'))
        return 'ERROR';
    const summary = rail.querySelector('.healthContextSummary');
    if (!summary) {
        const loading = rail.querySelector('.healthContextEmpty');
        return loading?.textContent?.trim() === 'Checking suite health...' ? 'LOADING' : 'MISSING';
    }
    const severity = summary.getAttribute('data-severity');
    if (severity === 'error' || severity === 'unavailable')
        return 'UNAVAILABLE';
    if (!['healthy', 'info', 'warning', 'critical', 'unknown'].includes(severity || '') || !summary.querySelector('strong'))
        return 'INVALID';
    return 'READY';
}
// This suite is fixed at compile time. Only booleans and the fixed Health
// state enum cross from the renderer; UI text, RPC payloads and paths do not.
export async function runWave2Scenarios(contents: Contents, runId: string, verifySession: () => Promise<void>): Promise<SmokeReport> {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId))
        throw new Wave2Failure('W2_READINESS_LOST');
    const scenarios: SmokeReport['scenarios'] = [];
    const trace: NonNullable<SmokeReport['trace']> = [];
    const started = performance.now();
    let active: typeof wave2Ids[number] = wave2Ids[0];
    let failed = false;
    const record = (kind: SmokeTraceEvent['kind'], outcome: SmokeTraceEvent['outcome'], target?: SmokeTraceEvent['target'], expected?: SmokeTraceEvent['expected'], actual?: SmokeTraceEvent['actual']) => {
        if (trace.length < 128)
            trace.push({ scenarioId: active, kind, outcome, elapsedMs: Math.min(150000, Math.ceil(performance.now() - started)), ...(kind === 'SCENARIO' ? {} : { target: target!, expected: expected!, actual: actual! }) });
    };
    const verify = async () => {
        try {
            await verifySession();
        }
        catch {
            throw new Wave2Failure('W2_READINESS_LOST');
        }
    };
    const check = async (reason: Reason, target: SmokeTraceEvent['target'], expected: SmokeTraceEvent['expected'], code: string, action = false) => {
        await verify();
        let observed = false;
        let inspected = false;
        let unavailable = false;
        try {
            await waitFor(async () => {
                let value: unknown;
                try {
                    value = await contents.executeJavaScript(code);
                }
                catch {
                    unavailable = true;
                    throw new Error();
                }
                if (typeof value !== 'boolean') {
                    unavailable = true;
                    throw new Error();
                }
                inspected = true;
                observed = value;
                return observed;
            }, action ? 1000 : 5000);
        }
        catch { /* Do not propagate renderer output. */ }
        record(action ? 'ACTION' : 'ASSERTION', observed ? 'PASS' : 'FAIL', target, expected, observed ? 'OBSERVED' : unavailable || !inspected ? 'UNVERIFIED' : 'NOT_OBSERVED');
        if (!observed)
            throw new Wave2Failure(reason);
    };
    const op = (name: string, selector: string, text = '', value = '') => `(${pageOperation.toString()})(${[name, selector, text, value].map(v => JSON.stringify(v)).join(',')})`;
    const checkHealthResult = async () => {
        await verify();
        const observed: {
            state: ReturnType<typeof healthResultState> | 'UNVERIFIED';
        } = { state: 'UNVERIFIED' };
        try {
            await waitFor(async () => {
                const value: unknown = await contents.executeJavaScript(`(${healthResultState.toString()})()`);
                if (!['READY', 'LOADING', 'ERROR', 'UNAVAILABLE', 'INVALID', 'MISSING'].includes(value as string))
                    throw new Error();
                observed.state = value as ReturnType<typeof healthResultState>;
                return observed.state === 'READY';
            }, 5000);
        }
        catch { /* Only the allowlisted state is retained. */ }
        const state = observed.state;
        const reason: Reason = state === 'ERROR' ? 'W2_HEALTH_SERVICE_ERROR' : state === 'UNAVAILABLE' ? 'W2_HEALTH_RESULT_UNAVAILABLE'
            : state === 'INVALID' ? 'W2_HEALTH_RESULT_INVALID' : state === 'LOADING' ? 'W2_HEALTH_LOADING_TIMEOUT'
                : state === 'UNVERIFIED' ? 'W2_HEALTH_INSPECTION_FAILED' : 'W2_HEALTH_RESULT_MISSING';
        record('ASSERTION', state === 'READY' ? 'PASS' : 'FAIL', 'HEALTH_RESULT', 'VISIBLE_ELEMENT', state === 'READY' ? 'OBSERVED' : state === 'UNVERIFIED' ? 'UNVERIFIED' : 'NOT_OBSERVED');
        if (state !== 'READY')
            throw new Wave2Failure(reason);
    };
    const noProject = async () => {
        await verify();
        let empty = false;
        let inspected = false;
        try {
            const info = await lstat(projects);
            empty = info.isDirectory() && !info.isSymbolicLink() && await realpath(projects) === projects && (await readdir(projects)).length === 0;
            inspected = true;
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                empty = true;
                inspected = true;
            }
        }
        record('ASSERTION', empty ? 'PASS' : 'FAIL', 'SCRATCH_PROJECT_ROOT', 'NO_PROJECT_CREATED', empty ? 'OBSERVED' : inspected ? 'NOT_OBSERVED' : 'UNVERIFIED');
        if (!empty)
            throw new Wave2Failure('W2_NO_PROJECT_SCRATCH_CHANGED');
    };
    const privateFile = async (candidate: string, root: string, maxBytes: number, strictPermissions = true) => {
        if (!candidate.startsWith(root + '/') || path.resolve(candidate) !== candidate)
            return false;
        let current = '/';
        try {
            for (const part of candidate.split('/').filter(Boolean)) {
                current = path.join(current, part);
                const info = await lstat(current);
                if (info.isSymbolicLink() || await realpath(current) !== current)
                    return false;
            }
            const info = await lstat(candidate);
            return info.isFile() && info.uid === process.getuid?.() && (!strictPermissions || (info.mode & 0o077) === 0) && info.size > 0 && info.size <= maxBytes;
        }
        catch {
            return false;
        }
    };
    const fileCheck = async (reason: Reason, target: SmokeTraceEvent['target'], expectation: SmokeTraceEvent['expected'], oracle: () => Promise<boolean>) => {
        await verify();
        let observed = false;
        let inspected = false;
        try {
            observed = await oracle();
            inspected = true;
        }
        catch { /* Fixed reason only. */ }
        record('ASSERTION', observed ? 'PASS' : 'FAIL', target, expectation, observed ? 'OBSERVED' : inspected ? 'NOT_OBSERVED' : 'UNVERIFIED');
        if (!observed)
            throw new Wave2Failure(reason);
    };
    const name = `plqa-w2-${runId.slice(0, 12)}`;
    const project = path.join(projects, name);
    const log = path.join(project, 'logs/session.log');
    const steps: (() => Promise<void>)[] = [
        async () => {
            await noProject();
            await check('W2_NO_PROJECT_ACTION_FAILED', 'STATUS_BAR', 'ACTION_DISPATCHED', op('click', '.topbarRight button', 'Export Logs'), true);
            await check('W2_NO_PROJECT_STATUS_MISSING', 'STATUS_BAR', 'EXACT_FIXTURE_TEXT', op('text', '.statusLeft > span:first-child', '', 'Status: No project open'));
            await check('W2_NO_PROJECT_STATUS_MISSING', 'PROJECT_CONTEXT', 'EXACT_FIXTURE_TEXT', op('text', '.workspaceHeader .workspaceSubtitle', '', 'No project open'));
            await noProject();
        },
        async () => {
            const openHealth = `(() => { if (document.querySelector('.healthContextRail')) return true; const matches = Array.from(document.querySelectorAll('.topbarLeft button')).filter(b => b.textContent?.trim().startsWith('Health')); if (matches.length !== 1 || matches[0].disabled) return false; matches[0].click(); return true; })()`;
            await check('W2_HEALTH_OPEN_FAILED', 'HEALTH_CONTROL', 'ACTION_DISPATCHED', openHealth, true);
            await check('W2_HEALTH_UI_MISSING', 'HEALTH_PANEL', 'VISIBLE_ELEMENT', op('present', '.healthContextRail strong', 'Health Center'));
            await checkHealthResult();
            await check('W2_HEALTH_RESULT_MISSING', 'HEALTH_RESULT', 'VISIBLE_ELEMENT', op('present', '.healthContextRail .healthContextSummary'));
            await check('W2_DIAG_EXPORT_ACTION_FAILED', 'DIAGNOSTIC_EXPORT', 'ACTION_DISPATCHED', op('click', '.healthContextRail button', 'Export Diagnostics'), true);
            await check('W2_DIAG_EXPORT_UI_MISSING', 'DIAGNOSTIC_EXPORT', 'VISIBLE_ELEMENT', op('present', '.healthContextRail [role="status"]'));
            await check('W2_DIAG_EXPORT_UI_MISSING', 'DIAGNOSTIC_EXPORT', 'VISIBLE_ELEMENT', diagnosticsExportStatusCheck);
            await fileCheck('W2_DIAG_EXPORT_FILE_INVALID', 'DIAGNOSTIC_FILE', 'PRIVATE_DIAGNOSTIC_EXPORT', async () => {
                const names = await readdir(exportsRoot);
                if (names.length !== 1 || !/^pl-diagnostics-[0-9T-Z-]+-[a-f0-9]{8}\.json$/.test(names[0]!))
                    return false;
                const filename = path.join(exportsRoot, names[0]!);
                if (!await privateFile(filename, exportsRoot, 2000000))
                    return false;
                const parsed = JSON.parse(await readFile(filename, 'utf8'));
                return parsed?.kind === 'pl-diagnostic-export' && parsed?.schemaVersion === 1;
            });
            await check('W2_HEALTH_UI_MISSING', 'HEALTH_CONTROL', 'ACTION_DISPATCHED', op('click', '.healthContextRail button[aria-label="Close health center"]'), true);
            await check('W2_HEALTH_UI_MISSING', 'HEALTH_PANEL', 'ELEMENT_ABSENT', op('missing', '.healthContextRail'));
        },
        async () => {
            await noProject();
            await check('W2_PROJECT_CREATE_FAILED', 'NEW_PROJECT_BUTTON', 'ACTION_DISPATCHED', op('click', '.topbarRight button', 'New Project'), true);
            await check('W2_PROJECT_CREATE_FAILED', 'PROJECT_MODAL', 'VISIBLE_ELEMENT', op('present', '[role="dialog"] .modalTitle', 'Create New Project'));
            await check('W2_PROJECT_CREATE_FAILED', 'PROJECT_NAME_INPUT', 'ACTION_DISPATCHED', op('fill', '[role="dialog"] input[placeholder="My Project"]', '', name), true);
            await check('W2_PROJECT_CREATE_FAILED', 'PROJECT_ROOT_INPUT', 'ACTION_DISPATCHED', op('fill', '[role="dialog"] input[placeholder="Defaults to ~/PLProjects"]', '', projects), true);
            await check('W2_PROJECT_CREATE_FAILED', 'PROJECT_CREATE_BUTTON', 'ACTION_DISPATCHED', op('click', '[role="dialog"] button', 'Create'), true);
            await check('W2_PROJECT_CONTEXT_MISSING', 'PROJECT_MODAL', 'ELEMENT_ABSENT', op('missing', '[role="dialog"]'));
            await check('W2_PROJECT_CONTEXT_MISSING', 'PROJECT_CONTEXT', 'EXACT_FIXTURE_TEXT', op('text', '.workspaceHeader .workspaceSubtitle', '', `Project: ${project}`));
            await fileCheck('W2_PROJECT_MANIFEST_INVALID', 'PROJECT_MANIFEST', 'MANIFEST_NAME_SCHEMA_MATCH', async () => {
                const filename = path.join(project, 'pl-project.json');
                await assertSmokePath(filename);
                if (!await privateFile(filename, projects, 200000, false))
                    return false;
                const manifest = JSON.parse(await readFile(filename, 'utf8'));
                return manifest?.schemaVersion === 1 && manifest?.name === name;
            });
            await fileCheck('W2_PROJECT_LOG_FILE_INVALID', 'PROJECT_LOG_FILE', 'ELEMENT_ABSENT', async () => {
                try {
                    await lstat(log);
                    return false;
                }
                catch (error) {
                    return (error as NodeJS.ErrnoException).code === 'ENOENT';
                }
            });
            await check('W2_PROJECT_LOG_ACTION_FAILED', 'STATUS_BAR', 'ACTION_DISPATCHED', op('click', '.topbarRight button', 'Export Logs'), true);
            await check('W2_PROJECT_LOG_STATUS_MISSING', 'STATUS_BAR', 'EXACT_FIXTURE_TEXT', op('text', '.statusLeft > span:first-child', '', `Status: Logs: ${log}`));
            await fileCheck('W2_PROJECT_LOG_FILE_INVALID', 'PROJECT_LOG_FILE', 'PRIVATE_PROJECT_LOG', async () => {
                await assertSmokePath(log);
                return privateFile(log, projects, 1000000, false);
            });
        }
    ];
    for (const [index, id] of wave2Ids.entries()) {
        if (failed) {
            scenarios.push({ id, status: 'NOT_RUN', durationMs: 0 });
            continue;
        }
        active = id;
        const begun = performance.now();
        record('SCENARIO', 'START');
        try {
            await verify();
            await steps[index]!();
            scenarios.push({ id, status: 'PASS', durationMs: Math.ceil(performance.now() - begun) });
            record('SCENARIO', 'PASS');
        }
        catch (error) {
            failed = true;
            const reason = error instanceof Wave2Failure ? error.reason : 'W2_READINESS_LOST';
            record('ASSERTION', 'FAIL', reason, 'STAGE_CONTRACT', 'UNVERIFIED');
            scenarios.push({ id, status: 'FAIL', reason, durationMs: Math.ceil(performance.now() - begun) });
            record('SCENARIO', 'FAIL');
        }
    }
    return { version: 2, suite: 'batch-4-v2', runId, status: failed ? 'FAIL' : 'PASS', scenarios, trace };
}
