# Batch 4 first wave handoff — 2026-10-17

## Wave 3 targeted status-check correction — 2026-10-18

**Acceptance remains HOST_VALIDATION_REQUIRED.** The owner's live run `0a29d2c8-e7a4-4927-beb9-567eb19c6c91` is a verified report with overall **FAIL**: `PL-QA-W3-LAYOUT-001` stopped at `W3_RESET_STATUS_MISSING` (`STATUS_BAR`, exact text `NOT_OBSERVED`). The trace establishes that Health closed, private storage recorded `inspector:false`, Reset Layout was clicked, and Health visibly returned. It does **not** establish whether the status element was outside the viewport or its text differed; the prior boolean assertion collapsed both cases. The later `inspector:true` and final empty-project checks were not executed. Shutdown, cleanup and final containment were VERIFIED. Screenshot omission (`CAPTURE_SCOPE_UNAPPROVED`) was correct. The owner reports 231/231 host automated tests, six isolation stages and the previous 11 GUI scenarios passing; those results precede this correction.

Read-only Suite inspection found that the actual Reset Layout button in `apps/renderer/src/App.tsx` calls `resetLayout()` and finally sets `"Layout reset to default."`; `ShellStatusBar` in `apps/renderer/src/platform/shell/components.tsx` renders `Status: {status}` in `.statusLeft > span:first-child`. The built renderer asset contains the same button handler and status component. Thus the expected text and selector are source-supported; an actual wrong/missing message would be a Suite behavior discrepancy, not grounds to remove the assertion. The runner's shared `pageOperation('text')` requires viewport visibility but does not scroll the target, while its action operations do. This is a concrete runner observation gap, although the host artifact cannot prove it caused the original failure.

The focused correction first scrolls the exact status element into view and requires it to be visible (`W3_RESET_STATUS_NOT_VISIBLE` on failure), then retains the unchanged exact-text assertion (`W3_RESET_STATUS_MISSING` on failure). Health visibility, both private layout-state checks and the unchanged scratch project root remain mandatory. A focused mock proves that a visible status element with wrong text still fails; another proves an element that cannot be made visible fails before the text check. These mocks do not establish a live PASS or resolve whether the Suite changes status asynchronously. Historical reports retain their original reason code and remain verifiable.

Files changed for this correction: `src/functional-wave3.ts`, `src/smoke-contract.ts`, `tests/functional-wave3.test.cjs`, and this handoff. No Suite file, sandbox setting, screenshot permission, dependency, lease, commit or remote was changed. On Node 22.12.0, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm test` and `git diff --check` passed; tests were **231 PASS, 0 FAIL, 1 managed-environment SKIP** out of 232. The failed live report was rechecked with `pnpm report:verify` and returned `REPORT_VERIFIED`, overall FAIL. Local `pnpm qa doctor` was BLOCKED / PORT_UNAVAILABLE, so no new Electron run was attempted in Codex. A new normal-host run is required. If it reports `W3_RESET_STATUS_NOT_VISIBLE`, inspect status-bar layout/viewport behavior; if it again reports `W3_RESET_STATUS_MISSING` after the visibility check passes, treat the missing expected text as a suspected Suite behavior defect for owner review. Do not relabel either as PASS.

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa functional-wave3
# Replace with the run ID returned above; keep any retained lease for review.
pnpm report:verify artifacts/reports/<new-run-id>/report.json
```

Accept Wave 3 only after its real UI and storage checks PASS, report verification returns overall PASS, and shutdown, cleanup and final containment are VERIFIED. Formal isolation review remains PENDING; build provenance and whole-product coverage remain NOT_PROVEN/NOT_VERIFIED. Batch 5 and 6 are unstarted.

## Final Wave 3 closeout — 2026-10-18

