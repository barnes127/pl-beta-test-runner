import { lstat, readdir, realpath } from 'node:fs/promises';
import { waitFor } from './processes';
import { pageOperation } from './smoke';
import { wave3Ids, smokeReasons, SmokeReport, SmokeTraceEvent } from './smoke-contract';
interface Contents {
    executeJavaScript(code: string): Promise<unknown>;
}
type Reason = Extract<typeof smokeReasons[number], `W3_${string}`>;
class Wave3Failure extends Error {
    constructor(readonly reason: Reason) { super(reason); }
}
const projects = '/scratch/home/PLProjects';
// One fixed, synthetic shell workflow. Only booleans cross from the page;
// no localStorage value, project path, DOM text or RPC payload is reported.
export async function runWave3Scenarios(contents: Contents, runId: string, verifySession: () => Promise<void>): Promise<SmokeReport> {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId))
        throw new Wave3Failure('W3_READINESS_LOST');
    const id = wave3Ids[0];
    const trace: NonNullable<SmokeReport['trace']> = [];
    const started = performance.now();
    const record = (kind: SmokeTraceEvent['kind'], outcome: SmokeTraceEvent['outcome'], target?: SmokeTraceEvent['target'], expected?: SmokeTraceEvent['expected'], actual?: SmokeTraceEvent['actual']) => {
        if (trace.length < 128)
            trace.push({ scenarioId: id, kind, outcome, elapsedMs: Math.min(150000, Math.ceil(performance.now() - started)), ...(kind === 'SCENARIO' ? {} : { target: target!, expected: expected!, actual: actual! }) });
    };
    const verify = async () => {
        try {
            await verifySession();
        }
        catch {
            throw new Wave3Failure('W3_READINESS_LOST');
        }
    };
    const check = async (reason: Reason, target: SmokeTraceEvent['target'], expected: SmokeTraceEvent['expected'], code: string, action = false) => {
        await verify();
        let observed = false;
        let inspected = false;
        try {
            await waitFor(async () => {
                const value: unknown = await contents.executeJavaScript(code);
                if (typeof value !== 'boolean')
                    throw new Error();
                inspected = true;
                observed = value;
                return observed;
            }, action ? 1000 : 5000);
        }
        catch { /* Never propagate renderer output. */ }
        record(action ? 'ACTION' : 'ASSERTION', observed ? 'PASS' : 'FAIL', target, expected, observed ? 'OBSERVED' : inspected ? 'NOT_OBSERVED' : 'UNVERIFIED');
        if (!observed)
            throw new Wave3Failure(reason);
    };
    const noProjects = async () => {
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
            throw new Wave3Failure('W3_SCRATCH_CHANGED');
    };
    const op = (name: string, selector: string, text = '', value = '') => `(${pageOperation.toString()})(${[name, selector, text, value].map(v => JSON.stringify(v)).join(',')})`;
    const stored = (visible: boolean) => `(() => { try { return JSON.parse(localStorage.getItem('pl.shell.workspace-state.v1') || 'null')?.layout?.visibility?.inspector === ${visible}; } catch { return false; } })()`;
    record('SCENARIO', 'START');
    try {
        await noProjects();
        await check('W3_INITIAL_LAYOUT_MISSING', 'LAYOUT_STATE', 'VISIBLE_ELEMENT', op('present', '.healthContextRail strong', 'Health Center'));
        await check('W3_CLOSE_ACTION_FAILED', 'HEALTH_CONTROL', 'ACTION_DISPATCHED', op('click', '.healthContextRail button[aria-label="Close health center"]'), true);
        await check('W3_PANEL_DID_NOT_CLOSE', 'LAYOUT_STATE', 'ELEMENT_ABSENT', op('missing', '.healthContextRail'));
        await check('W3_CLOSED_STATE_NOT_PERSISTED', 'LAYOUT_PERSISTENCE', 'LAYOUT_PERSISTED', stored(false));
        await check('W3_RESET_ACTION_FAILED', 'LAYOUT_CONTROL', 'ACTION_DISPATCHED', op('click', 'button', 'Reset Layout'), true);
        await check('W3_PANEL_NOT_RESTORED', 'LAYOUT_STATE', 'VISIBLE_ELEMENT', op('present', '.healthContextRail strong', 'Health Center'));
        // The exact-text operation requires viewport visibility but does not
        // scroll its target. Bring the source-verified status bar into view
        // first, while still requiring the real visible text below.
        await check('W3_RESET_STATUS_NOT_VISIBLE', 'STATUS_BAR', 'VISIBLE_ELEMENT', op('scroll', '.statusLeft > span:first-child'));
        await check('W3_RESET_STATUS_MISSING', 'STATUS_BAR', 'EXACT_FIXTURE_TEXT', op('text', '.statusLeft > span:first-child', '', 'Status: Layout reset to default.'));
        await check('W3_RESET_STATE_NOT_PERSISTED', 'LAYOUT_PERSISTENCE', 'LAYOUT_PERSISTED', stored(true));
        await noProjects();
        record('SCENARIO', 'PASS');
        return { version: 2, suite: 'batch-4-v3', runId, status: 'PASS', scenarios: [{ id, status: 'PASS', durationMs: Math.ceil(performance.now() - started) }], trace };
    }
    catch (error) {
        const reason = error instanceof Wave3Failure ? error.reason : 'W3_READINESS_LOST';
        record('ASSERTION', 'FAIL', reason, 'STAGE_CONTRACT', 'UNVERIFIED');
        record('SCENARIO', 'FAIL');
        return { version: 2, suite: 'batch-4-v3', runId, status: 'FAIL', scenarios: [{ id, status: 'FAIL', reason, durationMs: Math.ceil(performance.now() - started) }], trace };
    }
}
