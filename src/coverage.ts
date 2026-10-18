import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { smokeIds, functionalIds, wave2Ids, wave3Ids, scenarioIds } from './smoke-contract';
const registryPath = 'docs/capabilities/registry';
const registryId = /^PL-[A-Z0-9]+-[A-Z0-9]+-\d{3}$/;
const registryStatuses = ['complete', 'partial', 'missing', 'blocked', 'deferred'] as const;
const mapping: Record<typeof scenarioIds[number], readonly string[]> = {
    'PL-QA-BOOT-001': ['PL-CORE-SHELL-001'],
    'PL-QA-NAV-001': ['PL-CORE-SHELL-001'],
    'PL-QA-PROJ-001': [],
    'PL-QA-PERSIST-001': ['PL-CODE-FILE-001', 'PL-CODE-FILE-002', 'PL-CODE-FILE-003'],
    'PL-QA-PROJ-002': [],
    'PL-QA-FUNC-SETTINGS-001': ['PL-CORE-ACCESS-001'],
    'PL-QA-FUNC-KEY-001': ['PL-CORE-SHELL-001'],
    'PL-QA-FUNC-DIALOG-001': ['PL-CORE-ACCESS-001'],
    'PL-QA-W2-LOGS-001': ['PL-CORE-SHELL-001'],
    'PL-QA-W2-DIAG-001': ['PL-CORE-DIAG-001'],
    'PL-QA-W2-PROJLOG-001': ['PL-CORE-DIAG-001'],
    'PL-QA-W3-LAYOUT-001': ['PL-CORE-SHELL-001']
};
export interface RegistryInventory {
    digest: string;
    capabilities: {
        id: string;
        registryStatus: typeof registryStatuses[number];
    }[];
}
export async function inspectCapabilityRegistry(targetRoot: string): Promise<RegistryInventory> {
    const directory = path.join(targetRoot, registryPath);
    if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory())
        throw new Error('REGISTRY_UNVERIFIED');
    const files = (await readdir(directory)).sort();
    if (files.length === 0 || files.length > 32 || files.some(file => !/^[a-z0-9-]+\.json$/.test(file)))
        throw new Error('REGISTRY_UNVERIFIED');
    const digest = createHash('sha256');
    const capabilities: RegistryInventory['capabilities'] = [];
    const ids = new Set<string>();
    for (const file of files) {
        const filename = path.join(directory, file);
        if (await realpath(filename) !== filename || !(await lstat(filename)).isFile())
            throw new Error('REGISTRY_UNVERIFIED');
        const bytes = await readFile(filename);
        if (bytes.length > 2000000)
            throw new Error('REGISTRY_UNVERIFIED');
        digest.update(file).update('\0').update(bytes).update('\0');
        const parsed: unknown = JSON.parse(bytes.toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as {
            capabilities?: unknown;
        }).capabilities))
            throw new Error('REGISTRY_UNVERIFIED');
        for (const item of (parsed as {
            capabilities: unknown[];
        }).capabilities) {
            const entry = item as {
                id?: unknown;
                status?: unknown;
            };
            if (!entry || typeof entry.id !== 'string' || !registryId.test(entry.id) || ids.has(entry.id) || !registryStatuses.includes(entry.status as typeof registryStatuses[number]))
                throw new Error('REGISTRY_UNVERIFIED');
            ids.add(entry.id);
            capabilities.push({ id: entry.id, registryStatus: entry.status as typeof registryStatuses[number] });
            if (capabilities.length > 512)
                throw new Error('REGISTRY_UNVERIFIED');
        }
    }
    for (const ids of smokeIds.map(id => mapping[id]))
        for (const id of ids)
            if (!capabilities.some(c => c.id === id && c.registryStatus === 'complete'))
                throw new Error('REGISTRY_UNVERIFIED');
    return { digest: digest.digest('hex'), capabilities: capabilities.sort((a, b) => a.id.localeCompare(b.id)) };
}
export interface CoverageSummary {
    registry: 'INSPECTED_CHECKOUT' | 'NOT_VERIFIED';
    registryDigest: string | null;
    buildBinding: 'NOT_PROVEN';
    implementedCapabilities: number | null;
    applicableBehaviorDenominator: null;
    denominatorReason: 'BEHAVIOR_APPLICABILITY_NOT_IN_REGISTRY';
    scenarios: {
        id: typeof scenarioIds[number];
        capabilityIds: string[];
        mapping: 'VERIFIED' | 'UNMAPPED' | 'NOT_VERIFIED';
        result: 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED';
        mode: 'AUTOMATED';
    }[];
    capabilities: {
        id: string;
        registryStatus: typeof registryStatuses[number];
        testIds: typeof scenarioIds[number][];
        coverage: 'VALIDATED_BEHAVIOR' | 'FAILED_BEHAVIOR' | 'BLOCKED' | 'NOT_COVERED' | 'UNSUPPORTED' | 'DEFERRED';
    }[];
    registryCounts: {
        complete: number | null;
        partial: number | null;
        missing: number | null;
        blocked: number | null;
        deferred: number | null;
    };
    coverageCounts: {
        withValidatedBehavior: number | null;
        withFailedBehavior: number | null;
        blocked: number | null;
        notCovered: number | null;
        unsupported: number | null;
        deferred: number | null;
    };
    scenarioCounts: {
        implemented: number;
        executed: number;
        passed: number;
        failed: number;
        blocked: number;
        skipped: number;
    };
    manualCoverage: 'NOT_ASSESSED';
}
export function makeCoverage(inventory: RegistryInventory | undefined, scenarios: {
    id: typeof scenarioIds[number];
    result: 'PASS' | 'FAIL' | 'NOT_RUN';
}[]): CoverageSummary {
    const hasFailure = scenarios.some(s => s.result === 'FAIL');
    const ids = scenarios.length === wave3Ids.length && scenarios.every((item, index) => item.id === wave3Ids[index]) ? wave3Ids : scenarios.length === wave2Ids.length && scenarios.every((item, index) => item.id === wave2Ids[index]) ? wave2Ids : scenarios.length === functionalIds.length && scenarios.every((item, index) => item.id === functionalIds[index]) ? functionalIds : smokeIds;
    const mapped = ids.map(id => {
        const status = scenarios.find(s => s.id === id)?.result;
        const result = status === 'NOT_RUN' || !status ? (hasFailure ? 'SKIPPED' : 'BLOCKED') : status;
        return { id, capabilityIds: inventory ? [...mapping[id]] : [], mapping: inventory ? mapping[id].length ? 'VERIFIED' : 'UNMAPPED' : 'NOT_VERIFIED', result, mode: 'AUTOMATED' } as CoverageSummary['scenarios'][number];
    });
    const capabilities = (inventory?.capabilities ?? []).map(c => {
        const linked = mapped.filter(s => s.capabilityIds.includes(c.id));
        const coverage = c.registryStatus === 'missing' || c.registryStatus === 'blocked' ? 'UNSUPPORTED'
            : c.registryStatus === 'deferred' ? 'DEFERRED'
                : linked.some(s => s.result === 'FAIL') ? 'FAILED_BEHAVIOR'
                    : linked.some(s => s.result === 'PASS') ? 'VALIDATED_BEHAVIOR'
                        : linked.some(s => s.result === 'BLOCKED') ? 'BLOCKED' : 'NOT_COVERED';
        return { id: c.id, registryStatus: c.registryStatus, testIds: linked.map(s => s.id), coverage } as CoverageSummary['capabilities'][number];
    });
    return {
        registry: inventory ? 'INSPECTED_CHECKOUT' : 'NOT_VERIFIED', registryDigest: inventory?.digest ?? null,
        buildBinding: 'NOT_PROVEN', implementedCapabilities: inventory ? capabilities.filter(c => c.registryStatus === 'complete' || c.registryStatus === 'partial').length : null,
        applicableBehaviorDenominator: null, denominatorReason: 'BEHAVIOR_APPLICABILITY_NOT_IN_REGISTRY',
        scenarios: mapped, capabilities,
        registryCounts: inventory ? { complete: capabilities.filter(c => c.registryStatus === 'complete').length, partial: capabilities.filter(c => c.registryStatus === 'partial').length, missing: capabilities.filter(c => c.registryStatus === 'missing').length, blocked: capabilities.filter(c => c.registryStatus === 'blocked').length, deferred: capabilities.filter(c => c.registryStatus === 'deferred').length } : { complete: null, partial: null, missing: null, blocked: null, deferred: null },
        coverageCounts: inventory ? { withValidatedBehavior: capabilities.filter(c => c.coverage === 'VALIDATED_BEHAVIOR').length, withFailedBehavior: capabilities.filter(c => c.coverage === 'FAILED_BEHAVIOR').length, blocked: capabilities.filter(c => c.coverage === 'BLOCKED').length, notCovered: capabilities.filter(c => c.coverage === 'NOT_COVERED').length, unsupported: capabilities.filter(c => c.coverage === 'UNSUPPORTED').length, deferred: capabilities.filter(c => c.coverage === 'DEFERRED').length } : { withValidatedBehavior: null, withFailedBehavior: null, blocked: null, notCovered: null, unsupported: null, deferred: null },
        scenarioCounts: { implemented: ids.length, executed: mapped.filter(s => s.result === 'PASS' || s.result === 'FAIL').length, passed: mapped.filter(s => s.result === 'PASS').length, failed: mapped.filter(s => s.result === 'FAIL').length, blocked: mapped.filter(s => s.result === 'BLOCKED').length, skipped: mapped.filter(s => s.result === 'SKIPPED').length },
        manualCoverage: 'NOT_ASSESSED'
    };
}
export function validateCoverage(value: unknown, scenarios: {
    id: typeof scenarioIds[number];
    result: 'PASS' | 'FAIL' | 'NOT_RUN';
}[]): CoverageSummary {
    const v = value as CoverageSummary;
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== 'applicableBehaviorDenominator,buildBinding,capabilities,coverageCounts,denominatorReason,implementedCapabilities,manualCoverage,registry,registryCounts,registryDigest,scenarioCounts,scenarios' || !['INSPECTED_CHECKOUT', 'NOT_VERIFIED'].includes(v.registry) || !Array.isArray(v.capabilities) || v.capabilities.length > 512)
        throw new Error('REPORT_RESULT_INVALID');
    const raw = v.capabilities.map(c => {
        if (!c || Object.keys(c).sort().join(',') !== 'coverage,id,registryStatus,testIds' || typeof c.id !== 'string' || !registryId.test(c.id) || !registryStatuses.includes(c.registryStatus) || !Array.isArray(c.testIds) || c.testIds.length > 5)
            throw new Error('REPORT_RESULT_INVALID');
        return { id: c.id, registryStatus: c.registryStatus };
    });
    if (raw.some((c, index) => index > 0 && raw[index - 1]!.id >= c.id))
        throw new Error('REPORT_RESULT_INVALID');
    if (v.registry === 'INSPECTED_CHECKOUT' && scenarios.flatMap(s => mapping[s.id]).some(id => !raw.some(c => c.id === id && c.registryStatus === 'complete')))
        throw new Error('REPORT_RESULT_INVALID');
    if (v.registry === 'INSPECTED_CHECKOUT' ? typeof v.registryDigest !== 'string' || !/^[a-f0-9]{64}$/.test(v.registryDigest) : v.registryDigest !== null || raw.length !== 0)
        throw new Error('REPORT_RESULT_INVALID');
    const expected = makeCoverage(v.registry === 'INSPECTED_CHECKOUT' ? { digest: v.registryDigest!, capabilities: raw } : undefined, scenarios);
    if (JSON.stringify(v) !== JSON.stringify(expected))
        throw new Error('REPORT_RESULT_INVALID');
    return v;
}