**Classification: BATCH_4_IMPLEMENTED_HOST_VALIDATION_REQUIRED.** The safely implementable Wave 3 scope is coded and regression-tested; its one new real Electron scenario has not run in this managed environment. Recommend Batch 4 closure only after the owner-host Wave 3 run and report verify pass with complete shutdown/cleanup/containment. Full restart, native dialogs and error-boundary fault injection remain explicitly deferred, not passed.

### Baseline and historical acceptance

Before Wave 3 edits: canonical runner root `~/Projects/pl-beta-test-runner`, `main` at `dfeb94b`, clean working tree. Adjacent `../pl-creators-suite` is the disposable, inspection-only checkout; its pre-existing owner changes remain untouched. The owner reports 227/227 host automated tests, five baseline smoke, three Wave 1 and three Wave 2 live scenarios PASS; Wave 2 report `bce3d7e7-2a71-4f6a-963f-aaff4f4070a6` is `REPORT_VERIFIED` overall PASS, with shutdown, cleanup and final containment VERIFIED. The owner also verified a clean clone of the Wave 2 commit: 227 PASS, zero FAIL/SKIP. The earlier Wave 2 Health assertion failure and its correction remain documented below; the later host PASS supersedes it as live acceptance, without erasing the failure record. These observations precede Wave 3 changes.

### Final Batch 4 source-discovery matrix

| Area | Source-verified trigger and behavior | Oracle, fixture, mapping | Decision |
| --- | --- | --- | --- |
| Full Electron-restart settings persistence | `apps/renderer/src/platform/shell/useShellState.ts`, `storage.ts`, and `App.tsx` persist theme/layout to private `localStorage`; Wave 1 verifies High Contrast in one process. | Would require two owned Electron launches sharing only one validated private profile, complete first shutdown, fresh PID/port/snapshot/isolation proof and second rendered-state check. `PL-CORE-ACCESS-001` maps only to existing Wave 1 behavior. | **DEFERRED.** `sandbox-session.ts` and `launch.ts` supervise one Electron process per fresh scratch run and clean that profile afterward. Reusing it requires a reviewed lifecycle redesign; renderer reload is insufficient. |
| Native open/save/import/export | `App.tsx` uses `dialog.openProjectFolder`, `dialog.openPlproj`, and `dialog.savePlproj`; `apps/desktop/services/dialogs.js` calls Electron's native `showOpenDialog`/`showSaveDialog` on the first window. | A scratch-only file picker and verified owned dialog/window are required; archive operations also need canonical output and unchanged-state checks. Existing project create/reopen and Wave 2 log export already exercise other project flows. | **DEFERRED.** Native dialogs are outside the DOM driver; no reviewed private-dialog interception or picker ownership proof exists. No dialog was opened on the host display. |
| Error boundary | `WorkspaceErrorBoundary.tsx` catches render exceptions and shows an alert, with recovery when workspace changes. | A natural deterministic render fault and unchanged scratch oracle would be needed. | **UNVERIFIED/DEFERRED.** No reachable safe UI control produces that exception; injecting a fault or editing Suite source is outside this wave. Existing duplicate-project and no-project log tests cover separate expected-rejection behavior. |
| Bounded CLI/RPC | Suite `rpc/registry.js` and `services/operations.js` expose fixed methods. Wave 2's UI Export Diagnostics and Export Logs exercise allowlisted renderer→RPC→private-file workflows with visible and file oracles. | `PL-CORE-DIAG-001` is complete and is mapped to the accepted Wave 2 scenarios. | **EXISTING COVERAGE; no new dispatcher.** Direct CLI method selection, arbitrary RPC arguments and backend-only PASS are not justified. |
| Layout recovery normal workflow | `App.tsx` has the sole Reset Layout button and Health inspector close control; `useShellState.ts:resetLayout` restores default panel visibility and `storage.ts` saves it. `defaults.ts` starts with inspector visible. | Real UI close/restoration, exact status, private `localStorage` visibility before/after, empty scratch project root; registry `PL-CORE-SHELL-001` is `complete`. | **SELECTED** as the one small additional scenario `PL-QA-W3-LAYOUT-001`. It tests same-process private persistence, not restart persistence. |
| Empty New Project name | `services/projects.js:projectCreate` intentionally substitutes `Untitled`; the modal has no blank-name rejection contract. | A rejection test would contradict actual behavior. | **UNSUPPORTED as a negative validation scenario; not added.** |

