// Fixed v0.1 suite only: no caller-supplied scripts, selectors, paths or RPCs.
export const smokeIds = ['PL-QA-BOOT-001', 'PL-QA-NAV-001', 'PL-QA-PROJ-001', 'PL-QA-PERSIST-001', 'PL-QA-PROJ-002'] as const;
export const functionalIds = ['PL-QA-FUNC-SETTINGS-001', 'PL-QA-FUNC-KEY-001', 'PL-QA-FUNC-DIALOG-001'] as const;
export const scenarioIds = [...smokeIds, ...functionalIds] as const;
export const smokeReasons = [
    'UI_ASSERTION_FAILED', 'UI_ACTION_FAILED', 'SCRATCH_ASSERTION_FAILED', 'READINESS_LOST',
    'BOOT_READINESS_LOST', 'BOOT_INSPECTION_FAILED', 'BOOT_NEW_PROJECT_MISSING_OR_AMBIGUOUS', 'BOOT_NEW_PROJECT_NOT_VISIBLE',
    'BOOT_PROJECT_STATE_MISSING_OR_AMBIGUOUS', 'BOOT_PROJECT_STATE_NOT_VISIBLE', 'BOOT_PROJECT_STATE_NOT_EMPTY',
    'BOOT_EVIDENCE_PROBE_CONTEXT_MISMATCH',
    'PROJ_READINESS_LOST', 'PROJ_SCRATCH_ROOT_INVALID', 'PROJ_NEW_PROJECT_ACTION_FAILED', 'PROJ_MODAL_NOT_READY',
    'PROJ_NAME_INPUT_FAILED', 'PROJ_ROOT_INPUT_FAILED', 'PROJ_CREATE_ACTION_FAILED', 'PROJ_CREATE_REJECTED',
    'PROJ_MODAL_DID_NOT_CLOSE', 'PROJ_CONTEXT_NOT_UPDATED', 'PROJ_MANIFEST_INVALID',
    'PROJ_DUPLICATE_CREATE_FAILED', 'PROJ_DUPLICATE_ERROR_NOT_VISIBLE', 'PROJ_DUPLICATE_MANIFEST_CHANGED',
    'PROJ_DUPLICATE_DIRECTORY_COUNT_CHANGED', 'PROJ_DUPLICATE_CONTEXT_CHANGED', 'PROJ_DUPLICATE_CANCEL_FAILED',
    'PROJ_DUPLICATE_MODAL_DID_NOT_CLOSE',
    'PERSIST_READINESS_LOST', 'PERSIST_FILE_NAME_INPUT_FAILED', 'PERSIST_CREATE_ACTION_FAILED',
    'PERSIST_FILE_NOT_LISTED', 'PERSIST_EDITOR_NOT_OPEN', 'PERSIST_CONTENT_INPUT_FAILED',
    'PERSIST_DIRTY_STATE_MISSING', 'PERSIST_SAVE_ACTION_FAILED', 'PERSIST_SAVED_STATE_MISSING',
    'PERSIST_SCRATCH_PATH_INVALID', 'PERSIST_SAVED_BYTES_MISMATCH', 'PERSIST_CLOSE_ACTION_FAILED',
    'PERSIST_EDITOR_NOT_CLOSED', 'PERSIST_CLOSED_FILE_NOT_LISTED', 'PERSIST_REOPEN_ACTION_FAILED',
    'PERSIST_REOPEN_CONTENT_MISMATCH', 'PERSIST_REOPEN_BYTES_MISMATCH',
    'FUNC_READINESS_LOST', 'FUNC_THEME_ACTION_FAILED', 'FUNC_THEME_NOT_VISIBLE', 'FUNC_THEME_NOT_PERSISTED',
    'FUNC_THEME_RESTORE_FAILED', 'FUNC_SHORTCUT_ACTION_FAILED', 'FUNC_SHORTCUT_NAV_NOT_VISIBLE',
    'FUNC_SHORTCUT_CONTEXT_NOT_VISIBLE', 'FUNC_EQUIVALENT_NAV_FAILED',
    'FUNC_DIALOG_OPEN_FAILED', 'FUNC_DIALOG_CANCEL_FAILED', 'FUNC_DIALOG_ESCAPE_FAILED',
    'FUNC_DIALOG_CONTEXT_CHANGED', 'FUNC_DIALOG_SCRATCH_CHANGED'
] as const;
export const evidenceTargets = [
    'NEW_PROJECT_BUTTON', 'PROJECT_STATE', 'CODE_NAVIGATION', 'ACTIVE_CODE_NAVIGATION',
    'WORKSPACE_TITLE', 'EMPTY_WORKSPACE', 'PROJECT_MODAL', 'PROJECT_NAME_INPUT',
    'PROJECT_ROOT_INPUT', 'PROJECT_CREATE_BUTTON', 'PROJECT_ERROR', 'PROJECT_CONTEXT',
    'CODE_FILENAME_INPUT', 'CODE_CREATE_BUTTON', 'CODE_FILE_LIST', 'CODE_EDITOR',
    'DIRTY_STATUS', 'SAVED_STATUS', 'SAVE_BUTTON', 'CLOSE_BUTTON', 'RECENT_PROJECT_ITEM',
    'STATUS_BAR', 'SCRATCH_PROJECT_ROOT', 'PROJECT_MANIFEST', 'DUPLICATE_MANIFEST',
    'PROJECT_DIRECTORY_COUNT', 'SAVED_FILE_BYTES', 'REOPENED_FILE_BYTES',
    'UI_TARGET_UNMAPPED', 'THEME_CONTROL', 'THEME_STATE', 'THEME_PERSISTENCE',
    'SHORTCUT_ACTION', 'SHORTCUT_NAVIGATION', 'DIALOG_ACTION', 'DIALOG_STATE'
] as const;
export const evidenceExpectations = [
    'ACTION_DISPATCHED', 'ONE_ELEMENT', 'VISIBLE_ELEMENT', 'EXACT_FIXTURE_TEXT',
    'EXACT_FIXTURE_VALUE', 'ELEMENT_ABSENT', 'NONEMPTY_STATUS', 'STAGE_CONTRACT',
    'SCRATCH_CONTAINED', 'MANIFEST_NAME_SCHEMA_MATCH', 'MANIFEST_UNCHANGED',
    'DIRECTORY_COUNT_UNCHANGED', 'EXACT_FIXTURE_BYTES', 'THEME_PERSISTED', 'NO_PROJECT_CREATED'
] as const;
export type SmokeTraceEvent = {
    scenarioId: typeof scenarioIds[number];
    kind: 'SCENARIO' | 'ACTION' | 'ASSERTION';
    outcome: 'START' | 'PASS' | 'FAIL';
    elapsedMs: number;
    target?: typeof evidenceTargets[number] | typeof smokeReasons[number];
    expected?: typeof evidenceExpectations[number];
    actual?: 'OBSERVED' | 'NOT_OBSERVED' | 'UNVERIFIED';
};
export interface SmokeReport {
    version: 1 | 2;
    suite?: 'batch-4-v1';
    runId: string;
    status: 'PASS' | 'FAIL';
    trace?: SmokeTraceEvent[];
    scenarios: {
        id: typeof scenarioIds[number];
        status: 'PASS' | 'FAIL' | 'NOT_RUN';
        reason?: typeof smokeReasons[number];
        durationMs?: number;
    }[];
}
export function validateSmokePlan(value: any, runId: string) {
    if (!value || Object.keys(value).sort().join(',') !== 'evidenceProbe,isolationReview,runId,suite,version' || value.version !== 2 || value.runId !== runId || !['batch-2-v1', 'batch-4-v1'].includes(value.suite) || (value.suite === 'batch-4-v1' && value.evidenceProbe !== false) || value.isolationReview !== 'PENDING' || typeof value.evidenceProbe !== 'boolean')
        throw new Error();
    return value as {
        version: 2;
        runId: string;
        suite: 'batch-2-v1' | 'batch-4-v1';
        isolationReview: 'PENDING';
        evidenceProbe: boolean;
    };
}
export function validateSmokePermit(value: any, runId: string) {
    if (!value || Object.keys(value).sort().join(',') !== 'electronPid,electronStart,rendererPid,rendererStart,runId,version' || value.version !== 2 || value.runId !== runId || !Number.isSafeInteger(value.electronPid) || value.electronPid < 1 || !Number.isSafeInteger(value.rendererPid) || value.rendererPid < 1 || !/^\d+$/.test(value.electronStart) || !/^\d+$/.test(value.rendererStart))
        throw new Error();
    return value as {
        version: 2;
        runId: string;
        electronPid: number;
        electronStart: string;
        rendererPid: number;
        rendererStart: string;
    };
}
export function validateSmokeReport(value: any, runId: string): SmokeReport {
    const functional = value?.version === 2 && value?.suite === 'batch-4-v1';
    const ids = functional ? functionalIds : smokeIds;
    if (!value || Object.keys(value).some(k => !['runId', 'scenarios', 'status', 'version', 'trace', 'suite'].includes(k)) || (functional ? value.suite !== 'batch-4-v1' : value.version !== 1 || value.suite !== undefined) || value.runId !== runId || !['PASS', 'FAIL'].includes(value.status) || !Array.isArray(value.scenarios) || value.scenarios.length !== ids.length)
        throw new Error();
    const trace = value.trace === undefined ? undefined : validateSmokeTrace(value.trace);
    let failed = false;
    const scenarios: SmokeReport['scenarios'] = value.scenarios.map((item: any, index: number) => {
        if (!item || Object.keys(item).some(k => !['id', 'status', 'reason', 'durationMs'].includes(k)) || item.id !== ids[index] || !['PASS', 'FAIL', 'NOT_RUN'].includes(item.status) || (item.durationMs !== undefined && (!Number.isSafeInteger(item.durationMs) || item.durationMs < 0 || item.durationMs > 150000 || (item.status === 'NOT_RUN' && item.durationMs !== 0))))
            throw new Error();
        if (item.status === 'FAIL') {
            if (failed || !smokeReasons.includes(item.reason) || (functional !== item.reason.startsWith('FUNC_')) || (item.reason.startsWith('BOOT_') && item.id !== smokeIds[0]) || (item.reason.startsWith('PROJ_') && item.id !== smokeIds[2] && item.id !== smokeIds[4]) || (item.reason.startsWith('PERSIST_') && item.id !== smokeIds[3]))
                throw new Error();
            if (functional && (!item.reason.startsWith('FUNC_') || (item.reason.startsWith('FUNC_THEME_') && item.id !== functionalIds[0]) || (item.reason.startsWith('FUNC_SHORTCUT_') && item.id !== functionalIds[1]) || (item.reason.startsWith('FUNC_DIALOG_') && item.id !== functionalIds[2])))
                throw new Error();
            failed = true;
        }
        else if (item.reason !== undefined || (failed ? item.status !== 'NOT_RUN' : item.status !== 'PASS'))
            throw new Error();
        return { id: item.id, status: item.status, ...(item.reason ? { reason: item.reason } : {}), ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}) };
    });
    if ((value.status === 'FAIL') !== failed)
        throw new Error();
    if (trace) {
        const executed = scenarios.filter(item => item.status !== 'NOT_RUN');
        const starts = trace.filter(item => item.kind === 'SCENARIO' && item.outcome === 'START');
        const finishes = trace.filter(item => item.kind === 'SCENARIO' && item.outcome !== 'START');
        if (starts.length !== executed.length || finishes.length !== executed.length || executed.some((item, index) => starts[index]?.scenarioId !== item.id || finishes[index]?.scenarioId !== item.id || finishes[index]?.outcome !== item.status))
            throw new Error();
        if (trace.some((item, index) => (index > 0 && item.elapsedMs < trace[index - 1]!.elapsedMs) || !ids.includes(item.scenarioId as never) || scenarios.find(s => s.id === item.scenarioId)?.status === 'NOT_RUN'))
            throw new Error();
        if (trace.some(item => item.kind !== 'SCENARIO' && item.outcome === 'FAIL' && scenarios.find(s => s.id === item.scenarioId)?.status !== 'FAIL'))
            throw new Error();
    }
    return { version: functional ? 2 : 1, ...(functional ? { suite: 'batch-4-v1' as const } : {}), runId, status: value.status, scenarios, ...(trace ? { trace } : {}) };
}
function validateSmokeTrace(value: any): NonNullable<SmokeReport['trace']> {
    if (!Array.isArray(value) || value.length > 128)
        throw new Error();
    return value.map((event: any) => {
        const scenario = event?.kind === 'SCENARIO';
        if (!event || Object.keys(event).sort().join(',') !== (scenario ? 'elapsedMs,kind,outcome,scenarioId' : 'actual,elapsedMs,expected,kind,outcome,scenarioId,target') || !scenarioIds.includes(event.scenarioId) || !['SCENARIO', 'ACTION', 'ASSERTION'].includes(event.kind) || !['START', 'PASS', 'FAIL'].includes(event.outcome) || !Number.isSafeInteger(event.elapsedMs) || event.elapsedMs < 0 || event.elapsedMs > 150000 || (event.outcome === 'START' && !scenario) || (!scenario && (![...evidenceTargets, ...smokeReasons].includes(event.target) || !evidenceExpectations.includes(event.expected) || !['OBSERVED', 'NOT_OBSERVED', 'UNVERIFIED'].includes(event.actual) || (event.outcome === 'PASS') !== (event.actual === 'OBSERVED'))))
            throw new Error();
        return { scenarioId: event.scenarioId, kind: event.kind, outcome: event.outcome, elapsedMs: event.elapsedMs, ...(scenario ? {} : { target: event.target, expected: event.expected, actual: event.actual }) };
    });
}
export function publicSmokeReport(value: SmokeReport) {
    try {
        const checked = validateSmokeReport(value, value.runId);
        return { status: checked.status, scenarios: checked.scenarios };
    }
    catch {
        return { status: 'INVALID', scenarios: [] };
    }
}
