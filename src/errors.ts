export type ErrorCode = 'CONFIG' | 'RUNTIME' | 'UNSAFE_PATH' | 'PORT_CONFLICT' | 'PORT_UNAVAILABLE' | 'OWNERSHIP' | 'TIMEOUT' | 'ISOLATION_BLOCKED' | 'LAUNCH_BLOCKED' | 'PROCESS_FAILED';
export class RunnerError extends Error {
    constructor(public readonly code: ErrorCode, message: string) { super(message); }
}
// Unknown errors can include URLs, paths, tokens or inherited environment values.
export function publicError(error: unknown) {
    return error instanceof RunnerError
        ? { status: 'BLOCKED', code: error.code, message: error.message }
        : { status: 'BLOCKED', code: 'INTERNAL', message: 'Operation failed; raw details withheld.' };
}