### Wave 3 implementation and evidence

`pnpm qa functional-wave3` runs exactly one compile-time scenario (`batch-4-v3`) through the existing nonce-bound permit, reviewed snapshot, private Bubblewrap/Xvfb, Electron security/preload/window checks, listener ownership and mandatory cleanup. It closes the initially visible Health inspector through its real button, requires the panel to disappear and private shell storage to record `inspector:false`, clicks the sole source-verified Reset Layout button, requires the actual panel and fixed visible status to return, and checks `inspector:true` in private storage. Scratch project-root emptiness is checked before and after. No direct RPC call, caller selector/path input, app source edit, or screenshot capture was added. A failure gets a fixed `W3_*` reason, bounded typed trace, reproduction command and an omitted screenshot. Whole-product behavior denominator stays NOT_VERIFIED; formal `isolationReview` PENDING and build provenance NOT_PROVEN.

Changed files in this wave: `src/functional-wave3.ts` and `tests/functional-wave3.test.cjs` (new); `src/cli.ts`, `src/coverage.ts`, `src/electron-entry.ts`, `src/launch.ts`, `src/report.ts`, `src/sandbox-session.ts`, `src/smoke-contract.ts`, `README.md`, and this handoff. No generated artifact, Suite file, dependency, lockfile, commit, push or retained scratch lease was changed or deleted. No unexpected worktree changes were observed.

Mocked negative contracts: action success with an absent panel update produces FAIL; visible restoration with missing private saved state produces FAIL and a reviewable JSON/HTML artifact; unverified session ownership fails; invalid scenario substitution and evidence-probe permission fail validation; a forged screenshot is rejected; unverified cleanup yields BLOCKED. These are not live target results. Historical Wave 1/Wave 2/BOOT screenshot reports remain `REPORT_VERIFIED` under the new validator.

Local commands/results (Node 22.12.0): `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `git diff --check` PASS. Latest complete `pnpm test`: **231 total, 230 PASS, 0 FAIL, 1 SKIP**; an immediately preceding complete run had 229 PASS, 0 FAIL, 2 SKIP. The confirmed skipped case is the existing managed-environment TCP-bind test; skip count varied between runs, so zero-skip host verification remains necessary. Focused Wave 3 tests: **4/4 PASS**. `pnpm qa list` includes the one Wave 3 ID with `HOST_VALIDATION_REQUIRED`. `pnpm qa doctor` is **BLOCKED / PORT_UNAVAILABLE** in this Codex environment, so no isolation probe or Electron GUI launch was attempted here. The prior owner-host Wave 2 report and retained BOOT screenshot report verified successfully. No new live process/port/cleanup claim is made for Wave 3.

### Owner-host acceptance

Run only in a normal Pop!_OS terminal from the runner root, after confirming target build freshness and no unresolved lease conflict:

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run
pnpm qa functional
pnpm qa functional-wave2
pnpm qa functional-wave3
# Substitute the new Wave 3 run ID returned by the command:
pnpm report:verify artifacts/reports/<wave3-run-id>/report.json
pnpm report:verify artifacts/reports/bce3d7e7-2a71-4f6a-963f-aaff4f4070a6/report.json
```

