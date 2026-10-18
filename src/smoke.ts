import path from 'node:path';
import { realpath, lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { waitFor } from './processes';
import { smokeIds, smokeReasons, SmokeReport } from './smoke-contract';
const projects = '/scratch/home/PLProjects';
class SmokeFailure extends Error {
    constructor(readonly reason: typeof smokeReasons[number]) { super(reason); }
}
// Check every existing ancestor; no symlink aliases, host paths or target paths.
export async function assertSmokePath(candidate: string) {
    const absolute = path.resolve(candidate);
    if (absolute !== candidate || !candidate.startsWith(projects + '/'))
        throw new SmokeFailure('SCRATCH_ASSERTION_FAILED');
    let current = '/';
    for (const part of absolute.split('/').filter(Boolean)) {
        current = path.join(current, part);
        if ((await lstat(current)).isSymbolicLink() || await realpath(current) !== current)
            throw new SmokeFailure('SCRATCH_ASSERTION_FAILED');
    }
}
interface Contents {
    executeJavaScript(code: string): Promise<any>;
}
// This function is serialized into the actual page. It returns booleans only.
// Values are generated fixtures; no page URL, RPC token or arbitrary page text
// crosses the main/renderer boundary. React gets native value-setter events.
export function pageOperation(op: string, selector: string, text: string, value: string) {
    const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const candidates = Array.from(document.querySelectorAll(selector)).filter(el => !text || el.textContent?.trim() === text);
    if ((op === 'click' || op === 'fill' || op === 'scroll') && candidates.length === 1)
        (candidates[0] as HTMLElement).scrollIntoView({ block: 'center' });
    if (op === 'unique')
        return candidates.length === 1;
    if (op === 'missing')
        return candidates.length === 0;
    if (op === 'scroll')
        return candidates.length === 1 && visible(candidates[0]!);
    const matches = candidates.filter(visible);
    if (op === 'absent')
        return matches.length === 0;
    if (matches.length !== 1)
        return false;
    const el = matches[0]!;
    if (op === 'present')
        return true;
    if (op === 'nonempty')
        return Boolean(el.textContent?.trim());
    if (op === 'text')
        return el.textContent?.trim() === value;
    if (op === 'value')
        return (el as HTMLInputElement).value === value;
    if (op === 'click') {
        if ((el as HTMLButtonElement).disabled)
            return false;
        (el as HTMLElement).click();
        return true;
    }
    if (op === 'fill') {
        if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly)
            return false;
        const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    return false;
}
// Boot inspects the main workspace's project state, not a sidebar section
// that can be below the initial viewport. Both use the same Suite projectRoot.
// Only fixed booleans and allowlisted failure codes leave the page.
export async function verifyBootUI(contents: Contents, verifySession: () => Promise<void>) {
    try {
        await verifySession();
    }
    catch {
        throw new SmokeFailure('BOOT_READINESS_LOST');
    }
    const check = async (op: string, selector: string, text: string, expected: string, reason: typeof smokeReasons[number]) => {
        try {
            await waitFor(async () => {
                try {
                    const code = `(${pageOperation.toString()})(${[op, selector, text, expected].map(v => JSON.stringify(v)).join(',')})`;
                    return await contents.executeJavaScript(code) === true;
                }
                catch {
                    throw new SmokeFailure('BOOT_INSPECTION_FAILED');
                }
            }, 5000);
        }
        catch (error) {
            if (error instanceof SmokeFailure)
                throw error;
            throw new SmokeFailure(reason);
        }
    };
    const button = '.topbarRight button';
    await check('unique', button, 'New Project', '', 'BOOT_NEW_PROJECT_MISSING_OR_AMBIGUOUS');
    await check('present', button, 'New Project', '', 'BOOT_NEW_PROJECT_NOT_VISIBLE');
    const state = '.workspaceHeader .workspaceSubtitle';
    await check('unique', state, '', '', 'BOOT_PROJECT_STATE_MISSING_OR_AMBIGUOUS');
    await check('present', state, '', '', 'BOOT_PROJECT_STATE_NOT_VISIBLE');
    await check('text', state, '', 'No project open', 'BOOT_PROJECT_STATE_NOT_EMPTY');
}
// Stage errors deliberately discard raw UI, RPC and filesystem errors.
export async function projectStage<T>(reason: Extract<typeof smokeReasons[number], `PROJ_${string}`>, step: () => Promise<T>): Promise<T> {
    try {
        return await step();
    }
    catch (error) {
        if (error instanceof SmokeFailure && error.reason.startsWith('PROJ_'))
            throw error;
        throw new SmokeFailure(error instanceof SmokeFailure && error.reason === 'READINESS_LOST' ? 'PROJ_READINESS_LOST' : reason);
    }
}
export async function persistStage<T>(reason: Extract<typeof smokeReasons[number], `PERSIST_${string}`>, step: () => Promise<T>): Promise<T> {
    try {
        return await step();
    }
    catch (error) {
        if (error instanceof SmokeFailure && error.reason.startsWith('PERSIST_'))
            throw error;
        throw new SmokeFailure(error instanceof SmokeFailure && error.reason === 'READINESS_LOST' ? 'PERSIST_READINESS_LOST' : reason);
    }
}
export async function runSmokeScenarios(contents: Contents, runId: string, verifySession: () => Promise<void>): Promise<SmokeReport> {
    if (!/^[a-f0-9-]{36}$/.test(runId))
        throw new SmokeFailure('SCRATCH_ASSERTION_FAILED');
    const name = `plqa-${runId.slice(0, 12)}`;
    const project = path.join(projects, name);
    const other = `${name}-other`;
    const filename = 'qa-smoke.txt';
    const content = `PL QA disposable content ${runId}\n`;
    const manifest = path.join(project, 'pl-project.json');
    const file = path.join(project, 'code', filename);
    const scenarios: SmokeReport['scenarios'] = [];
    const trace: NonNullable<SmokeReport['trace']> = [];
    const started = performance.now();
    let activeScenario: typeof smokeIds[number] | undefined;
    const record = (kind: 'SCENARIO' | 'ACTION' | 'ASSERTION', outcome: 'START' | 'PASS' | 'FAIL') => {
        if (activeScenario && trace.length < 128)
            trace.push({ scenarioId: activeScenario, kind, outcome, elapsedMs: Math.min(150000, Math.max(0, Math.ceil(performance.now() - started))) });
    };
    let failed = false;
    const operation = async (op: string, selector: string, text = '', value = '') => {
        try {
            return await contents.executeJavaScript(`(${pageOperation.toString()})(${[op, selector, text, value].map(v => JSON.stringify(v)).join(',')})`) === true;
        }
        catch {
            throw new SmokeFailure('UI_ACTION_FAILED');
        }
    };
    const see = async (selector: string, text = '', value?: string, op = 'present') => {
        try {
            await waitFor(() => operation(value === undefined ? op : 'text', selector, text, value ?? ''), 5000);
            record('ASSERTION', 'PASS');
        }
        catch (error) {
            record('ASSERTION', 'FAIL');
            if (error instanceof SmokeFailure)
                throw error;
            throw new SmokeFailure('UI_ASSERTION_FAILED');
        }
    };
    const act = async (op: string, selector: string, text = '', value = '') => {
        // Revalidate the current owned window, snapshot, effective preferences,
        // bridge and lease permit before each UI mutation.
        try {
            await verifySession();
        }
        catch {
            record('ACTION', 'FAIL');
            throw new SmokeFailure('READINESS_LOST');
        }
        try {
            if (!await operation(op, selector, text, value))
                throw new SmokeFailure('UI_ACTION_FAILED');
            record('ACTION', 'PASS');
        }
        catch (error) {
            record('ACTION', 'FAIL');
            throw error;
        }
    };
    const button = (text: string, scope = '') => act('click', `${scope}button`, text);
    const openNew = async (projectName: string) => {
        await projectStage('PROJ_NEW_PROJECT_ACTION_FAILED', () => button('New Project'));
        await projectStage('PROJ_MODAL_NOT_READY', () => see('[role="dialog"] .modalTitle', 'Create New Project'));
        for (const [selector, value, reason] of [
            ['[role="dialog"] input[placeholder="My Project"]', projectName, 'PROJ_NAME_INPUT_FAILED'],
            ['[role="dialog"] input[placeholder="Defaults to ~/PLProjects"]', projects, 'PROJ_ROOT_INPUT_FAILED']
        ] as const)
            await projectStage(reason, async () => {
                await act('fill', selector, '', value);
                await waitFor(() => operation('value', selector, '', value), 5000);
            });
    };
    const projectContext = (root: string) => see('.workspaceHeader .workspaceSubtitle', '', `Project: ${root}`);
    const createProject = async (projectName: string) => {
        await openNew(projectName);
        await projectStage('PROJ_CREATE_ACTION_FAILED', () => button('Create', '[role="dialog"] '));
        await projectStage('PROJ_MODAL_DID_NOT_CLOSE', () => waitFor(async () => {
            if (await operation('nonempty', '[role="dialog"] .errorBox'))
                throw new SmokeFailure('PROJ_CREATE_REJECTED');
            return operation('absent', '[role="dialog"]');
        }, 5000));
        await projectStage('PROJ_CONTEXT_NOT_UPDATED', () => projectContext(path.join(projects, projectName)));
    };
    const diskContent = async () => { await assertSmokePath(file); return readFile(file, 'utf8'); };
    const seeScrolled = async (selector: string, text = '') => {
        await waitFor(() => operation('unique', selector), 5000);
        await act('scroll', selector);
        await see(selector, text);
    };
    const steps: (() => Promise<void>)[] = [];
    steps[0] = () => verifyBootUI(contents, verifySession);
    steps[1] = async () => {
        await see('.nav .NavItem:nth-child(2) .navLabel', 'Code IDE');
        await act('click', '.nav .NavItem:nth-child(2)');
        await see('.nav .NavItem.active .navLabel', 'Code IDE');
        await see('.workspaceHeader .workspaceTitle', 'code');
        await see('.emptyState', 'Open a project to use Code IDE.');
    };
    steps[2] = async () => {
        await projectStage('PROJ_SCRATCH_ROOT_INVALID', async () => {
            if (await realpath('/scratch/home') !== '/scratch/home' || (await lstat('/scratch/home')).isSymbolicLink())
                throw new Error();
            try {
                await lstat(projects);
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                    throw error;
                await mkdir(projects, { mode: 0o700 });
            }
            if (await realpath(projects) !== projects || (await readdir(projects)).length !== 0)
                throw new Error();
        });
        await createProject(name);
        const bytes = await projectStage('PROJ_MANIFEST_INVALID', async () => {
            await assertSmokePath(manifest);
            const bytes = await readFile(manifest);
            const parsed = JSON.parse(bytes.toString());
            if (parsed.name !== name || parsed.schemaVersion !== 1)
                throw new Error();
            return bytes;
        });
        // Negative UI path remains mandatory: visible error plus independent
        // unchanged manifest and directory-count oracles, not an RPC response.
        await openNew(name);
        await projectStage('PROJ_DUPLICATE_CREATE_FAILED', () => button('Create', '[role="dialog"] '));
        await projectStage('PROJ_DUPLICATE_ERROR_NOT_VISIBLE', () => see('[role="dialog"] .errorBox', '', undefined, 'nonempty'));
        await projectStage('PROJ_DUPLICATE_MANIFEST_CHANGED', async () => {
            await assertSmokePath(manifest);
            if (createHash('sha256').update(await readFile(manifest)).digest('hex') !== createHash('sha256').update(bytes).digest('hex'))
                throw new Error();
        });
        await projectStage('PROJ_DUPLICATE_DIRECTORY_COUNT_CHANGED', async () => {
            if ((await readdir(projects)).length !== 1)
                throw new Error();
        });
        await projectStage('PROJ_DUPLICATE_CONTEXT_CHANGED', () => projectContext(project));
        await projectStage('PROJ_DUPLICATE_CANCEL_FAILED', () => button('Cancel', '[role="dialog"] '));
        await projectStage('PROJ_DUPLICATE_MODAL_DID_NOT_CLOSE', () => see('[role="dialog"]', '', undefined, 'absent'));
    };
    steps[3] = async () => {
        const input = 'input[placeholder="main.py"]';
        const editor = 'textarea.codeEditor';
        const listed = '.workspaceSplitSide button.listNutton strong';
        await persistStage('PERSIST_FILE_NAME_INPUT_FAILED', async () => {
            await act('fill', input, '', filename);
            await waitFor(() => operation('value', input, '', filename), 5000);
        });
        await persistStage('PERSIST_CREATE_ACTION_FAILED', () => button('Create', '.workspaceSplitSide '));
        // The Suite marks its active file with a literal checkmark in <strong>.
        await persistStage('PERSIST_FILE_NOT_LISTED', () => seeScrolled(listed, `${filename} ✓`));
        await persistStage('PERSIST_EDITOR_NOT_OPEN', () => seeScrolled(editor));
        await persistStage('PERSIST_CONTENT_INPUT_FAILED', async () => {
            await act('fill', editor, '', content);
            await waitFor(() => operation('value', editor, '', content), 5000);
        });
        await persistStage('PERSIST_DIRTY_STATE_MISSING', () => seeScrolled('.codeMeta .docsDirty', 'Unsaved changes'));
        await persistStage('PERSIST_SAVE_ACTION_FAILED', () => button('Save File'));
        await persistStage('PERSIST_SAVED_STATE_MISSING', () => seeScrolled('.codeMeta .docsSaved', 'Saved'));
        await persistStage('PERSIST_SCRATCH_PATH_INVALID', () => assertSmokePath(file));
        await persistStage('PERSIST_SAVED_BYTES_MISMATCH', async () => {
            if (await readFile(file, 'utf8') !== content)
                throw new Error();
        });
        await persistStage('PERSIST_CLOSE_ACTION_FAILED', () => button('Close File'));
        await persistStage('PERSIST_EDITOR_NOT_CLOSED', () => waitFor(() => operation('missing', editor), 5000));
        await persistStage('PERSIST_CLOSED_FILE_NOT_LISTED', () => seeScrolled(listed, filename));
        await persistStage('PERSIST_REOPEN_ACTION_FAILED', () => act('click', '.workspaceSplitSide button.listNutton'));
        await persistStage('PERSIST_REOPEN_CONTENT_MISMATCH', async () => {
            await waitFor(() => operation('unique', editor), 5000);
            await act('scroll', editor);
            await waitFor(() => operation('value', editor, '', content), 5000);
        });
        await persistStage('PERSIST_SCRATCH_PATH_INVALID', () => assertSmokePath(file));
        await persistStage('PERSIST_REOPEN_BYTES_MISMATCH', async () => {
            if (await readFile(file, 'utf8') !== content)
                throw new Error();
        });
    };
    steps[4] = async () => {
        await button('Close File');
        await createProject(other);
        await see('.workspaceSplitSide .emptyState', 'No code files yet');
        // Recent item title is the known scratch path; never dump its value.
        await act('click', `.recentList button.recentItem[title="${project}"]`, name);
        await projectStage('PROJ_CONTEXT_NOT_UPDATED', () => projectContext(project));
        await see('.statusLeft > span:first-child', '', `Status: Opened: ${project}`);
        await see('.workspaceSplitSide button.listNutton strong', filename);
        await act('click', '.workspaceSplitSide button.listNutton');
        try {
            await waitFor(() => operation('value', 'textarea.codeEditor', '', content), 5000);
        }
        catch {
            throw new SmokeFailure('UI_ASSERTION_FAILED');
        }
        if (await diskContent() !== content)
            throw new SmokeFailure('SCRATCH_ASSERTION_FAILED');
    };
    for (const [index, id] of smokeIds.entries()) {
        if (failed) {
            scenarios.push({ id, status: 'NOT_RUN', durationMs: 0 });
            continue;
        }
        activeScenario = id;
        const scenarioStarted = performance.now();
        record('SCENARIO', 'START');
        try {
            await steps[index]!();
            scenarios.push({ id, status: 'PASS', durationMs: Math.min(150000, Math.max(1, Math.ceil(performance.now() - scenarioStarted))) });
            record('SCENARIO', 'PASS');
        }
        catch (error) {
            failed = true;
            scenarios.push({ id, status: 'FAIL', reason: error instanceof SmokeFailure ? error.reason : 'SCRATCH_ASSERTION_FAILED', durationMs: Math.min(150000, Math.max(1, Math.ceil(performance.now() - scenarioStarted))) });
            record('SCENARIO', 'FAIL');
        }
    }
    return { version: 1, runId, status: failed ? 'FAIL' : 'PASS', scenarios, trace };
}
