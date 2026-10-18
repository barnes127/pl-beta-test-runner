import { SmokeReport, publicSmokeReport } from './smoke-contract';
import { LifecycleDiagnostic, LifecycleReason, sanitizeLifecycle } from './lifecycle-diagnostics';
import { IsolationDiagnostic, sanitizeDiagnostic } from './isolation-diagnostics';
export type ErrorCode = 'CONFIG' | 'RUNTIME' | 'UNSAFE_PATH' | 'PORT_CONFLICT' | 'PORT_UNAVAILABLE' | 'OWNERSHIP' | 'TIMEOUT' | 'ISOLATION_BLOCKED' | 'LAUNCH_BLOCKED' | 'PROCESS_FAILED';
export class RunnerError extends Error {
    smoke?: SmokeReport;
    constructor(public readonly code: ErrorCode, message: string, public readonly diagnostic?: IsolationDiagnostic, public readonly lifecycle?: LifecycleDiagnostic) { super(message); }
}
// Unknown errors can include URLs, paths, tokens or inherited environment values.
export function publicError(error: unknown) {
    return error instanceof RunnerError
        ? { status: 'BLOCKED', code: error.code, message: error.message, ...(error.diagnostic ? { isolation: sanitizeDiagnostic(error.diagnostic) } : {}), ...(error.lifecycle ? { lifecycle: sanitizeLifecycle(error.lifecycle) } : {}), ...(error.smoke ? { smoke: publicSmokeReport(error.smoke) } : {}) }
        : { status: 'BLOCKED', code: 'INTERNAL', message: 'Operation failed; raw details withheld.' };
}
export function lifecycleError(reasonCode: LifecycleReason, retained = false) { return new RunnerError('LAUNCH_BLOCKED', 'Isolated lifecycle blocked; see sanitized reason.', undefined, { reasonCode, ...(retained ? { cleanup: 'RETAINED_FOR_REVIEW' as const } : {}) }); }