Accept the new scenario only if its real UI and private-storage assertions PASS, the report is `REPORT_VERIFIED` overall PASS, screenshot is omitted, Suite source remains unchanged, and shutdown, cleanup and final containment are VERIFIED. If it fails, retain the fixed reason and any lease for review; do not relabel it as unsupported after execution. This one new test plus the historically accepted Waves 1–2 supports the blueprint Batch 4 gate only for mapped, exercised behaviors. Native dialogs, full restart and error-boundary triggering belong to later feature-specific regression work after separate lifecycle/dialog design review; Batch 5 engine/visual coverage and Batch 6 cloud/entitlement work remain unstarted.

---

Status: **Wave 1 HOST_VERIFIED; Wave 2 host run FAILED at Health result / correction HOST_VALIDATION_REQUIRED**. Stop after Wave 2 for owner review. No Batch 5 or 6 work was started.

## Wave 2 Health failure investigation — 2026-10-18

The owner-host run `9f1cba90-1c94-4da4-8228-2ea6079cfbe3` had 225/225 tests PASS, doctor PASS, six isolation stages PASS, five baseline and three Wave 1 scenarios PASS. In Wave 2, no-project log rejection passed, diagnostics failed with `W2_HEALTH_RESULT_MISSING`, and project log export was NOT_RUN by the existing fail-fast rule. `pnpm report:verify artifacts/reports/9f1cba90-1c94-4da4-8228-2ea6079cfbe3/report.json` returns `REPORT_VERIFIED` with overall FAIL, and shutdown, cleanup and final containment VERIFIED. The retained trace proves the Health panel **and `.healthContextSummary` were visible**; the *second* Health assertion rejected its severity/label contract. It does not record the actual severity, so the precise host value cannot be recovered from that report.

Read-only Suite inspection identifies a concrete runner contract defect: `apps/desktop/services/health/types.js` and `packages/platform/src/health/types.ts` include `unknown` as a legitimate loaded severity; `HealthContextRail.tsx` renders it in the summary with a `<strong>` label, while the runner's second assertion omitted `unknown`. The Health service normalizes unrecognized collector severities to `unknown`, and its snapshot RPC returns `{health: ...}` as the renderer hook expects. This is the source-supported likely cause of the host failure, **not proof of the host attribute value**. No Suite defect is established from the retained evidence. The hook also has legitimate initial loading, visible alert/error, and absent-summary states. It can retain an older snapshot while displaying a refresh error, so an alert must take precedence over that snapshot. Empty findings still render a summary. A visible `error` or `unavailable` severity is not accepted as a successful Health result.

`src/functional-wave2.ts` now classifies only fixed DOM states: `READY`, `LOADING`, `ERROR`, `UNAVAILABLE`, `INVALID`, or `MISSING`. It polls through loading, accepts source-defined `unknown` as a loaded summary, requires the existing independent viewport-visible summary assertion, and refuses alerts, error/unavailable severities, malformed summaries and missing results. `src/smoke-contract.ts` adds sanitized `W2_HEALTH_LOADING_TIMEOUT`, `W2_HEALTH_SERVICE_ERROR`, `W2_HEALTH_RESULT_UNAVAILABLE`, `W2_HEALTH_RESULT_INVALID`, and `W2_HEALTH_INSPECTION_FAILED`; no DOM text, attribute value or RPC data enters the report. Diagnostic export still requires its visible confirmation and canonical private JSON oracle. Wave 2 remains fail-fast, with BOOT-only screenshot retention unchanged. New focused tests in `tests/functional-wave2.test.cjs` cover loading→ready, missing/loading timeout, visible error, unavailable severity, malformed/absent summary and the allowed `unknown` contract. These are **mocked/source-backed validations**, not a successful live rerun.

