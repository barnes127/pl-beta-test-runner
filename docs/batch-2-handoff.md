## Batch 2 persistence failure review — 2026-10-17

**Acceptance: BLOCKED pending owner-host `qa run`.** The owner's latest actual
isolated run passed BOOT-001, NAV-001 and PROJ-001, then failed PERSIST-001 with
generic `UI_ASSERTION_FAILED`; PROJ-002 was not run. The owner's build and all
176 automated tests passed with no skips. That old generic code does **not**
identify which persistence assertion failed, so an exact historical stage or a
Suite defect cannot honestly be claimed from the available result.

Repository-first inspection confirmed runner pwd/Git root
`/home/brandenbarnes/Projects/pl-beta-test-runner`, HEAD 38d0ede with existing
uncommitted Batch 2 files preserved, and disposable Suite canonical root
`/home/brandenbarnes/Projects/pl-creators-suite`. The Suite checkout already
has unrelated uncommitted owner changes; this review only read it. Current
`App.tsx`, `CodeWorkspace.tsx`, Code service, RPC registry/contract, window
state and CSS were inspected. The Code IDE input and textarea are controlled by
React. `code.create` creates `project/code/qa-smoke.txt` with `wx`, then the UI
sets an active editor and refreshes the list. The list's active `<strong>` adds
` ✓` to the name. `code.save` writes a temporary file and renames it; the UI
only shows `Saved` after its RPC resolves. `Close File` removes the editor, and
the list button invokes `code.read` to restore its bytes.

The runner had a source-verifiable viewport defect: clicking **Save File**
scrolls the button into view in Suite's scrollable `.workspace` (default
1100×720 Electron window), while the runner immediately required `.docsSaved`
above the 460px editor to intersect the viewport without scrolling it back.
The same exposure applied to the dirty label, the file list after closing and
the reopened editor. A correct UI could therefore fail `UI_ASSERTION_FAILED`.
The old host result cannot prove this was the specific failing await. The
runner now scrolls each existing, unique persistence target into view and
**still requires its exact visible text or value**. It separately verifies the
new file in the list with Suite's exact active `✓` label, confirms controlled
input values, requires actual textarea removal after Close File, and preserves
exact saved and reopened byte comparisons under canonical scratch paths. All
file creation, editing, saving and reopening still use the Suite's UI handlers.

Fixed sanitized `PERSIST_*` reasons now identify name entry, Create action,
active file listing, editor opening, content entry, dirty state, Save action,
saved state, scratch-path safety, saved disk bytes, Close action, editor removal,
closed-file listing, reopen action, reopened content and reopened disk bytes.
`PERSIST_READINESS_LOST` distinguishes a failed owned-session check. The report
validator accepts these codes only for PERSIST-001. Stage wrappers discard raw
DOM/RPC/filesystem errors; CLI reports no project names, paths, content, URLs,
tokens, environment data or app output. A failure still stops PROJ-002.

Static PROJ-002 review: the recent-project selector is the Suite's real
`button.recentItem[title]`, and its click handler opens the project then updates
recents and status. The scenario begins by closing the file, so its subsequent
file-list label correctly expects the unmarked filename. Its later `see` calls
for the alternate project's empty list, restored list and editor value may be
viewport-sensitive after PERSIST-001 scrolls the main workspace; this remains
**untested** because the host stopped before PROJ-002. No PROJ-002 flow was
expanded or marked passing.

Changed for this focused review: `src/smoke.ts`, `src/smoke-contract.ts`,
`tests/smoke.test.cjs`, this handoff. No Suite file, dependency, configuration,
security gate or retained scratch lease was changed or removed. Focused mock
test: **63/63 PASS**, including controlled textarea edits, offscreen labels,
exact disk oracle, each stage failure, code scoping and sanitization. Full
local `pnpm test`: **196 total, 195 PASS, 0 FAIL, 1 SKIP** (managed TCP
restriction). `pnpm format:check`, `pnpm typecheck`, `pnpm build` (inside
`pnpm test`) and `git diff --check`: PASS. Actual local `pnpm qa run`: BLOCKED
`PORT_UNAVAILABLE` before Electron/UI. These mock passes are not live
persistence acceptance; process cleanup and Suite/host write isolation were
not revalidated live here. The owner's earlier successful first three scenarios
remain the latest live evidence for those scenarios.

