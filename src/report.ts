import path from 'node:path';
import { lstat, realpath, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { RunnerError } from './errors';
import { LaunchObservation } from './launch';
import { smokeIds, smokeReasons, validateSmokeReport, SmokeReport } from './smoke-contract';
import { lifecycleReasons } from './lifecycle-diagnostics';
import { CoverageSummary, makeCoverage, validateCoverage } from './coverage';
const names = ['Application boot', 'Workspace navigation', 'New project and duplicate rejection', 'Code document persistence', 'Reopen project context'] as const;
const categories = ['UI', 'PERSISTENCE', 'SAFETY', 'LIFECYCLE', 'INFRASTRUCTURE', 'CONFIGURATION', 'INTERNAL'] as const;
const statuses = ['PASS', 'FAIL', 'BLOCKED'] as const;
const hash = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const marker = 'pl-beta-runner-reports-v1\n';
type Category = typeof categories[number];
type ScenarioId = typeof smokeIds[number];
type Scenario = {
    id: ScenarioId;
    name: string;
    result: 'PASS' | 'FAIL' | 'NOT_RUN';
    durationMs: number | null;
    reasonCode?: string;
    failureType?: Category;
};
export interface RunReport {
    version: 2;
    runId: string;
    timestamp: string;
    runnerVersion: '0.1.0';
    appVersion: string | 'NOT_VERIFIED';
    appBuild: LaunchObservation['build'] | null;
    environment: {
        platform: 'linux' | 'darwin' | 'win32' | 'other';
        arch: 'x64' | 'arm64' | 'other';
        nodeVersion: '22.12.0';
        electronVersion: '41.10.6';
        display: 'PRIVATE_XVFB_CONFIGURED';
        displayResolution: '1280x800x24_CONFIGURED';
        displayScale: 'NOT_VERIFIED';
        network: 'PRIVATE_LOOPBACK_CONFIGURED';
        automation: 'ELECTRON_WEB_CONTENTS';
        isolationProof: 'RUNTIME_VERIFIED' | 'NOT_VERIFIED';
    };
    executionMode: 'ISOLATED_SCRATCH_SMOKE';
    isolationReview: 'PENDING';
    overall: typeof statuses[number];
    scenarios: Scenario[];
    coverage: CoverageSummary;
    lifecycle: {
        shutdown: 'VERIFIED' | 'UNVERIFIED';
        cleanup: 'VERIFIED' | 'UNVERIFIED' | 'RETAINED_FOR_REVIEW';
        finalContainment: 'VERIFIED' | 'UNVERIFIED';
    };
    failure: {
        reasonCode: string;
        category: Category;
    } | null;
    evidence: {
        screenshot: 'OMITTED_CONTENT_SAFETY_UNVERIFIED';
        trace: NonNullable<SmokeReport['trace']>;
        reproduction: {
            command: 'pnpm qa run';
            scenarioId: ScenarioId | null;
            actions: string[];
        } | null;
    };
}
const actions: Record<ScenarioId, string[]> = {
    'PL-QA-BOOT-001': ['Start isolated application', 'Check visible ready window and preload bridge'],
    'PL-QA-NAV-001': ['Select Code IDE', 'Check active workspace and visible content'],
    'PL-QA-PROJ-001': ['Create disposable project through UI', 'Check manifest and context', 'Reject duplicate through UI'],
    'PL-QA-PERSIST-001': ['Create Code IDE file through UI', 'Edit and save unique content', 'Check scratch bytes', 'Close and reopen file'],
    'PL-QA-PROJ-002': ['Switch to alternate scratch project', 'Reopen original from recents', 'Check context and saved file']
};
function category(reason: string): Category {
    if (reason.includes('BYTES') || reason.includes('MANIFEST') || reason.includes('DIRECTORY_COUNT'))
        return 'PERSISTENCE';
    if (reason.includes('SCRATCH') || reason.includes('CONTAINMENT') || reason.includes('ISOLATION') || reason.includes('PATH_INVALID'))
        return 'SAFETY';
    if (reason.startsWith('BOOT_') || reason.startsWith('PROJ_') || reason.startsWith('PERSIST_') || reason.startsWith('UI_'))
        return 'UI';
    if (lifecycleReasons.includes(reason as typeof lifecycleReasons[number]) || reason === 'SHUTDOWN_UNVERIFIED' || reason === 'CLEANUP_UNVERIFIED')
        return 'LIFECYCLE';
    if (reason === 'CONFIG' || reason === 'RUNTIME' || reason === 'UNSAFE_PATH')
        return 'CONFIGURATION';
    if (reason === 'INTERNAL' || reason === 'REPORT_RESULT_INVALID')
        return 'INTERNAL';
    return 'INFRASTRUCTURE';
}
const runnerCodes = ['CONFIG', 'RUNTIME', 'UNSAFE_PATH', 'PORT_CONFLICT', 'PORT_UNAVAILABLE', 'OWNERSHIP', 'TIMEOUT', 'ISOLATION_BLOCKED', 'LAUNCH_BLOCKED', 'PROCESS_FAILED', 'INTERNAL', 'REPORT_RESULT_INVALID', 'SHUTDOWN_UNVERIFIED', 'CLEANUP_UNVERIFIED'] as const;
function reasonOf(error: unknown): string {
    if (error instanceof RunnerError) {
        if (error.lifecycle)
            return lifecycleReasons.includes(error.lifecycle.reasonCode) ? error.lifecycle.reasonCode : 'INTERNAL';
        return runnerCodes.includes(error.code) ? error.code : 'INTERNAL';
    }
    return 'INTERNAL';
}
function exact(value: unknown, keys: string[]) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.sort().join(',');
}
function validMs(value: unknown) {
    return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 150000;
}
export function makeRunReport(observation: LaunchObservation, success: unknown, error: unknown, timestamp = new Date().toISOString(), fallbackId = randomUUID()): RunReport {
    const runId = observation.runId && uuid.test(observation.runId) ? observation.runId : fallbackId;
    let smoke: SmokeReport | undefined;
    try {
        if (observation.smoke && observation.runId)
            smoke = validateSmokeReport(observation.smoke, observation.runId);
    }
    catch { /* A malformed child result never becomes report evidence. */ }
    const complete = !!smoke && smoke.scenarios.every(s => validMs(s.durationMs)) && !!smoke.trace?.length && smoke.scenarios.filter(s => s.status !== 'NOT_RUN').every(s => smoke!.trace!.some(t => t.scenarioId === s.id && t.kind === 'ASSERTION' && t.actual !== undefined));
    const shutdown = observation.shutdownComplete === true;
    const cleanup = observation.cleanupVerified === true;
    const scenarioFailure = smoke?.scenarios.find(s => s.status === 'FAIL');
    const successClaim = !!success && typeof success === 'object' && (success as {
        status?: unknown;
    }).status === 'LIFECYCLE_VERIFIED';
    const build = observation.build;
    const safeBuild = build && [build.sourceDigest, build.assetDigest, build.desktopDigest, build.snapshotDigest].every(v => hash.test(v)) && build.provenance === 'NOT_PROVEN' ? build : null;
    const verifiedVersion = typeof observation.appVersion === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(observation.appVersion) && observation.appVersion.length <= 32 ? observation.appVersion : 'NOT_VERIFIED';
    const coverage = makeCoverage(observation.registry, smokeIds.map((id, index) => ({ id, result: smoke?.scenarios[index]?.status ?? 'NOT_RUN' })));
    const reportReady = complete && safeBuild && verifiedVersion !== 'NOT_VERIFIED' && coverage.registry === 'INSPECTED_CHECKOUT';
    const overall = shutdown && cleanup && reportReady && !error && successClaim && smoke?.status === 'PASS' ? 'PASS'
        : shutdown && cleanup && reportReady && scenarioFailure && reasonOf(error) === 'SMOKE_SCENARIO_FAILED' ? 'FAIL' : 'BLOCKED';
    const reasonCode = overall === 'PASS' ? null : overall === 'FAIL' ? scenarioFailure!.reason!
        : !shutdown ? (error ? reasonOf(error) : 'SHUTDOWN_UNVERIFIED')
            : !cleanup ? (error ? reasonOf(error) : 'CLEANUP_UNVERIFIED')
                : !reportReady ? 'REPORT_RESULT_INVALID' : reasonOf(error);
    const scenarios: Scenario[] = smokeIds.map((id, index) => {
        const item = smoke?.scenarios[index];
        return { id, name: names[index]!, result: item?.status ?? 'NOT_RUN', durationMs: item?.durationMs ?? null,
            ...(item?.reason ? { reasonCode: item.reason, failureType: category(item.reason) } : {}) };
    });
    const failingId = scenarioFailure?.id ?? null;
    const report: RunReport = {
        version: 2, runId, timestamp, runnerVersion: '0.1.0', appVersion: verifiedVersion, appBuild: safeBuild,
        environment: { platform: ['linux', 'darwin', 'win32'].includes(process.platform) ? process.platform as 'linux' | 'darwin' | 'win32' : 'other', arch: ['x64', 'arm64'].includes(process.arch) ? process.arch as 'x64' | 'arm64' : 'other', nodeVersion: '22.12.0', electronVersion: '41.10.6', display: 'PRIVATE_XVFB_CONFIGURED', displayResolution: '1280x800x24_CONFIGURED', displayScale: 'NOT_VERIFIED', network: 'PRIVATE_LOOPBACK_CONFIGURED', automation: 'ELECTRON_WEB_CONTENTS', isolationProof: shutdown && !!smoke ? 'RUNTIME_VERIFIED' : 'NOT_VERIFIED' },
        executionMode: 'ISOLATED_SCRATCH_SMOKE', isolationReview: 'PENDING', overall, scenarios, coverage,
        lifecycle: { shutdown: shutdown ? 'VERIFIED' : 'UNVERIFIED', cleanup: cleanup ? 'VERIFIED' : observation.retained ? 'RETAINED_FOR_REVIEW' : 'UNVERIFIED', finalContainment: shutdown ? 'VERIFIED' : 'UNVERIFIED' },
        failure: reasonCode ? { reasonCode, category: category(reasonCode) } : null,
        evidence: { screenshot: 'OMITTED_CONTENT_SAFETY_UNVERIFIED', trace: smoke?.trace ?? [], reproduction: reasonCode ? { command: 'pnpm qa run', scenarioId: failingId, actions: failingId ? actions[failingId] : ['Run the fixed isolated smoke command'] } : null }
    };
    return validateRunReport(report);
}
export function validateRunReport(value: unknown): RunReport {
    if (!exact(value, ['version', 'runId', 'timestamp', 'runnerVersion', 'appVersion', 'appBuild', 'environment', 'executionMode', 'isolationReview', 'overall', 'scenarios', 'coverage', 'lifecycle', 'failure', 'evidence']))
        throw new Error('REPORT_RESULT_INVALID');
    const v = value as RunReport;
    if (v.version !== 2 || !uuid.test(v.runId) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.timestamp) || Number.isNaN(Date.parse(v.timestamp)) || v.runnerVersion !== '0.1.0' || !(v.appVersion === 'NOT_VERIFIED' || typeof v.appVersion === 'string' && v.appVersion.length <= 32 && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(v.appVersion)) || v.executionMode !== 'ISOLATED_SCRATCH_SMOKE' || v.isolationReview !== 'PENDING' || !statuses.includes(v.overall))
        throw new Error('REPORT_RESULT_INVALID');
    if (v.appBuild !== null && (!v.appBuild || !exact(v.appBuild, ['sourceDigest', 'assetDigest', 'desktopDigest', 'snapshotDigest', 'provenance']) || ![v.appBuild.sourceDigest, v.appBuild.assetDigest, v.appBuild.desktopDigest, v.appBuild.snapshotDigest].every(x => hash.test(x)) || v.appBuild.provenance !== 'NOT_PROVEN'))
        throw new Error('REPORT_RESULT_INVALID');
    const env = v.environment;
    if (!exact(env, ['platform', 'arch', 'nodeVersion', 'electronVersion', 'display', 'displayResolution', 'displayScale', 'network', 'automation', 'isolationProof']) || !['linux', 'darwin', 'win32', 'other'].includes(env.platform) || !['x64', 'arm64', 'other'].includes(env.arch) || env.nodeVersion !== '22.12.0' || env.electronVersion !== '41.10.6' || env.display !== 'PRIVATE_XVFB_CONFIGURED' || env.displayResolution !== '1280x800x24_CONFIGURED' || env.displayScale !== 'NOT_VERIFIED' || env.network !== 'PRIVATE_LOOPBACK_CONFIGURED' || env.automation !== 'ELECTRON_WEB_CONTENTS' || !['RUNTIME_VERIFIED', 'NOT_VERIFIED'].includes(env.isolationProof))
        throw new Error('REPORT_RESULT_INVALID');
    const life = v.lifecycle;
    if (!exact(life, ['shutdown', 'cleanup', 'finalContainment']) || !['VERIFIED', 'UNVERIFIED'].includes(life.shutdown) || !['VERIFIED', 'UNVERIFIED', 'RETAINED_FOR_REVIEW'].includes(life.cleanup) || !['VERIFIED', 'UNVERIFIED'].includes(life.finalContainment) || (life.shutdown === 'VERIFIED') !== (life.finalContainment === 'VERIFIED') || (env.isolationProof === 'RUNTIME_VERIFIED' && life.shutdown !== 'VERIFIED'))
        throw new Error('REPORT_RESULT_INVALID');
    if (!Array.isArray(v.scenarios) || v.scenarios.length !== smokeIds.length)
        throw new Error('REPORT_RESULT_INVALID');
    validateCoverage(v.coverage, v.scenarios);
    let stopped = false;
    let failures = 0;
    for (const [index, s] of v.scenarios.entries()) {
        if (!s || !exact(s, s.reasonCode === undefined ? ['id', 'name', 'result', 'durationMs'] : ['id', 'name', 'result', 'durationMs', 'reasonCode', 'failureType']) || s.id !== smokeIds[index] || s.name !== names[index] || !['PASS', 'FAIL', 'NOT_RUN'].includes(s.result) || (s.durationMs !== null && !validMs(s.durationMs)) || (s.result === 'FAIL') !== (s.reasonCode !== undefined) || (s.reasonCode !== undefined && (!smokeReasons.includes(s.reasonCode as typeof smokeReasons[number]) || s.failureType !== category(s.reasonCode))))
            throw new Error('REPORT_RESULT_INVALID');
        if (s.result === 'FAIL') {
            if (stopped || ++failures > 1)
                throw new Error('REPORT_RESULT_INVALID');
            stopped = true;
        }
        else if (s.result === 'NOT_RUN')
            stopped = true;
        else if (stopped)
            throw new Error('REPORT_RESULT_INVALID');
    }
    if (v.failure !== null && (!exact(v.failure, ['reasonCode', 'category']) || ![...smokeReasons, ...lifecycleReasons, ...runnerCodes].includes(v.failure.reasonCode as any) || v.failure.category !== category(v.failure.reasonCode)))
        throw new Error('REPORT_RESULT_INVALID');
    if ((v.overall === 'PASS') !== (v.failure === null) || (v.overall === 'PASS' && (life.shutdown !== 'VERIFIED' || life.cleanup !== 'VERIFIED' || v.scenarios.some(s => s.result !== 'PASS' || !validMs(s.durationMs)))))
        throw new Error('REPORT_RESULT_INVALID');
    if (v.overall === 'FAIL' && (life.shutdown !== 'VERIFIED' || life.cleanup !== 'VERIFIED' || v.scenarios.filter(s => s.result === 'FAIL').length !== 1 || v.failure?.reasonCode !== v.scenarios.find(s => s.result === 'FAIL')?.reasonCode))
        throw new Error('REPORT_RESULT_INVALID');
    if (v.overall === 'FAIL' && !v.evidence?.trace?.some(t => t.scenarioId === v.scenarios.find(s => s.result === 'FAIL')?.id && t.kind === 'ASSERTION' && t.outcome === 'FAIL' && t.target === v.failure?.reasonCode))
        throw new Error('REPORT_RESULT_INVALID');
    if (!exact(v.evidence, ['screenshot', 'trace', 'reproduction']) || v.evidence.screenshot !== 'OMITTED_CONTENT_SAFETY_UNVERIFIED' || !Array.isArray(v.evidence.trace) || v.evidence.trace.length > 128)
        throw new Error('REPORT_RESULT_INVALID');
    if (v.overall !== 'BLOCKED' && (v.appBuild === null || v.appVersion === 'NOT_VERIFIED' || v.coverage.registry !== 'INSPECTED_CHECKOUT' || env.isolationProof !== 'RUNTIME_VERIFIED' || v.evidence.trace.length === 0 || v.scenarios.some(s => s.result !== 'NOT_RUN' && !validMs(s.durationMs)) || v.scenarios.filter(s => s.result !== 'NOT_RUN').some(s => !v.evidence.trace.some(t => t.scenarioId === s.id && t.kind === 'ASSERTION' && t.actual !== undefined))))
        throw new Error('REPORT_RESULT_INVALID');
    // Reuse the nonce-bound child validator for every trace entry and its
    // relationship to the reported scenario outcomes.
    if (v.evidence.trace.length)
        validateSmokeReport({ version: 1, runId: v.runId, status: v.scenarios.some(s => s.result === 'FAIL') ? 'FAIL' : 'PASS', scenarios: v.scenarios.map(s => ({ id: s.id, status: s.result, ...(s.reasonCode ? { reason: s.reasonCode } : {}), ...(s.durationMs !== null ? { durationMs: s.durationMs } : {}) })), trace: v.evidence.trace }, v.runId);
    const rep = v.evidence.reproduction;
    if (v.failure === null ? rep !== null : !exact(rep, ['command', 'scenarioId', 'actions']))
        throw new Error('REPORT_RESULT_INVALID');
    if (rep) {
        const expected = rep.scenarioId ? actions[rep.scenarioId] : ['Run the fixed isolated smoke command'];
        if (rep.command !== 'pnpm qa run' || (rep.scenarioId !== null && !smokeIds.includes(rep.scenarioId)) || !Array.isArray(rep.actions) || rep.actions.length !== expected?.length || rep.actions.some((action, index) => typeof action !== 'string' || action !== expected?.[index]))
            throw new Error('REPORT_RESULT_INVALID');
    }
    return v;
}
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
export function renderHtml(value: unknown): string {
    const r = validateRunReport(value);
    const esc = (x: unknown) => escapeHtml(String(x));
    const rows = r.scenarios.map(s => `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.result)}</td><td>${esc(s.durationMs === null ? 'Not measured' : `${s.durationMs} ms`)}</td><td>${esc(s.reasonCode ?? '—')}</td><td>${esc(s.failureType ?? '—')}</td></tr>`).join('');
    const build = r.appBuild ? Object.entries(r.appBuild).map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join('') : '<li>Unavailable</li>';
    const repro = r.evidence.reproduction ? `<h2>Reproduction</h2><p>${esc(r.evidence.reproduction.command)} · ${esc(r.evidence.reproduction.scenarioId ?? 'Infrastructure')}</p><ol>${r.evidence.reproduction.actions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : '';
    const trace = r.evidence.trace.map(e => `<tr><td>${esc(e.scenarioId)}</td><td>${esc(e.kind)}</td><td>${esc(e.target ?? '—')}</td><td>${esc(e.expected ?? '—')}</td><td>${esc(e.actual ?? '—')}</td><td>${esc(e.elapsedMs)} ms</td></tr>`).join('');
    const coverage = r.coverage.capabilities.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(c.registryStatus)}</td><td>${esc(c.testIds.join(', ') || '—')}</td><td>${esc(c.coverage)}</td></tr>`).join('');
    const mappings = r.coverage.scenarios.map(s => `<tr><td>${esc(s.id)}</td><td>${esc(s.capabilityIds.join(', ') || 'UNMAPPED')}</td><td>${esc(s.result)}</td><td>${esc(s.mode)}</td></tr>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><title>PL QA ${esc(r.overall)}</title></head><body><h1>PL Beta Test Runner — ${esc(r.overall)}</h1><p>Run ${esc(r.runId)} · ${esc(r.timestamp)} · runner ${esc(r.runnerVersion)} · Suite ${esc(r.appVersion)}</p><p>Failure: ${esc(r.failure?.reasonCode ?? 'None')} (${esc(r.failure?.category ?? '—')})</p><h2>Scenarios</h2><table border="1"><thead><tr><th>ID</th><th>Name</th><th>Result</th><th>Duration</th><th>Reason</th><th>Type</th></tr></thead><tbody>${rows}</tbody></table><h2>Environment</h2><p>${esc(r.environment.platform)}/${esc(r.environment.arch)} · Node ${esc(r.environment.nodeVersion)} · Electron ${esc(r.environment.electronVersion)} · ${esc(r.executionMode)} · ${esc(r.environment.display)} · ${esc(r.environment.displayResolution)} · scale ${esc(r.environment.displayScale)} · ${esc(r.environment.network)} · ${esc(r.environment.automation)}</p><p>Automated isolation proof: ${esc(r.environment.isolationProof)}. Formal isolation review: ${esc(r.isolationReview)}.</p><h2>Build fingerprints</h2><ul>${build}</ul><h2>Lifecycle</h2><p>Shutdown ${esc(r.lifecycle.shutdown)} · cleanup ${esc(r.lifecycle.cleanup)} · final containment ${esc(r.lifecycle.finalContainment)}</p><h2>Evidence</h2><p>Screenshot ${esc(r.evidence.screenshot)}. Step observations are fixed codes; actual values come from the executed UI and scratch oracles.</p><table border="1"><thead><tr><th>Scenario</th><th>Kind</th><th>Target / failing step</th><th>Expected</th><th>Actual</th><th>Elapsed</th></tr></thead><tbody>${trace}</tbody></table>${repro}<h2>Coverage</h2><p>Registry ${esc(r.coverage.registry)} · digest ${esc(r.coverage.registryDigest ?? 'NOT_VERIFIED')} · build binding ${esc(r.coverage.buildBinding)}. Implemented registry capabilities ${esc(r.coverage.implementedCapabilities ?? 'NOT_VERIFIED')}; applicable behavior denominator ${esc(r.coverage.denominatorReason)}. Manual coverage ${esc(r.coverage.manualCoverage)}.</p><p>Automated smoke scenarios: ${esc(r.coverage.scenarioCounts.passed)} passed / ${esc(r.coverage.scenarioCounts.executed)} executed / ${esc(r.coverage.scenarioCounts.implemented)} implemented; ${esc(r.coverage.scenarioCounts.failed)} failed, ${esc(r.coverage.scenarioCounts.blocked)} blocked, ${esc(r.coverage.scenarioCounts.skipped)} skipped. A mapped PASS validates only the listed behavior, not the entire capability.</p><table border="1"><thead><tr><th>Scenario</th><th>Capability ID(s)</th><th>Result</th><th>Mode</th></tr></thead><tbody>${mappings}</tbody></table><h3>Registry inventory</h3><table border="1"><thead><tr><th>Capability ID</th><th>Registry status</th><th>Linked smoke test(s)</th><th>Runner coverage</th></tr></thead><tbody>${coverage}</tbody></table></body></html>`;
}
async function safeDirectory(directory: string, privateMode: boolean) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (privateMode && (info.mode & 0o077) !== 0) || await realpath(directory) !== directory)
        throw new Error('REPORT_PATH_UNSAFE');
}
async function safeMarker(reports: string) {
    const filename = path.join(reports, '.owner');
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size !== Buffer.byteLength(marker) || await realpath(filename) !== filename || await readFile(filename, 'utf8') !== marker)
        throw new Error('REPORT_PATH_UNSAFE');
}
export async function writeRunReport(runnerRoot: string, value: unknown) {
    const report = validateRunReport(value);
    const root = path.resolve(runnerRoot);
    await safeDirectory(root, false);
    const artifacts = path.join(root, 'artifacts');
    try {
        await mkdir(artifacts, { mode: 0o700 });
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
            throw error;
    }
    await safeDirectory(artifacts, false);
    const reports = path.join(artifacts, 'reports');
    try {
        await mkdir(reports, { mode: 0o700 });
        await writeFile(path.join(reports, '.owner'), marker, { flag: 'wx', mode: 0o600 });
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
            throw error;
    }
    await safeDirectory(reports, true);
    await safeMarker(reports);
    const directory = path.join(reports, report.runId);
    await mkdir(directory, { mode: 0o700 });
    await safeDirectory(directory, true);
    await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(path.join(directory, 'report.html'), renderHtml(report), { flag: 'wx', mode: 0o600 });
    return { json: `artifacts/reports/${report.runId}/report.json`, html: `artifacts/reports/${report.runId}/report.html` };
}
export async function reviewRunReport(runnerRoot: string, relativeJson: string) {
    const match = /^artifacts\/reports\/([a-f0-9-]{36})\/report\.json$/.exec(relativeJson);
    if (!match || !uuid.test(match[1]!))
        throw new Error('REPORT_PATH_UNSAFE');
    const root = path.resolve(runnerRoot);
    await safeDirectory(root, false);
    const reports = path.join(root, 'artifacts', 'reports');
    await safeDirectory(path.join(root, 'artifacts'), false);
    await safeDirectory(reports, true);
    await safeMarker(reports);
    const directory = path.join(reports, match[1]!);
    await safeDirectory(directory, true);
    const jsonPath = path.join(directory, 'report.json');
    const htmlPath = path.join(directory, 'report.html');
    for (const file of [jsonPath, htmlPath]) {
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size > 2000000 || await realpath(file) !== file)
            throw new Error('REPORT_PATH_UNSAFE');
    }
    const report = validateRunReport(JSON.parse(await readFile(jsonPath, 'utf8')));
    if (report.runId !== match[1] || await readFile(htmlPath, 'utf8') !== renderHtml(report))
        throw new Error('REPORT_RESULT_INVALID');
    const failure = report.scenarios.find(s => s.result === 'FAIL');
    const failedStep = report.evidence.trace.find(t => t.scenarioId === failure?.id && t.kind === 'ASSERTION' && t.outcome === 'FAIL' && t.expected !== 'STAGE_CONTRACT')
        ?? report.evidence.trace.find(t => t.scenarioId === failure?.id && t.kind === 'ASSERTION' && t.outcome === 'FAIL' && t.target === failure?.reasonCode);
    return { status: 'REPORT_VERIFIED', overall: report.overall, runId: report.runId, failure: report.failure, failedScenario: failure?.id ?? null, failedStep: failedStep ? { target: failedStep.target, expected: failedStep.expected, actual: failedStep.actual } : null, lifecycle: report.lifecycle, screenshot: report.evidence.screenshot, coverage: report.coverage.scenarioCounts, isolationReview: report.isolationReview };
}