Local managed-environment results: `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `git diff --check` PASS; `pnpm test` **227 total, 226 PASS, 0 FAIL, 1 SKIP** (existing TCP restriction). The failed host report still verifies, including its original FAIL and verified cleanup. `pnpm qa doctor` remains `BLOCKED / PORT_UNAVAILABLE` under Codex; no isolation or GUI attempt was made and no scratch lease was deleted. This turn changed only `src/functional-wave2.ts`, `src/smoke-contract.ts`, `tests/functional-wave2.test.cjs`, and this handoff on top of the preserved uncommitted Wave 2 work. The Suite checkout was inspected only and its pre-existing changes remain untouched. No commit or push was made.

Owner-host revalidation in a normal Pop!_OS terminal:

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run
pnpm qa functional
pnpm qa functional-wave2
# Substitute the new run ID reported by the last command:
pnpm report:verify artifacts/reports/<new-run-id>/report.json
```

Wave 2 acceptance remains pending: require all three scenarios PASS with diagnostic export's visible and private-file oracles, no Wave 2 screenshot, and shutdown/cleanup/final containment VERIFIED. If Health fails again, preserve the new sanitized reason and report; a service error or unavailable result is a Suite behavior requiring owner review, not a reason to weaken the assertion. Formal isolation review remains PENDING, build provenance NOT_PROVEN, and whole-product behavior denominator NOT_VERIFIED.

## Wave 2 checkpoint and acceptance boundary

At the start of Wave 2 the runner was clean on `main` at `aad3fdc` (`Add Batch 4 functional GUI regression coverage`). The owner reports 219/219 tests on Pop!_OS. The latest retained normal smoke report `4ccd5998-8029-4562-9b9b-4b42c6a2972c` and Wave 1 functional report `77bb25a3-500b-41b1-b685-ccbb27ee6557` both returned `REPORT_VERIFIED`, overall PASS, five and three scenario PASS respectively, with shutdown, cleanup and final containment VERIFIED. Both retain `isolationReview:PENDING` and `provenance:NOT_PROVEN`. The historical BOOT failure screenshot report `76bc95b1-b50a-4028-a490-cd3c58485185` also still verifies. This evidence precedes the Wave 2 source changes.

The **actual committed Wave 1 revision**, including its three scenarios, was independently cloned to `/tmp/pl-beta-b4w2-clone-g7dRAl/runner` using `git clone --local --no-hardlinks`. Offline frozen pnpm installation (`--ignore-scripts --package-import-method=copy`), format check, typecheck, build and tests all passed: 218 PASS, 0 FAIL, 1 managed TCP skip. This closes the prior handoff's clean-clone gap for Wave 1. It does not constitute live Wave 2 validation.

### Wave 2 read-only discovery

| Candidate and source | Verified control and expected effect | Oracle / fixture / capability | Decision |
| --- | --- | --- | --- |
| No-project Export Logs: `App.tsx:3743`, `platform/shell/components.tsx` | Top-bar button sets visible status `No project open`; no RPC is sent. | Status bar and unchanged empty private project root; `PL-CORE-SHELL-001` for the status UI only. | **Selected negative path.** |
| Health summary and diagnostic export: `App.tsx:219–250,3885–3901`, `components/health/HealthContextRail.tsx`, `platform/health/useHealthSnapshot.ts`, desktop `operations.js` and `services/diagnostics/export.js` | Health panel opens, an initial `health.snapshot` result appears, Export Diagnostics reports a private file. | Visible panel/summary/confirmation plus one bounded, canonical export under private `/scratch/home/.plcs/diagnostic-exports`; `PL-CORE-DIAG-001` complete. `PL-CENTER-HEALTH-001` remains **missing** in the registry and is not credited. | **Selected.** Export content is not copied into evidence. A refresh-freshness claim is deferred because the rendered timestamp has only second precision and the loading transition can be missed. |
| Scratch project log export: `App.tsx:4016–4079,3739–3752`, desktop `services/projects.js` and `backend.js:106–116` | Create a uniquely named project through UI, then Export Logs; UI displays the returned log location. | Manifest name/schema and a newly created canonical log file inside scratch; `PL-CORE-DIAG-001` for log behavior, not a claim of complete project management coverage. | **Selected.** |
| Scoped settings restart: `App.tsx:3590–3660`, `platform/shell/storage.ts`, platform settings package | Shell zoom/theme state persists in private localStorage, but the runner supervises one Electron process per session. | A full app-process restart with the *same* private profile, renewed ownership and containment proof is required. | **Deferred.** A renderer reload would not satisfy the requested application-restart oracle. |
| Open Project custom modal: `App.tsx:4083–4130` | The modal exists in source, but `setShowOpen(true)` has no reachable call. The visible top-bar Open Project uses `dialog.openProjectFolder`, a native dialog. | No safe fixed UI path to the custom modal; native dialog requires separate ownership/selector review. | **Unsupported in current UI; no scenario.** |
| Project archive import/export: `App.tsx:746–774`, desktop project service | Uses native save/open dialog and archive helpers. | Requires a reviewed native-dialog path and bounded archive destination. | **Deferred.** |
| Error boundary fault: `WorkspaceErrorBoundary` in `App.tsx` | Boundary is installed, but no safe deterministic UI control injects a render fault. | Would require changing Suite or adding a reviewed fixture. | **Deferred; no fabricated error-boundary pass.** |

