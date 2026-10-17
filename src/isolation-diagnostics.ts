export const isolationStages = ['NAMESPACE_CREATION', 'MOUNT_SETUP', 'BINARY_LIBRARY_AVAILABILITY', 'PRIVATE_LOOPBACK_NETWORKING', 'FILESYSTEM_CONTAINMENT', 'PROOF_VALIDATION'] as const;
export type IsolationStage = typeof isolationStages[number];
export const isolationReasons = [
    'NAMESPACE_SETUP_DENIED', 'NAMESPACE_IDENTITY_MISMATCH', 'NAMESPACE_INSPECTION_FAILED',
    'MOUNT_INSPECTION_FAILED', 'MOUNT_SOURCE_UNAVAILABLE', 'MOUNT_SETUP_FAILED', 'MOUNT_REQUIRED_MISSING', 'MOUNT_NOT_READ_ONLY', 'SCRATCH_NOT_WRITABLE',
    'BWRAP_UNAVAILABLE', 'SANDBOX_PROCESS_UNAVAILABLE', 'RUNTIME_BINARY_UNAVAILABLE', 'RUNTIME_EXECUTION_FAILED', 'PROOF_MODULE_UNAVAILABLE', 'RUNTIME_LIBRARY_UNAVAILABLE',
    'PRIVATE_LOOPBACK_SETUP_DENIED', 'LOOPBACK_INTERFACE_INVALID', 'LOOPBACK_INSPECTION_FAILED', 'LOOPBACK_BIND_DENIED',
    'SCRATCH_PREPARATION_FAILED', 'HOST_DIRECTORY_VISIBLE', 'ENVIRONMENT_NOT_ISOLATED', 'ENV_UNEXPECTED_VARIABLE', 'ENV_WORKING_DIRECTORY_MISMATCH', 'ENV_PATH_MISMATCH', 'ENV_HOME_MISMATCH', 'ENV_XDG_CONFIG_MISMATCH', 'ENV_XDG_CACHE_MISMATCH', 'ENV_XDG_DATA_MISMATCH', 'ENV_TMPDIR_MISMATCH', 'ENV_PWD_MISMATCH', 'WRITE_CONTAINMENT_FAILED', 'CONTAINMENT_INSPECTION_FAILED',
    'PROOF_MISSING', 'PROOF_MALFORMED', 'PROOF_STALE', 'PROOF_TIMEOUT', 'PROOF_PROCESS_FAILED', 'PROOF_WRITE_FAILED', 'SANDBOX_STARTUP_UNCLASSIFIED'
] as const;
export type IsolationReason = typeof isolationReasons[number];
export interface IsolationCheck {
    stage: IsolationStage;
    status: 'PASS' | 'FAIL' | 'NOT_VERIFIED';
}
export interface IsolationDiagnostic {
    stage: IsolationStage;
    reasonCode: IsolationReason;
    checks: IsolationCheck[];
}
export function emptyChecks(): IsolationCheck[] { return isolationStages.map(stage => ({ stage, status: 'NOT_VERIFIED' })); }
export function diagnostic(stage: IsolationStage, reasonCode: IsolationReason, checks = emptyChecks()): IsolationDiagnostic {
    return { stage, reasonCode, checks: checks.map(check => ({ ...check, status: check.stage === stage ? 'FAIL' : check.status })) };
}
export function sanitizeDiagnostic(value: unknown): IsolationDiagnostic {
    const fallback = () => diagnostic('PROOF_VALIDATION', 'PROOF_MALFORMED');
    if (!value || typeof value !== 'object')
        return fallback();
    const v = value as IsolationDiagnostic;
    if (!isolationStages.includes(v.stage) || !isolationReasons.includes(v.reasonCode) || !validChecks(v.checks))
        return fallback();
    return { stage: v.stage, reasonCode: v.reasonCode, checks: v.checks.map(check => ({ stage: check.stage, status: check.status })) };
}
function validChecks(value: unknown): value is IsolationCheck[] {
    return Array.isArray(value) && value.length === isolationStages.length && isolationStages.every((stage, index) => {
        const check = value[index];
        return check && check.stage === stage && ['PASS', 'FAIL', 'NOT_VERIFIED'].includes(check.status);
    });
}
// Only the trusted preflight's stderr is classified, bounded in memory. Neither
// raw text nor filenames are returned or persisted. Unknown text stays unknown.
export function classifyStartup(text: string): IsolationDiagnostic {
    if (/PL_ISOLATION_PROOF_WRITE_FAILED/.test(text))
        return diagnostic('PROOF_VALIDATION', 'PROOF_WRITE_FAILED');
    if (/loopback:.*(?:NETLINK_ROUTE|netlink|Operation not permitted)|setting up loopback/i.test(text))
        return diagnostic('PRIVATE_LOOPBACK_NETWORKING', 'PRIVATE_LOOPBACK_SETUP_DENIED');
    if (/creating new namespace|no permissions to create new namespace|unshare.*(?:failed|not permitted)|namespace.*(?:not permitted|permission denied)/i.test(text))
        return diagnostic('NAMESPACE_CREATION', 'NAMESPACE_SETUP_DENIED');
    if (/error while loading shared libraries|cannot open shared object file/i.test(text))
        return diagnostic('BINARY_LIBRARY_AVAILABILITY', 'RUNTIME_LIBRARY_UNAVAILABLE');
    if (/Cannot find module/.test(text))
        return diagnostic('BINARY_LIBRARY_AVAILABILITY', 'PROOF_MODULE_UNAVAILABLE');
    if (/execvp|execve|executable.*(?:not found|no such file)/i.test(text))
        return diagnostic('BINARY_LIBRARY_AVAILABILITY', 'RUNTIME_EXECUTION_FAILED');
    if (/bwrap:.*(?:bind mount|mounting|remount|mount |creating (?:dir|directory)|can't mkdir|failed to mkdir)/i.test(text))
        return diagnostic('MOUNT_SETUP', 'MOUNT_SETUP_FAILED');
    return diagnostic('PROOF_VALIDATION', 'SANDBOX_STARTUP_UNCLASSIFIED');
}
export function startupCollector() {
    let buffer = '';
    return {
        accept(chunk: Buffer) {
            if (buffer.length < 8192)
                buffer += chunk.subarray(0, 8192 - buffer.length).toString('utf8');
        },
        result() { const result = classifyStartup(buffer); buffer = ''; return result; }
    };
}
export interface ProofReport {
    version: 1;
    runId: string;
    status: 'PROBE_VERIFIED' | 'BLOCKED';
    checks: IsolationCheck[];
    diagnostic?: IsolationDiagnostic;
}
export function validateProof(value: unknown, runId: string, exitCode: number | null): {
    checks: IsolationCheck[];
    diagnostic?: IsolationDiagnostic;
} {
    const malformed = () => ({ checks: emptyChecks(), diagnostic: diagnostic('PROOF_VALIDATION', 'PROOF_MALFORMED') });
    if (!value || typeof value !== 'object')
        return malformed();
    const report = value as ProofReport;
    if (Object.keys(report).some(key => !['version', 'runId', 'status', 'checks', 'diagnostic'].includes(key)) || report.version !== 1 || typeof report.runId !== 'string' || !validChecks(report.checks))
        return malformed();
    if (report.runId !== runId)
        return { checks: emptyChecks(), diagnostic: diagnostic('PROOF_VALIDATION', 'PROOF_STALE') };
    if (report.status === 'BLOCKED') {
        const safe = sanitizeDiagnostic(report.diagnostic);
        // Invalid/inconsistent failure reports cannot prove any earlier stages.
        if (!report.diagnostic || report.checks.some((check, i) => check.stage !== safe.checks[i]?.stage || check.status !== safe.checks[i]?.status))
            return malformed();
        return { checks: safe.checks, diagnostic: safe };
    }
    if (report.status !== 'PROBE_VERIFIED' || report.diagnostic !== undefined || !report.checks.every(check => check.status === 'PASS'))
        return malformed();
    if (exitCode !== 0)
        return { checks: emptyChecks(), diagnostic: diagnostic('PROOF_VALIDATION', 'PROOF_PROCESS_FAILED') };
    return { checks: report.checks.map(check => ({ stage: check.stage, status: check.status })) };
}
