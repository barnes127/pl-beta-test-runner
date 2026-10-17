export const lifecycleReasons = [
    'PRELOAD_REVIEW_MISMATCH', 'PRELOAD_SNAPSHOT_INVALID',
    'PRELOAD_DECLARATION_MISSING', 'PRELOAD_DECLARATION_MISMATCH', 'PRELOAD_FILE_INVALID', 'PRELOAD_DECLARATION_CAPTURE_UNAVAILABLE',
    'PRELOAD_DECLARATION_UNVERIFIED', 'PRELOAD_EXECUTION_FAILED',
    'SWITCH_NO_SANDBOX', 'SWITCH_DISABLE_WEB_SECURITY', 'SWITCH_DISABLE_GPU_SANDBOX', 'SWITCH_DISABLE_SETUID_SANDBOX',
    'PREF_SANDBOX_MISSING', 'PREF_SANDBOX_INVALID', 'PREF_CONTEXT_ISOLATION_MISSING', 'PREF_CONTEXT_ISOLATION_INVALID',
    'PREF_NODE_INTEGRATION_MISSING', 'PREF_NODE_INTEGRATION_INVALID', 'PREF_WEB_SECURITY_DISABLED',
    'PREF_PRELOAD_MISSING', 'PREF_PRELOAD_TYPE_INVALID', 'PREF_PRELOAD_PATH_MISMATCH',
    'SUITE_WINDOW_IDENTITY_INVALID', 'SUITE_WINDOW_LOCATION_INVALID',
    'ELECTRON_VERSION_MISMATCH', 'ELECTRON_ALREADY_READY', 'APP_PATH_MISMATCH', 'STORAGE_PATH_MISMATCH', 'SECURITY_PREFERENCES_INVALID', 'PREFERENCE_INSPECTION_UNAVAILABLE',
    'ELECTRON_BOOTSTRAP_FAILED', 'TARGET_IMPORT_FAILED', 'PRELOAD_BRIDGE_MISSING', 'UI_READY_TIMEOUT', 'DISPLAY_STARTUP_FAILED', 'RENDERER_STARTUP_FAILED',
    'ELECTRON_STARTUP_FAILED', 'RPC_OWNERSHIP_FAILED', 'ELECTRON_SHUTDOWN_TIMEOUT', 'ELECTRON_EXIT_FAILED', 'STOP_REQUEST_FAILED', 'OWNED_SHUTDOWN_FAILED',
    'PORT_RELEASE_FAILED', 'FINAL_CONTAINMENT_FAILED', 'UNEXPECTED_PROCESS_REMAINS', 'LIFECYCLE_TIMEOUT', 'RESULT_INVALID', 'SCRATCH_CLEANUP_FAILED'
] as const;
export type LifecycleReason = typeof lifecycleReasons[number];
export interface LifecycleDiagnostic {
    reasonCode: LifecycleReason;
    cleanup?: 'RETAINED_FOR_REVIEW';
}
export function sanitizeLifecycle(value: unknown): LifecycleDiagnostic {
    const code = (value as LifecycleDiagnostic | undefined)?.reasonCode;
    return { reasonCode: lifecycleReasons.includes(code as LifecycleReason) ? code as LifecycleReason : 'RESULT_INVALID', ...((value as LifecycleDiagnostic | undefined)?.cleanup === 'RETAINED_FOR_REVIEW' ? { cleanup: 'RETAINED_FOR_REVIEW' as const } : {}) };
}
export interface SessionResult {
    version: 1;
    runId: string;
    status: 'LIFECYCLE_VERIFIED' | 'BLOCKED';
    shutdownComplete: boolean;
    guiMutations: false;
    diagnostic?: LifecycleDiagnostic;
}
export function validateSessionResult(value: unknown, runId: string, exitCode: number | null): SessionResult {
    if (!value || typeof value !== 'object')
        throw new Error();
    const v = value as SessionResult;
    if (Object.keys(v).some(key => !['version', 'runId', 'status', 'shutdownComplete', 'guiMutations', 'diagnostic'].includes(key)) || v.version !== 1 || v.runId !== runId || v.guiMutations !== false || typeof v.shutdownComplete !== 'boolean')
        throw new Error();
    if (v.status === 'LIFECYCLE_VERIFIED' && (exitCode !== 0 || !v.shutdownComplete || v.diagnostic !== undefined))
        throw new Error();
    if (v.status !== 'LIFECYCLE_VERIFIED' && v.status !== 'BLOCKED')
        throw new Error();
    if (v.status === 'BLOCKED' && !v.diagnostic)
        throw new Error();
    return { version: 1, runId, status: v.status, shutdownComplete: v.shutdownComplete, guiMutations: false, ...(v.diagnostic ? { diagnostic: sanitizeLifecycle(v.diagnostic) } : {}) };
}