### Wave 2 implementation and evidence

`pnpm qa functional-wave2` runs exactly three fixed IDs in a nonce-bound `batch-4-v2` plan. It retains the approved Bubblewrap/Xvfb/process, port, preload and snapshot gates. The plan rejects an evidence-probe request, and the outer launcher always records `OMITTED_SAFETY_GATE / CAPTURE_SCOPE_UNAPPROVED` for a Wave 2 failure. Neither RPC tokens nor diagnostic payloads enter the bounded report trace. The export oracle checks a single canonical, owned, size-bounded private JSON file and fixed kind/schema; the project oracle checks a UI-created manifest and the scratch log file. Failure reason codes are `W2_*`, with fixed expected/actual observations and reproduction steps. Report v2 adds only the distinct `ISOLATED_FUNCTIONAL_WAVE2` mode and preserves five-scenario smoke, three-scenario Wave 1 and BOOT screenshot report verification. No generic script, RPC, selector or path interface was introduced.

New/changed files in Wave 2: `src/functional-wave2.ts`, `src/smoke-contract.ts`, `src/coverage.ts`, `src/launch.ts`, `src/cli.ts`, `src/electron-entry.ts`, `src/sandbox-session.ts`, `src/report.ts`, `tests/functional-wave2.test.cjs`, and this handoff. The Suite worktree was read only and retained its pre-existing changes. No commits or pushes were made.

Wave 2 tests demonstrate that an action/response with an absent UI assertion cannot validate as PASS; another controlled mock makes all UI checks return true but omits the private diagnostics file, producing FAIL and NOT_RUN for the remaining scenario. A private temp report from the controlled failure is independently reviewed as FAIL with the fixed failed step and verified cleanup. These are **mocked contract demonstrations**, not live Suite outcomes. `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `git diff --check` and `pnpm test` passed locally: **225 tests, 224 PASS, 0 FAIL, 1 SKIP** (the existing TCP-bind test). Historical Wave 1, smoke and actual BOOT screenshot reports still return `REPORT_VERIFIED`. `pnpm qa doctor` returned `BLOCKED / PORT_UNAVAILABLE` in this managed environment; no new isolation check or GUI launch was attempted because this environment cannot provide the required port proof and prior scratch leases remain untouched. No live Wave 2 result is claimed here. Whole-product behavior applicability remains `NOT_VERIFIED`; manual coverage is `NOT_ASSESSED`.

### Owner-host Wave 2 gate

Run in a normal Pop!_OS terminal after reviewing any retained leases and confirming the disposable Suite renderer build is fresh:

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run
pnpm qa functional
pnpm qa functional-wave2
# For each returned relative report path:
pnpm report:verify artifacts/reports/<run-id>/report.json
```

