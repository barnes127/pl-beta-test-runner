import { readdir, lstat, realpath } from 'node:fs/promises';
import { waitFor } from './processes';
import { pageOperation } from './smoke';
import { functionalIds, smokeReasons, SmokeReport, SmokeTraceEvent } from './smoke-contract';
interface Contents {
    executeJavaScript(code: string): Promise<unknown>;
}
type Reason = Extract<typeof smokeReasons[number], `FUNC_${string}`>;
class FunctionalFailure extends Error {
    constructor(readonly reason: Reason) { super(reason); }
}
// Fixed commands and fixed selectors only. The page returns booleans; DOM text,
// localStorage values and arbitrary application output never leave Electron.
export async function runFunctionalScenarios(contents: Contents, runId: string, verifySession: () => Promise<void>): Promise<SmokeReport> {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId))
        throw new FunctionalFailure('FUNC_READINESS_LOST');
    const scenarios: SmokeReport['scenarios'] = [];
    const trace: NonNullable<SmokeReport['trace']> = [];
    const start = performance.now();
    let active: typeof functionalIds[number] = functionalIds[0];
    let failed = false;
    const record = (kind: SmokeTraceEvent['kind'], outcome: SmokeTraceEvent['outcome'], target?: SmokeTraceEvent['target'], expected?: SmokeTraceEvent['expected'], actual?: SmokeTraceEvent['actual']) => {
        if (trace.length < 128)
            trace.push({ scenarioId: active, kind, outcome, elapsedMs: Math.min(150000, Math.ceil(performance.now() - start)), ...(kind === 'SCENARIO' ? {} : { target: target!, expected: expected!, actual: actual! }) });
    };
    const verify = async () => {
        try {
            await verifySession();
        }
        catch {
            throw new FunctionalFailure('FUNC_READINESS_LOST');
        }
    };
    const check = async (reason: Reason, target: SmokeTraceEvent['target'], expected: SmokeTraceEvent['expected'], code: string, action = false) => {
        await verify();
        let observed = false;
        let inspected = false;
        let inspectionFailed = false;
        try {
            await waitFor(async () => {
                let result: unknown;
                try {
                    result = await contents.executeJavaScript(code);
                }
                catch {
                    inspectionFailed = true;
                    throw new Error();
                }
                if (typeof result !== 'boolean') {
                    inspectionFailed = true;
                    throw new Error();
                }
                inspected = true;
                observed = result;
                return observed;
            }, action ? 1000 : 5000);
        }
        catch { /* Only fixed reason and typed observation enter evidence. */ }
        record(action ? 'ACTION' : 'ASSERTION', observed ? 'PASS' : 'FAIL', target, expected, observed ? 'OBSERVED' : inspectionFailed || !inspected ? 'UNVERIFIED' : 'NOT_OBSERVED');
        if (!observed)
            throw new FunctionalFailure(reason);
    };
    const op = (operation: string, selector: string, text = '', value = '') => `(${pageOperation.toString()})(${[operation, selector, text, value].map(item => JSON.stringify(item)).join(',')})`;
    const source = async (reason: Reason, target: SmokeTraceEvent['target'], expected: SmokeTraceEvent['expected'], js: string, action = false) => check(reason, target, expected, js, action);
    const noProjects = async () => {
        await verify();
        let empty = false;
        let inspected = false;
        try {
            const root = '/scratch/home/PLProjects';
            const info = await lstat(root);
            empty = info.isDirectory() && !info.isSymbolicLink() && await realpath(root) === root && (await readdir(root)).length === 0;
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
            throw new FunctionalFailure('FUNC_DIALOG_SCRATCH_CHANGED');
    };
    const steps: (() => Promise<void>)[] = [
        async () => {
            await source('FUNC_THEME_ACTION_FAILED', 'THEME_CONTROL', 'ACTION_DISPATCHED', op('click', 'button', 'High Contrast'), true);
            await source('FUNC_THEME_NOT_VISIBLE', 'THEME_STATE', 'VISIBLE_ELEMENT', op('present', '.shell[data-theme="high-contrast"]'));
            await source('FUNC_THEME_NOT_VISIBLE', 'THEME_CONTROL', 'VISIBLE_ELEMENT', op('present', 'button[aria-pressed="true"]', 'Standard Contrast'));
            await source('FUNC_THEME_NOT_PERSISTED', 'THEME_PERSISTENCE', 'THEME_PERSISTED', `(() => { try { return JSON.parse(localStorage.getItem('pl.shell.workspace-state.v1') || 'null')?.themeMode === 'high-contrast'; } catch { return false; } })()`);
            await source('FUNC_THEME_RESTORE_FAILED', 'THEME_CONTROL', 'ACTION_DISPATCHED', op('click', 'button', 'Standard Contrast'), true);
            await source('FUNC_THEME_RESTORE_FAILED', 'THEME_STATE', 'VISIBLE_ELEMENT', op('present', '.shell[data-theme="default"]'));
        },
        async () => {
            await source('FUNC_SHORTCUT_ACTION_FAILED', 'SHORTCUT_ACTION', 'ACTION_DISPATCHED', `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true })); return true; })()`, true);
            await source('FUNC_SHORTCUT_NAV_NOT_VISIBLE', 'SHORTCUT_NAVIGATION', 'EXACT_FIXTURE_TEXT', op('present', '.nav .NavItem.active .navLabel', 'Docs'));
            await source('FUNC_SHORTCUT_CONTEXT_NOT_VISIBLE', 'WORKSPACE_TITLE', 'EXACT_FIXTURE_TEXT', op('text', '.workspaceHeader .workspaceTitle', '', 'docs'));
            await source('FUNC_EQUIVALENT_NAV_FAILED', 'CODE_NAVIGATION', 'ACTION_DISPATCHED', op('click', '.nav .NavItem:nth-child(2)'), true);
            await source('FUNC_EQUIVALENT_NAV_FAILED', 'ACTIVE_CODE_NAVIGATION', 'EXACT_FIXTURE_TEXT', op('present', '.nav .NavItem.active .navLabel', 'Code IDE'));
        },
        async () => {
            await noProjects();
            await source('FUNC_DIALOG_OPEN_FAILED', 'NEW_PROJECT_BUTTON', 'ACTION_DISPATCHED', op('click', '.topbarRight button', 'New Project'), true);
            await source('FUNC_DIALOG_OPEN_FAILED', 'PROJECT_MODAL', 'VISIBLE_ELEMENT', op('present', '[role="dialog"] .modalTitle', 'Create New Project'));
            await source('FUNC_DIALOG_CANCEL_FAILED', 'DIALOG_ACTION', 'ACTION_DISPATCHED', op('click', '[role="dialog"] button', 'Cancel'), true);
            await source('FUNC_DIALOG_CANCEL_FAILED', 'DIALOG_STATE', 'ELEMENT_ABSENT', op('missing', '[role="dialog"]'));
            await source('FUNC_DIALOG_OPEN_FAILED', 'NEW_PROJECT_BUTTON', 'ACTION_DISPATCHED', op('click', '.topbarRight button', 'New Project'), true);
            await source('FUNC_DIALOG_OPEN_FAILED', 'PROJECT_MODAL', 'VISIBLE_ELEMENT', op('present', '[role="dialog"] .modalTitle', 'Create New Project'));
            await source('FUNC_DIALOG_ESCAPE_FAILED', 'DIALOG_ACTION', 'ACTION_DISPATCHED', `(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`, true);
            await source('FUNC_DIALOG_ESCAPE_FAILED', 'DIALOG_STATE', 'ELEMENT_ABSENT', op('missing', '[role="dialog"]'));
            await source('FUNC_DIALOG_CONTEXT_CHANGED', 'PROJECT_CONTEXT', 'EXACT_FIXTURE_TEXT', op('text', '.workspaceHeader .workspaceSubtitle', '', 'No project open'));
            await noProjects();
        }
    ];
    for (const [index, id] of functionalIds.entries()) {
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
            const reason = error instanceof FunctionalFailure ? error.reason : 'FUNC_READINESS_LOST';
            record('ASSERTION', 'FAIL', reason, 'STAGE_CONTRACT', 'NOT_OBSERVED');
            scenarios.push({ id, status: 'FAIL', reason, durationMs: Math.ceil(performance.now() - begun) });
            record('SCENARIO', 'FAIL');
        }
    }
    return { version: 2, suite: 'batch-4-v1', runId, status: failed ? 'FAIL' : 'PASS', scenarios, trace };
}