Exact normal Pop!_OS host rerun, from the runner only:

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
```

Expected automated test count is 196. Review the sanitized `PERSIST_*` reason
if PERSIST-001 fails again, and keep PROJ-002 NOT_RUN until it actually runs.
The formal `isolationReview` remains `PENDING`. Batch 3 is not started.

---

> Recheck of repeated project-failure request (2026-10-17): the existing focused
> repair and all PROJ_* stage codes are intact. The repeated 154-test/generic
> UI_ASSERTION_FAILED evidence does not establish a new failure of this version.
> No additional code change was justified or made. Fresh format check, typecheck,
> explicit build and regressions PASS: **176 tests, 175 PASS, 0 FAIL, 1 SKIP**
> (managed TCP restriction). Actual qa run still stops at doctor PORT_UNAVAILABLE,
> before Electron. Existing Suite changes/leases were not touched. Rebuild and
> run on the host using the commands below; expect 176 tests and a specific
> PROJ_* reason if the project scenario fails. No live project pass is claimed.

# Batch 2 — Project creation stage diagnosis and repair (2026-10-17)

**Focused runner correction implemented; real project scenario acceptance awaits
owner-host rerun.** Owner evidence: build/typecheck PASS, 154/154 regressions
PASS; real smoke BOOT-001 and NAV-001 PASS, PROJ-001 UI_ASSERTION_FAILED,
PERSIST-001 and PROJ-002 NOT_RUN. Those are actual host results. No later
scenario is counted as passing from mocks.

## Repository and actual contracts inspected before editing

pwd and Git toplevel both identify
`/home/brandenbarnes/Projects/pl-beta-test-runner`, HEAD 38d0ede. The existing
Batch 2 worktree changes were inspected and preserved. The disposable Suite
canonical root is `/home/brandenbarnes/Projects/pl-creators-suite`.
Read actual smoke/contract code, App.tsx modal and project context handlers,
Modal.tsx, project RPC registry and validation, services/projects.js,
project contract/persistence, storage/paths.js, error serialization, and the
installed React DOM value-tracking implementation. No guessed selectors or RPCs.

Verified contracts: New Project opens Create New Project; existing inputs have
placeholders My Project and Defaults to ~/PLProjects. Create submits newName and
newBaseDir to project.create, then updates projectRoot, awaits recent.add and
refreshRecents before hiding the modal. Default root is os.homedir()/PLProjects;
inside the validated sandbox this is `/scratch/home/PLProjects`. The service
writes pl-project.json with schemaVersion=1 and the sanitized project name;
runner-generated names need no sanitization changes. Duplicate creation rejects
an existing root before writing the manifest. Ordinary backend exceptions are
serialized as generic Internal RPC error; tests must inspect visible error state
rather than assume the service's original error text survives RPC serialization.

## Verified defect and retrospective limit

Project checks still required the sidebar `.projectSummaryValue` to intersect
the viewport. That repeats the independently established boot-test defect:
Suite's scrollable 100vh sidebar places this summary after all studio navigation;
it need not be initially visible. A project can be correctly created and visible
in main workspace context while the sidebar summary is offscreen.

Project context checks now use `.workspaceHeader .workspaceSubtitle`, matching
**exactly** `Project: <expected scratch root>`. App.tsx renders both elements from
the same projectRoot state. Visibility, uniqueness and exact context matching
remain required; no assertion is removed. The shared creation helper and the
single identical context assertion in PROJ-002 receive this same narrow repair;
no other scenario flow is rewritten, and PERSIST-001 is unchanged.

The old host code UI_ASSERTION_FAILED cannot establish which await failed.
Its candidates include modal appearance/disappearance, project summary viewport,
duplicate error visibility, and modal cancellation. **The exact historical host
predicate remains unproven.** The incorrect viewport contract is independently
verified and corrected; fixed stage reasons now distinguish a different remaining
failure. No Suite functional defect has been established or silently repaired.

## Fixed sanitized stage diagnostics

| Stage | Failure reason |
| --- | --- |
| Permission/window readiness lost before an action | PROJ_READINESS_LOST |
| Scratch root canonical/empty-state checks | PROJ_SCRATCH_ROOT_INVALID |
| New Project click | PROJ_NEW_PROJECT_ACTION_FAILED |
| Correct creation modal appears | PROJ_MODAL_NOT_READY |
| Name fill and bounded value acknowledgement | PROJ_NAME_INPUT_FAILED |
| Scratch root fill and bounded value acknowledgement | PROJ_ROOT_INPUT_FAILED |
| Initial Create click | PROJ_CREATE_ACTION_FAILED |
| Creation workflow displays an error | PROJ_CREATE_REJECTED |
| Creation modal closes within existing deadline | PROJ_MODAL_DID_NOT_CLOSE |
| Exact visible current-project context | PROJ_CONTEXT_NOT_UPDATED |
| Canonical manifest, JSON, name and schema | PROJ_MANIFEST_INVALID |
| Duplicate Create click | PROJ_DUPLICATE_CREATE_FAILED |
| Visible duplicate rejection error | PROJ_DUPLICATE_ERROR_NOT_VISIBLE |
| Manifest bytes remain identical | PROJ_DUPLICATE_MANIFEST_CHANGED |
| Root directory count remains one | PROJ_DUPLICATE_DIRECTORY_COUNT_CHANGED |
| Current-project context remains identical | PROJ_DUPLICATE_CONTEXT_CHANGED |
| Cancel duplicate modal | PROJ_DUPLICATE_CANCEL_FAILED |
| Duplicate modal closes | PROJ_DUPLICATE_MODAL_DID_NOT_CLOSE |

Stage wrappers discard raw UI/RPC/filesystem errors and retain fixed nested
project codes. The report validator restricts these codes to the two existing
project scenarios. No names, paths, values, actual DOM text, URL, RPC token or
raw application output are added to reports. PROJ_CREATE_REJECTED identifies an
observable UI workflow error; it does not claim which RPC failed, since the UI
also awaits recent updates after project creation.

## Controlled inputs, async completion and negative test

The native prototype value setter plus input/change events is retained. Actual
installed React DOM tracks instance assignments and detects changes by comparing
the tracked and native values, which supports the current prototype-setter
approach. No verified input-event defect justified changing it. Both project
fields now require bounded DOM-value acknowledgement after filling. This is not
a claim to inspect React's private component state; exact resulting project UI
and manifest name/schema remain the independent end-result checks.

Creation now waits for modal closure while also checking for a visible nonempty
error box; a rejected workflow is distinguished from pending/stalled completion.
The five-second wait is unchanged. The duplicate negative path remains mandatory:
visible error and retained modal, unchanged manifest SHA-256, one project directory,
unchanged visible context, then Cancel and modal disappearance. UI actions still
use the actual event handlers; no testing RPC creates a project behind the UI.

## Validation and safety

`pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`,
`pnpm test`, `git diff --check`: PASS after final formatting.
Final suite: **176 tests, 174 PASS, 0 FAIL, 2 SKIP**. Skips are the real
occupied-port check (managed environment denies binding) and a real Bubblewrap
probe whose process identity was unconfirmed; its leased test fixture was retained
without asserting cleanup success. The printer required a second formatting pass;
final format check passes. No formatter/security policy was changed.

Focused tests run the actual smoke driver/page helper against fake DOM/private
filesystem contracts: offscreen sidebar with correct visible context passes the
project scenario; pending/rejected workflow, failed inputs/actions, wrong context,
invalid manifest, all duplicate oracles and permission loss fail with the expected
stage. Additional tests exercise React-style value tracking and asynchronous field
updates. Every project reason is tested for sanitized report propagation and
scope restriction. These are **mocked tests, not real Electron/project passes**.

Actual `pnpm qa run` here remains exit 3 / PORT_UNAVAILABLE at doctor, before
Electron or GUI actions. Isolation, readonly source mounts, nonce permits,
scratch-only writes, effective security/preload verification, listener ownership,
bounded waits and cleanup controls are unchanged. No Suite edits, deleted leases,
host-display use, dependencies, commits, pushes or Batch 3 work.

Files changed in this focused turn: `src/smoke.ts`, `src/smoke-contract.ts`,
`tests/smoke.test.cjs`, `docs/batch-2-handoff.md`. Earlier uncommitted Batch 2 work
remains intact. Formal isolationReview remains PENDING.

## Next validation gate: one normal-host run

```bash
(
set -euo pipefail
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run
)
```

Share only sanitized CLI JSON and stop for review. If PROJ-001 still fails, the
new fixed code identifies its failing stage; do not dump DOM, paths, RPC payloads
or app logs, remove the negative check, or delete leases to obtain a pass.
Earlier records below are historical where superseded.

---

# Batch 2 — First live boot assertion repair (2026-10-17)

**Focused runner fix implemented and tested; owner-host rerun required.** The
owner reports 141/141 host tests, format/typecheck/build, doctor, six Bubblewrap
stages and two ordinary lifecycle checks PASS. First live smoke run failed
SMOKE_SCENARIO_FAILED: BOOT-001 UI_ASSERTION_FAILED; all four later scenarios
NOT_RUN. These are real host results, not mocked evidence.

## Diagnosis and narrow correction

Repository inspection confirmed runner pwd/Git root
`/home/brandenbarnes/Projects/pl-beta-test-runner`, HEAD 38d0ede, the existing
uncommitted Batch 2 changes, and canonical target
`/home/brandenbarnes/Projects/pl-creators-suite`. Existing changes were preserved.
Inspected smoke/contract, bootstrap, supervisor, actual renderer App.tsx,
WorkspaceHeader.tsx, shell components/defaults and app.css before editing.

Batch 1 readiness checks whether any New Project button has layout width and
whether the expected preload bridge exists. Batch 2 added uniqueness,
viewport intersection and a visible sidebar `.projectSummaryValue` with the text
No project open. Both labels and selectors exist; `projectRoot` initializes to
an empty string. No stale initial-state or observed Suite UI defect was found.

**Verified runner defect:** the boot assertion assumes the sidebar's current
project summary must initially be in the viewport. Suite app.css gives `.sidebar`
height 100vh and overflow-y:auto; App.tsx puts the summary after branding and all
studio navigation. Its initial viewport visibility is not a Suite contract.
The stronger Batch 2 helper rejects offscreen elements while the working Batch 1
check does not inspect this summary. A fake-DOM regression reproduces that
rejection with a normal, offscreen summary.

BOOT-001 now checks `.workspaceHeader .workspaceSubtitle` for the same initial
project state. App.tsx renders it using the identical `projectRoot` conditional
as the sidebar: project path when open, No project open otherwise. New Project
is scoped to the inspected `.topbarRight button`. Both controls must still be
unique, present and visible; wrong initial project state still fails. No timeout
was increased, UI state forced, scrolling added to boot or visibility requirement
removed. Later scenario implementations are unchanged.

**Retrospective limit:** the old host report did not distinguish its two boot
assertions. It cannot prove whether that particular host run failed on the
sidebar viewport check or on the button check. The independently verified
viewport assumption is corrected; the new diagnostics identify any remaining
failure without guessing at host DOM data. No live success or exact historical
predicate is fabricated.

## Fixed sanitized boot reasons

BOOT_READINESS_LOST; BOOT_INSPECTION_FAILED;
BOOT_NEW_PROJECT_MISSING_OR_AMBIGUOUS; BOOT_NEW_PROJECT_NOT_VISIBLE;
BOOT_PROJECT_STATE_MISSING_OR_AMBIGUOUS; BOOT_PROJECT_STATE_NOT_VISIBLE;
BOOT_PROJECT_STATE_NOT_EMPTY.

Checks retain bounded rendering polls. The page returns only booleans; these
allowlisted reasons reveal no actual DOM text, project name/path, URL, token,
environment or app output. Report validation restricts BOOT_* reasons to BOOT-001
and rejects extra raw diagnostic fields. Shared page helper adds only a read-only
uniqueness query; existing scenario action/visibility behavior is unchanged.

## Validation and safety

`pnpm format`, `pnpm typecheck`, `pnpm test` (includes TypeScript build),
`pnpm format:check`, `git diff --check`: PASS. Final regression suite:
**154 tests, 153 PASS, 0 FAIL, 1 SKIP** (real occupied-port test cannot bind TCP in
this managed environment). Focused mocks cover offscreen summary/equivalent
main state, delayed rendering, every boot category, missing expected behavior,
secret suppression and actual report propagation/stopping.

Actual `pnpm qa run` here: exit 3 / PORT_UNAVAILABLE at doctor, before Electron
or GUI actions. No local UI pass claimed. Isolation/mounts, nonce-bound permits,
actual-window/security/preload checks, process ownership, scratch-only writes and
cleanup paths are unchanged. Formal review remains PENDING. No Suite edits,
host display use, lease deletion, dependency changes, commits, pushes or Batch 3.

Files changed **in this focused turn**: `src/smoke.ts`, `src/smoke-contract.ts`,
`tests/smoke.test.cjs`, `docs/batch-2-handoff.md`. All earlier Batch 2 worktree
changes remain intact.

## One owner-host rerun

```bash
(
set -euo pipefail
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run
)
```

Share only sanitized CLI JSON. Stop after that run for review; retain unresolved
leases. Successful ordinary lifecycle checks do not constitute smoke acceptance.
Earlier Batch 2 entries below are historical where superseded by this record.

---

# Batch 2 — Five scratch-only smoke scenarios

**Implemented, unit-validated; all live Batch 2 scenarios BLOCKED in the agent
execution environment. No Batch 3 work.** Owner-host Batch 1 evidence: two
LIFECYCLE_VERIFIED cycles, identical application digests, 130/130 tests and six
preflight passes. Local staging reproduced those four digests. Formal isolation
review remains **PENDING**. See [Batch 1 acceptance record](batch-1-handoff.md).

## Repository and checkpoint

Mandatory inspection ran before editing: pwd, Git toplevel, status, log, actual
scripts/config/modules and Suite UI/backend flows. Runner root and target are
the canonical `~/Projects/pl-beta-test-runner` and `~/Projects/pl-creators-suite`.
Worktree initially clean at **38d0ede**, already a focused Batch 1 completion
commit. No additional Batch 1 commit was needed. No commits/pushes/reset/pull or
Suite changes occurred. Cached origin/main equals that commit; live GitHub
comparison failed (DNS; browser lookup also unavailable). Local files were used.
The owner transcript has application digests but no Git SHA, so exact runner
commit provenance is not claimed from those logs alone.

## Scenarios and observable evidence

The live-result column reflects the owner's latest run **before** this
persistence correction. The corrected PERSIST-001 has not been run on the host.

| ID | Implemented checks | Live result |
| --- | --- | --- |
| PL-QA-BOOT-001 | Actual Suite window, visible New Project, no active project, verified preload/security | PASS / owner host |
| PL-QA-NAV-001 | Click Code IDE; active navigation label, workspace title `code`, visible empty-project content | PASS / owner host |
| PL-QA-PROJ-001 | UI creates nonce-named project; UI path, canonical scratch manifest name/schema; duplicate UI creation shows an error and leaves manifest/directory count unchanged | PASS / owner host |
| PL-QA-PERSIST-001 | UI creates text file, edits unique content, displays dirty/saved states; disk bytes match; Close File removes editor; reopen displays exact saved content | FAIL / generic UI_ASSERTION_FAILED before correction; rerun pending |
| PL-QA-PROJ-002 | Close file, create alternate empty project, click original recent-project button; current project and file listing restore; reopen shows original content and disk bytes match | NOT_RUN / owner host |

The focused negative case is part of PROJ-001, not a sixth scenario. It requires
visible nonempty `.errorBox`, retained modal/current project and unchanged
manifest hash/count. Actual backend normalizes ordinary Errors to generic
`Internal RPC error`; the test does not invent a friendlier error string.
Reopen means context switching through recents within one Electron process;
process-restart/session recovery persistence is not claimed. Persistence uses
Code IDE plain text, not PL Docs. No native Open Project dialog is automated.

## Verified local source selectors and integration

Inspected Suite `apps/renderer/src/App.tsx` (navigation, modal handlers, recents,
code handlers), `config/navigation.ts`, `components/Modal.tsx`,
`components/pl-ui/WorkspaceHeader.tsx`, `components/workspaces/CodeWorkspace.tsx`,
`platform/shell/components.tsx`, `rpc.ts`; desktop `services/projects.js`,
`services/project/contract.js`, `services/code/index.js`, `storage/paths.js`,
RPC registry/contracts/error serializer and reviewed main/preload paths.

- Navigation: `.nav .NavItem:nth-child(2)` is first checked for its exact child
  `.navLabel` text `Code IDE`; `.NavItem.active .navLabel` and
  `.workspaceHeader .workspaceTitle` must agree with visible workspace content.
- Modal: `[role="dialog"]`, `.modalTitle`, inputs with existing placeholders
  `My Project` and `Defaults to ~/PLProjects`, scoped Create/Cancel buttons.
- Context: `.workspaceHeader .workspaceSubtitle`; `.recentList button.recentItem` with the
  generated scratch title/path and exact project-name text.
- Code: `input[placeholder="main.py"]`, scoped Create, `textarea.codeEditor`,
  `.codeMeta .docsDirty/.docsSaved`, Close File / Save File,
  `.workspaceSplitSide button.listNutton` (the actual source spelling).

These selectors are **statically verified**, not runtime-validated here. The
page helper requires a unique visible target, viewport intersection and enabled
controls; actions may scroll the target into view. Native input/textarea setters
and input/change events reach existing React handlers. It returns booleans only.
No test IDs, Suite edits, injected preload, direct backend action calls or new
framework are used. Public `webContents.executeJavaScript` is documented in the
installed Electron 41 declarations and already worked in owner Batch 1 readiness.
New click/fill/React behavior still needs host verification. Playwright is absent
from both inspected lockfiles and was **not installed, attached or compatibility
validated**. No claim that Playwright itself is incompatible is made. The chosen
interface needs no Node inspector/CDP listener or sandbox/preload relaxation.

## Runtime gates, evidence and cleanup

`launch` stays non-mutating. `run` is the explicit owner-authorized fixed-suite
exception to the unchanged global `allowGuiMutations:false` config. It restricts
the canonical disposable target and runs doctor, full preflight, readonly source
staging and actual startup. The readonly smoke plan carries only version, nonce,
fixed suite and isolationReview=PENDING; it accepts no arbitrary path/script.
The namespace supervisor re-proves isolation/application mounts and both listener
PIDs after actual window/security/preload readiness, then atomically publishes a
nonce-bound permit. The bootstrap validates the permit, actual window, reviewed
snapshot, effective preferences and bridge before each action. Projects and code
are generated only under `/scratch/home/PLProjects`; output oracles reject
noncanonical paths and symlink ancestors. No host profile/project inspection.

All waits are bounded; smoke has a 105-second supervisor budget within a
150-second outer lifecycle deadline. Failure stops later scenarios, records fixed
reason codes and still requests graceful shutdown, bounds forced owned cleanup,
checks released ports/no surviving processes and re-proves final containment.
A lifecycle is successful only with a complete PASS suite and verified shutdown.
Reports contain fixed IDs/status/reasons and build digests; no text dumps, URLs,
RPC tokens, environment, raw app output, screenshots or traces. Scratch is removed
only after confirmed shutdown; uncertain ownership retains leases/data. No
unresolved production scratch lease was deleted, overridden or reused.

## Validation actually executed

- Baseline build/typecheck/regressions: 130 tests, 129 PASS, one TCP skip.
- Final `pnpm format`, `pnpm typecheck`, `pnpm test` (includes build),
  `pnpm format:check`, `git diff --check`: PASS. **141 tests: 140 PASS,
  0 FAIL, 1 SKIP** (real occupied-port check denied by execution sandbox).
- `pnpm qa environment`: TCP DENIED_EPERM, seccompMode=2, noNewPrivileges=1.
- `pnpm qa doctor`, actual `pnpm qa run`: exit 3 / PORT_UNAVAILABLE. The run
  stopped before scratch creation, Electron or GUI actions. No local live smoke
  passes or normal-host data modification checks are claimed.
- `pnpm qa list`: five implemented IDs, HOST_VALIDATION_REQUIRED, review PENDING.
- Read-only staging check: all four source/asset/desktop/snapshot hashes exactly
  match both owner-host cycles (recorded in Batch 1 handoff). A final read-only
  source/asset/desktop comparison also returned consumedTargetInputsUnchanged=true.
- Regression coverage includes strict plan/permit/report schemas and nonce
  rejection, fabricated review refusal, unsafe path/symlink rejection, DOM
  uniqueness/visibility and setter/events, readiness-loss stopping, permit ordering,
  late ownership failure, failed/stalled scenario cleanup and Batch 1 mode refusal
  of mutation reports. These are unit/mock tests, not live Electron smoke tests.

Unexpected behavior: an intermediate run hit the existing real Bubblewrap
fast-exit/identity race and failed the old cleanup-only test. The test now
explicitly preserves uncertain leased fixtures and marks that cleanup path
unverified instead of deleting them in generic teardown. The final run did not
hit that race. The old CLI unit test invoked bare `run`; it was changed to an
unapproved fixture target so host unit tests cannot accidentally execute GUI
mutations. A fake textarea test initially lacked its own native value setter;
its fixture was corrected. No application/security fallback was added.

## Files changed

`src/smoke.ts`, `src/smoke-contract.ts`, `src/cli.ts`, `src/launch.ts`,
`src/electron-entry.ts`, `src/sandbox-session.ts`, `src/lifecycle-diagnostics.ts`,
`src/errors.ts`, `tests/smoke.test.cjs`, `tests/launcher-static.test.cjs`,
`tests/safety.test.cjs`, `README.md`, `docs/batch-1-handoff.md`, this handoff.
No dependency/lockfile/target-config changes. All Batch 2 changes remain
uncommitted for review; the existing Batch 1 checkpoint is preserved.

## Exact owner-host commands

Run in a normal Pop!_OS terminal with other Suite/dev instances stopped. This
revalidates two ordinary non-mutating cycles on the changed runner before the
explicit smoke run. Stop at any failure; do not weaken security or remove leases.

```bash
(
set -euo pipefail
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm --version
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa launch
pnpm qa launch
pnpm qa list
pnpm qa run
)
```

Expected smoke success: LIFECYCLE_VERIFIED, scope=batch-2-smoke,
guiMutations=SCRATCH_ONLY, smoke.status=PASS, all five IDs PASS,
isolationReview=PENDING. A scenario PASS with failed shutdown does not accept the
run. Share only sanitized command JSON. The new runtime integration still needs
host validation; no further framework, scenario or Batch 3 work is started.