Acceptance requires all three Wave 2 scenarios PASS, a private JSON/HTML report, no screenshot image for Wave 2, and shutdown/cleanup/final containment VERIFIED. Inspect only sanitized report output; do not paste diagnostic export contents. If a scenario fails or a lease is retained, preserve it and share the fixed reason/report-verifier result. Host verification is still required. Remaining Batch 4 work includes a reviewed app-restart settings test, native-dialog project workflows and deterministic error-boundary coverage; none is marked complete here.

## Historical Wave 1 handoff (superseded by host evidence above)

The master blueprint, `AGENTS.md`, and Batch 0–3 handoffs were reviewed before implementation. The runner was on `main` at `4af0539` with a clean worktree; the adjacent disposable Suite checkout was inspected only and had pre-existing changes. No Suite file was edited. Current committed revision `4af0539` was copied to `/tmp/pl-beta-b4-clone-SkdGz1/runner` with `git clone --local --no-hardlinks`; an offline frozen pnpm install, formatting check, typecheck, build, and tests completed there (214 pass, one managed-environment TCP skip). This proves the clean committed baseline, not the uncommitted Batch 4 work.

The disposable Suite checkout currently has pre-existing uncommitted changes, including `App.tsx` and desktop RPC files. It was never edited by this task. Those changes may make its renderer build stale; `qa doctor` must gate a live run until the owner has a fresh validated target build. The owner-host Batch 3 artifacts still verify under the current validator:

| Artifact run | Result | Evidence |
| --- | --- | --- |
| `cde34fe5-20bd-4fb3-a5da-0fc02cc0930b` | `REPORT_VERIFIED`, overall PASS | Five smoke scenarios PASS; shutdown, cleanup and final containment VERIFIED. |
| `76bc95b1-b50a-4028-a490-cd3c58485185` | `REPORT_VERIFIED`, intentional overall FAIL | Actual BOOT UI PNG CAPTURED; scenario/assertion, digest, shutdown, cleanup and final containment verified. |

These reports established the pre-Wave-1 host evidence at the time of the original handoff. Later Wave 1 host evidence is recorded in the Wave 2 checkpoint above. Formal `isolationReview` remains `PENDING`; build provenance remains `NOT_PROVEN`.

## Read-only Suite discovery

| Candidate and source | Real control / supported behavior | Observable and independent oracle | Fixture / capability / decision |
| --- | --- | --- | --- |
| High contrast, `apps/renderer/src/App.tsx`, `platform/shell/components.tsx`, `platform/shell/storage.ts` | `High Contrast` button changes shell `data-theme`, `aria-pressed`, label and private shell state. | Visible theme and button state; private `pl.shell.workspace-state.v1` state. | Empty synthetic profile; `PL-CORE-ACCESS-001` complete. **Selected.** This is shell accessibility, not a claim that the broader scoped Settings service was tested. |
| Workspace shortcut, `App.tsx`, `platform/shell/useShellShortcuts.ts`, `config/navigation.ts` | `Ctrl+2` selects Docs; Code IDE nav button is equivalent UI navigation. | Active nav label and workspace title for Docs, then Code IDE. | Empty synthetic profile; `PL-CORE-SHELL-001` complete. **Selected.** |
| New Project cancel/Escape, `App.tsx`, `components/Modal.tsx` | New Project opens a real modal; Cancel and Escape close it without create RPC. | Modal disappears, no-project context remains, private project root stays absent/empty. | Empty scratch; `PL-CORE-ACCESS-001` complete. **Selected.** |
| Full settings workflows, `App.tsx` and platform settings modules | Visible shell controls exist, but a broader scoped settings/RPC flow has different state and contracts. | Would need a separate visible and persisted scope-specific oracle. | **Deferred** pending a narrower verified fixture and source review. |
| Additional project management, `App.tsx` project/recent handlers | Implemented but Batch 2 already covers create, duplicate rejection and reopen. | Additional delete/import/export needs stronger artifact and confirmation review. | **Deferred** to avoid redundant or destructive coverage. |
| CLI/RPC normal workflow | Suite has supported interfaces; a backend response alone cannot prove GUI state. | Requires a specific UI/backend oracle and bounded command contract. | **Deferred**; no generic RPC or arbitrary command facility added. |
| Error boundary and other dialogs | Error boundary and modal infrastructure exist; controlled failure injection or fixture-specific state is needed. | Requires safe triggering and a visible error state. | **Unverified/deferred**; no placeholder control is counted as passing. |

