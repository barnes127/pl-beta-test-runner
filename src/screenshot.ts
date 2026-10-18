import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { SmokeReport, smokeIds, scenarioIds } from './smoke-contract';
// Reviewed owner-host source/renderer/desktop snapshot from the accepted run.
// A changed checkout needs a separate screenshot-boundary review; smoke itself
// may still run and report an omitted image.
export const approvedScreenshotSnapshot = '3b99eeb81163024c110bf1827295722d20f9b15682209936c9bfbf2f1549de58';
export const screenshotMaxBytes = 2000000;
export const screenshotFile = (runId: string) => `failure-ui-${runId}.png`;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const screenshotStatuses = ['CAPTURED', 'OMITTED_NOT_APPLICABLE', 'OMITTED_SAFETY_GATE', 'OMITTED_CAPTURE_FAILED'] as const;
export const screenshotReasons = [
    'NONE', 'NO_GUI_FAILURE', 'BEFORE_READINESS', 'SHUTDOWN_STARTED', 'NONCE_INVALID',
    'PERMIT_INVALID', 'CAPTURE_SCOPE_UNAPPROVED', 'WINDOW_IDENTITY_INVALID', 'NAVIGATION_INVALID', 'SNAPSHOT_NOT_APPROVED',
    'CONTAINMENT_UNVERIFIED', 'PROCESS_OWNERSHIP_UNVERIFIED', 'FIXTURE_UNVERIFIED',
    'UI_CONTENT_UNEXPECTED', 'UI_ORIGIN_UNEXPECTED', 'UI_SURFACE_UNEXPECTED',
    'UI_PROJECT_STATE_UNEXPECTED', 'UI_FIELD_UNEXPECTED', 'UI_RECENTS_UNEXPECTED',
    'UI_SUMMARY_UNEXPECTED', 'UI_ERROR_UNEXPECTED', 'UI_TEXT_UNEXPECTED',
    'SAFETY_CHECK_FAILED', 'CAPTURE_API_FAILED', 'PNG_INVALID',
    'IMAGE_LIMIT_EXCEEDED', 'TRANSFER_INVALID', 'ARTIFACT_WRITE_FAILED', 'CLEANUP_UNVERIFIED'
] as const;
const safetyReasons = ['BEFORE_READINESS', 'SHUTDOWN_STARTED', 'NONCE_INVALID', 'PERMIT_INVALID', 'CAPTURE_SCOPE_UNAPPROVED', 'WINDOW_IDENTITY_INVALID', 'NAVIGATION_INVALID', 'SNAPSHOT_NOT_APPROVED', 'CONTAINMENT_UNVERIFIED', 'PROCESS_OWNERSHIP_UNVERIFIED', 'FIXTURE_UNVERIFIED', 'UI_CONTENT_UNEXPECTED', 'UI_ORIGIN_UNEXPECTED', 'UI_SURFACE_UNEXPECTED', 'UI_PROJECT_STATE_UNEXPECTED', 'UI_FIELD_UNEXPECTED', 'UI_RECENTS_UNEXPECTED', 'UI_SUMMARY_UNEXPECTED', 'UI_ERROR_UNEXPECTED', 'UI_TEXT_UNEXPECTED', 'SAFETY_CHECK_FAILED', 'TRANSFER_INVALID', 'CLEANUP_UNVERIFIED'] as const;
const uiReasons = ['UI_ORIGIN_UNEXPECTED', 'UI_SURFACE_UNEXPECTED', 'UI_PROJECT_STATE_UNEXPECTED', 'UI_FIELD_UNEXPECTED', 'UI_RECENTS_UNEXPECTED', 'UI_SUMMARY_UNEXPECTED', 'UI_ERROR_UNEXPECTED', 'UI_TEXT_UNEXPECTED'] as const;
const captureReasons = ['CAPTURE_API_FAILED', 'PNG_INVALID', 'IMAGE_LIMIT_EXCEEDED', 'TRANSFER_INVALID', 'ARTIFACT_WRITE_FAILED'] as const;
export type ScreenshotStatus = typeof screenshotStatuses[number];
export type ScreenshotReason = typeof screenshotReasons[number];
export interface ScreenshotRecord {
    contractVersion: 1;
    status: ScreenshotStatus;
    runId: string;
    scenarioId: typeof scenarioIds[number] | null;
    stage: 'SCENARIO_FAILURE' | 'NO_GUI_FAILURE';
    artifact: string | null;
    width: number | null;
    height: number | null;
    bytes: number | null;
    sha256: string | null;
    reason: ScreenshotReason;
}
export function omittedScreenshot(runId: string, scenarioId: ScreenshotRecord['scenarioId'], status: Exclude<ScreenshotStatus, 'CAPTURED'>, reason: ScreenshotReason): ScreenshotRecord {
    return { contractVersion: 1, status, runId, scenarioId, stage: scenarioId ? 'SCENARIO_FAILURE' : 'NO_GUI_FAILURE', artifact: null, width: null, height: null, bytes: null, sha256: null, reason };
}
export function validateScreenshotRecord(value: unknown, runId: string, failedScenario: ScreenshotRecord['scenarioId']): ScreenshotRecord {
    const v = value as ScreenshotRecord;
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== 'artifact,bytes,contractVersion,height,reason,runId,scenarioId,sha256,stage,status,width' || v.contractVersion !== 1 || !uuid.test(runId) || v.runId !== runId || v.scenarioId !== failedScenario || !screenshotStatuses.includes(v.status) || !screenshotReasons.includes(v.reason) || v.stage !== (failedScenario ? 'SCENARIO_FAILURE' : 'NO_GUI_FAILURE'))
        throw new Error('SCREENSHOT_RECORD_INVALID');
    if (v.status === 'CAPTURED') {
        if (!failedScenario || v.artifact !== screenshotFile(runId) || !Number.isInteger(v.width) || !Number.isInteger(v.height) || !Number.isInteger(v.bytes) || v.width! < 1 || v.height! < 1 || v.width! > 1280 || v.height! > 800 || v.bytes! < 60 || v.bytes! > screenshotMaxBytes || typeof v.sha256 !== 'string' || !digestPattern.test(v.sha256) || v.reason !== 'NONE')
            throw new Error('SCREENSHOT_RECORD_INVALID');
    }
    else if (v.artifact !== null || v.width !== null || v.height !== null || v.bytes !== null || v.sha256 !== null || v.reason === 'NONE' || (v.status === 'OMITTED_NOT_APPLICABLE') !== (failedScenario === null) || (v.status === 'OMITTED_NOT_APPLICABLE' && v.reason !== 'NO_GUI_FAILURE') || (v.status === 'OMITTED_SAFETY_GATE' && !safetyReasons.includes(v.reason as typeof safetyReasons[number])) || (v.status === 'OMITTED_CAPTURE_FAILED' && !captureReasons.includes(v.reason as typeof captureReasons[number])))
        throw new Error('SCREENSHOT_RECORD_INVALID');
    return v;
}
function crc32(bytes: Buffer): number {
    let crc = -1;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
}
export function validatePng(bytes: Buffer) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 60 || bytes.length > screenshotMaxBytes || !bytes.subarray(0, 8).equals(pngSignature))
        throw new Error('PNG_INVALID');
    let offset = 8;
    let width = 0;
    let height = 0;
    let channels = 0;
    let sawIdat = false;
    let sawEnd = false;
    const compressed: Buffer[] = [];
    while (offset < bytes.length) {
        if (offset + 12 > bytes.length)
            throw new Error('PNG_INVALID');
        const length = bytes.readUInt32BE(offset);
        if (length > screenshotMaxBytes || offset + 12 + length > bytes.length)
            throw new Error('PNG_INVALID');
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length))
            throw new Error('PNG_INVALID');
        if (offset === 8) {
            if (type !== 'IHDR' || length !== 13)
                throw new Error('PNG_INVALID');
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            if (width < 1 || width > 1280 || height < 1 || height > 800 || data[8] !== 8 || ![2, 6].includes(data[9]!) || data[10] !== 0 || data[11] !== 0 || data[12] !== 0)
                throw new Error('PNG_INVALID');
            channels = data[9] === 6 ? 4 : 3;
        }
        else if (type === 'IDAT') {
            if (sawEnd || !length)
                throw new Error('PNG_INVALID');
            sawIdat = true;
            compressed.push(data);
        }
        else if (type === 'IEND') {
            if (length !== 0 || !sawIdat || offset + 12 !== bytes.length)
                throw new Error('PNG_INVALID');
            sawEnd = true;
        }
        else if (!/^[a-z][A-Za-z]{3}$/.test(type) || sawIdat || sawEnd)
            throw new Error('PNG_INVALID');
        offset += length + 12;
    }
    if (!sawEnd)
        throw new Error('PNG_INVALID');
    const rowLength = 1 + width * channels;
    let raw: Buffer;
    try {
        raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: rowLength * height + 1 });
    }
    catch {
        throw new Error('PNG_INVALID');
    }
    if (raw.length !== rowLength * height)
        throw new Error('PNG_INVALID');
    for (let row = 0; row < height; row++)
        if (raw[row * rowLength]! > 4)
            throw new Error('PNG_INVALID');
    return { width, height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export function screenshotCaptured(runId: string, scenarioId: typeof smokeIds[number], png: Buffer): ScreenshotRecord {
    const info = validatePng(png);
    return { contractVersion: 1, status: 'CAPTURED', runId, scenarioId, stage: 'SCENARIO_FAILURE', artifact: screenshotFile(runId), ...info, reason: 'NONE' };
}
// This executes only in the reviewed, isolated Suite renderer. It returns one
// boolean; no DOM strings, form values or URLs cross into report evidence.
export function syntheticPageCheck(runId: string): ScreenshotReason | 'SAFE' {
    const name = `plqa-${runId.slice(0, 12)}`;
    const root = '/scratch/home/PLProjects';
    const project = `${root}/${name}`;
    const other = `${project}-other`;
    const content = `PL QA disposable content ${runId}\n`;
    const allowed = new Set(['', name, `${name}-other`, root, project, other, 'qa-smoke.txt', content]);
    if (location.origin !== 'http://localhost:5173' || location.pathname !== '/')
        return 'UI_ORIGIN_UNEXPECTED';
    if (document.querySelector('iframe, canvas, video, webview, [contenteditable="true"], [role="dialog"], .modal, .codeEditor'))
        return 'UI_SURFACE_UNEXPECTED';
    const subtitles = document.querySelectorAll('.workspaceHeader .workspaceSubtitle');
    if (subtitles.length !== 1 || subtitles[0]?.textContent?.trim() !== 'No project open')
        return 'UI_PROJECT_STATE_UNEXPECTED';
    if (document.querySelector('.sidebar .recentItem[title]'))
        return 'UI_RECENTS_UNEXPECTED';
    for (const field of Array.from(document.querySelectorAll('input, textarea')) as HTMLInputElement[]) {
        // The reviewed default Copilot drawer renders this checkbox even with
        // no project. Chromium's default checkbox value is "on". Its checked
        // state must still be false and the control disabled in empty-project
        // BOOT; every other unexpected value remains forbidden.
        const inertContextCheckbox = field.matches('.copilotActions input[type="checkbox"]') && field.value === 'on' && field.disabled && !field.checked;
        if ((!allowed.has(field.value) && !inertContextCheckbox) || field.getAttribute('placeholder')?.startsWith('/home/'))
            return 'UI_FIELD_UNEXPECTED';
    }
    for (const item of Array.from(document.querySelectorAll('.sidebar .recentItem[title]')))
        if (![project, other].includes(item.getAttribute('title') ?? '') || ![name, `${name}-other`].includes(item.textContent?.trim() ?? ''))
            return 'UI_RECENTS_UNEXPECTED';
    for (const item of Array.from(document.querySelectorAll('.workspaceHeader .workspaceSubtitle, .projectSummaryValue')))
        if (!['No project open', project, other, `Project: ${project}`, `Project: ${other}`].includes(item.textContent?.trim() ?? ''))
            return 'UI_SUMMARY_UNEXPECTED';
    for (const error of Array.from(document.querySelectorAll('.errorBox')))
        if ((error.textContent?.trim() ?? '') !== 'Internal RPC error')
            return 'UI_ERROR_UNEXPECTED';
    // Fixed synthetic paths are allowed; any other apparent host path, token,
    // credential or personal identifier in visible text refuses retention.
    const visible = document.body?.innerText?.replaceAll(project, '').replaceAll(other, '').replaceAll(root, '') ?? '';
    if (/\b(?:AKIA[0-9A-Z]{16}|Bearer\s+\S+|sk-[A-Za-z0-9_-]{12,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})\b/i.test(visible) || /\/(?:home|root|run\/user)\//.test(visible))
        return 'UI_TEXT_UNEXPECTED';
    return 'SAFE';
}
export async function verifySyntheticFixtures(runId: string, root = '/scratch/home/PLProjects') {
    const name = `plqa-${runId.slice(0, 12)}`;
    const allowed = new Set([name, `${name}-other`]);
    let projects: string[];
    try {
        projects = await readdir(root);
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return;
        throw new Error('FIXTURE_UNVERIFIED');
    }
    if (await realpath(root) !== root || !(await lstat(root)).isDirectory() || projects.length > 2 || projects.some(item => !allowed.has(item)))
        throw new Error('FIXTURE_UNVERIFIED');
    for (const item of projects) {
        const directory = path.join(root, item);
        if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory())
            throw new Error('FIXTURE_UNVERIFIED');
        const manifest = path.join(directory, 'pl-project.json');
        let bytes: Buffer;
        try {
            if (await realpath(manifest) !== manifest || !(await lstat(manifest)).isFile())
                throw new Error();
            bytes = await readFile(manifest);
        }
        catch {
            throw new Error('FIXTURE_UNVERIFIED');
        }
        if (bytes.length > 32000)
            throw new Error('FIXTURE_UNVERIFIED');
        const parsed = JSON.parse(bytes.toString());
        if (parsed.name !== item || parsed.schemaVersion !== 1)
            throw new Error('FIXTURE_UNVERIFIED');
        const file = path.join(directory, 'code', 'qa-smoke.txt');
        try {
            const codeDirectory = path.dirname(file);
            if (await realpath(codeDirectory) !== codeDirectory || !(await lstat(codeDirectory)).isDirectory())
                throw new Error();
            if (await realpath(file) !== file || !(await lstat(file)).isFile())
                throw new Error();
            const content = await readFile(file, 'utf8');
            if (content !== '' && content !== `PL QA disposable content ${runId}\n`)
                throw new Error();
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw new Error('FIXTURE_UNVERIFIED');
        }
    }
}
export interface CaptureContents {
    executeJavaScript(script: string): Promise<unknown>;
}
export interface CaptureWindow {
    isDestroyed(): boolean;
    isVisible(): boolean;
    capturePage(): Promise<{
        isEmpty(): boolean;
        getSize(): {
            width: number;
            height: number;
        };
        toPNG(): Buffer;
    }>;
}
export async function captureFailedUi(contents: CaptureContents, window: CaptureWindow, smoke: SmokeReport, runId: string, verify: () => Promise<void>, snapshotDigest: string, shutdownStarted: () => boolean): Promise<{
    record: ScreenshotRecord;
    png?: Buffer;
}> {
    const failure = smoke.scenarios.find(item => item.status === 'FAIL');
    if (!failure)
        return { record: omittedScreenshot(runId, null, 'OMITTED_NOT_APPLICABLE', 'NO_GUI_FAILURE') };
    const omitted = (status: 'OMITTED_SAFETY_GATE' | 'OMITTED_CAPTURE_FAILED', reason: ScreenshotReason) => ({ record: omittedScreenshot(runId, failure.id, status, reason) });
    if (failure.id !== smokeIds[0])
        return omitted('OMITTED_SAFETY_GATE', 'CAPTURE_SCOPE_UNAPPROVED');
    if (snapshotDigest !== approvedScreenshotSnapshot)
        return omitted('OMITTED_SAFETY_GATE', 'SNAPSHOT_NOT_APPROVED');
    if (shutdownStarted())
        return omitted('OMITTED_SAFETY_GATE', 'SHUTDOWN_STARTED');
    try {
        await verify();
        if (window.isDestroyed() || !window.isVisible() || shutdownStarted())
            return omitted('OMITTED_SAFETY_GATE', 'WINDOW_IDENTITY_INVALID');
        const safeBefore = await contents.executeJavaScript(`(${syntheticPageCheck.toString()})(${JSON.stringify(runId)})`);
        if (safeBefore !== 'SAFE')
            return omitted('OMITTED_SAFETY_GATE', uiReasons.includes(safeBefore as typeof uiReasons[number]) ? safeBefore as ScreenshotReason : 'UI_CONTENT_UNEXPECTED');
    }
    catch {
        return omitted('OMITTED_SAFETY_GATE', 'SAFETY_CHECK_FAILED');
    }
    let png: Buffer;
    let size: {
        width: number;
        height: number;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const image = await Promise.race([window.capturePage(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error()), 3000); })]);
        if (image.isEmpty())
            return omitted('OMITTED_CAPTURE_FAILED', 'CAPTURE_API_FAILED');
        size = image.getSize();
        if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1 || size.width > 1280 || size.height > 800)
            return omitted('OMITTED_CAPTURE_FAILED', 'IMAGE_LIMIT_EXCEEDED');
        png = image.toPNG();
        if (!Buffer.isBuffer(png) || png.length > screenshotMaxBytes)
            return omitted('OMITTED_CAPTURE_FAILED', 'IMAGE_LIMIT_EXCEEDED');
    }
    catch {
        return omitted('OMITTED_CAPTURE_FAILED', 'CAPTURE_API_FAILED');
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    try {
        const checked = validatePng(png);
        if (checked.width !== size.width || checked.height !== size.height)
            return omitted('OMITTED_CAPTURE_FAILED', 'PNG_INVALID');
    }
    catch {
        return omitted('OMITTED_CAPTURE_FAILED', 'PNG_INVALID');
    }
    try {
        await verify();
        if (shutdownStarted())
            return omitted('OMITTED_SAFETY_GATE', 'SHUTDOWN_STARTED');
        if (window.isDestroyed() || !window.isVisible())
            return omitted('OMITTED_SAFETY_GATE', 'WINDOW_IDENTITY_INVALID');
        const safeAfter = await contents.executeJavaScript(`(${syntheticPageCheck.toString()})(${JSON.stringify(runId)})`);
        if (safeAfter !== 'SAFE')
            return omitted('OMITTED_SAFETY_GATE', uiReasons.includes(safeAfter as typeof uiReasons[number]) ? safeAfter as ScreenshotReason : 'UI_CONTENT_UNEXPECTED');
    }
    catch {
        return omitted('OMITTED_SAFETY_GATE', 'SAFETY_CHECK_FAILED');
    }
    return { record: screenshotCaptured(runId, failure.id, png), png };
}
export async function readScratchScreenshot(directory: string, runId: string, failedScenario: typeof scenarioIds[number], transfer: string): Promise<{
    record: ScreenshotRecord;
    png?: Buffer;
}> {
    if (!/^evidence-[A-Za-z0-9]{6}$/.test(transfer))
        return { record: omittedScreenshot(runId, failedScenario, 'OMITTED_SAFETY_GATE', 'TRANSFER_INVALID') };
    const evidenceDirectory = path.join(directory, 'state', transfer);
    try {
        const info = await lstat(evidenceDirectory);
        if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || await realpath(evidenceDirectory) !== evidenceDirectory)
            throw new Error();
    }
    catch {
        return { record: omittedScreenshot(runId, failedScenario, 'OMITTED_SAFETY_GATE', 'TRANSFER_INVALID') };
    }
    const metadata = path.join(evidenceDirectory, 'screenshot-result.json');
    let record: ScreenshotRecord;
    try {
        const info = await lstat(metadata);
        if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size > 2000 || await realpath(metadata) !== metadata)
            throw new Error();
        record = validateScreenshotRecord(JSON.parse(await readFile(metadata, 'utf8')), runId, failedScenario);
    }
    catch {
        return { record: omittedScreenshot(runId, failedScenario, 'OMITTED_SAFETY_GATE', 'TRANSFER_INVALID') };
    }
    if (record.status !== 'CAPTURED')
        return { record };
    try {
        const filename = path.join(evidenceDirectory, record.artifact!);
        const info = await lstat(filename);
        if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size !== record.bytes || await realpath(filename) !== filename)
            throw new Error();
        const png = await readFile(filename);
        const validated = validatePng(png);
        if (validated.width !== record.width || validated.height !== record.height || validated.bytes !== record.bytes || validated.sha256 !== record.sha256)
            throw new Error();
        return { record, png };
    }
    catch {
        return { record: omittedScreenshot(runId, failedScenario, 'OMITTED_SAFETY_GATE', 'TRANSFER_INVALID') };
    }
}
export function validateScreenshotTransfer(value: unknown, runId: string, failedScenario: typeof scenarioIds[number]): {
    record: ScreenshotRecord;
    png?: Buffer;
} {
    const message = value as {
        kind?: unknown;
        record?: unknown;
        png?: unknown;
    };
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.kind !== 'PL_BETA_SCREENSHOT_V1' || !Object.keys(message).every(key => ['kind', 'record', 'png'].includes(key)))
        throw new Error('SCREENSHOT_TRANSFER_INVALID');
    const record = validateScreenshotRecord(message.record, runId, failedScenario);
    if (record.status === 'CAPTURED' && failedScenario !== smokeIds[0])
        throw new Error('SCREENSHOT_TRANSFER_INVALID');
    if (record.status !== 'CAPTURED') {
        if (message.png !== undefined)
            throw new Error('SCREENSHOT_TRANSFER_INVALID');
        return { record };
    }
    if (typeof message.png !== 'string' || message.png.length > Math.ceil(screenshotMaxBytes / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(message.png))
        throw new Error('SCREENSHOT_TRANSFER_INVALID');
    const png = Buffer.from(message.png, 'base64');
    if (png.toString('base64') !== message.png)
        throw new Error('SCREENSHOT_TRANSFER_INVALID');
    const info = validatePng(png);
    if (info.width !== record.width || info.height !== record.height || info.bytes !== record.bytes || info.sha256 !== record.sha256)
        throw new Error('SCREENSHOT_TRANSFER_INVALID');
    return { record, png };
}