## Implementation

`pnpm qa functional` is a fixed three-scenario suite with a nonce-bound `batch-4-v1` plan. It uses the existing Bubblewrap, private Xvfb, staged snapshot, Electron preference/preload checks, renderer/RPC ownership, scratch lease, and verified cleanup. No user-supplied selector, action, path or RPC is accepted. Every action is followed by a bounded visible-state assertion; the dialog scenario also checks scratch project-root emptiness and canonicality before and after. Fixed `FUNC_*` reasons and boolean observations enter the existing bounded trace. Failures stop subsequent scenarios.

Report v2 remains compatible with historical five-scenario reports and now accepts a distinct `ISOLATED_FUNCTIONAL` mode with exactly the three ordered functional IDs. Capability links use the authoritative registry, while the whole-product behavior denominator remains `NOT_VERIFIED` and manual coverage `NOT_ASSESSED`. Functional failures always omit screenshots with `CAPTURE_SCOPE_UNAPPROVED`; the reviewed synthetic BOOT-only capture policy has not expanded. Report PASS still requires shutdown, cleanup, final containment and complete evidence.

Changed files: `src/functional.ts`, `src/smoke-contract.ts`, `src/electron-entry.ts`, `src/sandbox-session.ts`, `src/launch.ts`, `src/cli.ts`, `src/report.ts`, `src/coverage.ts`, `src/screenshot.ts`, `tests/functional.test.cjs`, and this handoff. There are no commits or pushes.

## Verification and limitations

- `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`: PASS.
- `pnpm test`: **218 pass, 0 fail, 1 skip** (managed-environment TCP test skip); four new focused tests pass. The controlled mock returns action success while withholding the expected Docs UI, and the result is FAIL with `FUNC_SHORTCUT_NAV_NOT_VISIBLE`, followed by NOT_RUN. A separate test proves a functional failure cannot invoke `capturePage`. These are not live Suite results.
- `git diff --check`: PASS. Both historical Batch 3 reports: `REPORT_VERIFIED`.
- Managed-environment `pnpm qa doctor`: `BLOCKED / PORT_UNAVAILABLE`; this environment cannot check the private listener. `pnpm qa isolation-check`: `BLOCKED / OWNERSHIP` and left `.scratch/run-us90mZ` with an active lease. That lease and the two pre-existing leased runs were **not deleted or adopted**. The exact process/lease state requires owner review on the normal host. No Batch 4 live GUI attempt was made here.
- The selected flows and selectors are source-verified but **not yet host runtime verified**. A changed target snapshot or renderer build can still expose a mismatch; the runner must then report FAIL, not be relabeled as a pass.

## Owner-host acceptance

From a normal Pop!_OS terminal in `~/Projects/pl-beta-test-runner`:

```bash
nvm use 22.12.0
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run
pnpm qa functional
```

For each returned report path, run `pnpm report:verify <relative-report.json-path>` and review its JSON/HTML. A functional acceptance run requires exactly three PASS results, `LIFECYCLE_VERIFIED`, shutdown/cleanup/final containment VERIFIED, no screenshot artifact, and no changed Suite source. If `qa functional` fails or is blocked, preserve the reported lease and share only the sanitized result and report verifier output. Do not delete retained leases to force a rerun.

The next recommended Batch 4 wave, after this host review, is a source-verified settings persistence or additional safe dialog validation with its own independent oracle. No further wave is authorized by this handoff.
