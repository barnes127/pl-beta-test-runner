# Batch 0 — Discovery and integration contract

Discovery date: 2026-10-17. Target: `../pl-creators-suite` (inspection only).

**Outcome: source discovery delivered; isolation acceptance gate NOT PASSED.**
No Suite launch, dependency installation, GUI action, or target edit was performed.
Destructive GUI scenarios remain BLOCKED. Batch 1 is proposed, not implemented.

## Target identity and integration

All source paths below are relative to the Suite checkout.

- Git HEAD: `1437059c6c2b5861d7ef6fe0efe5f3ec57f3e30a`. This is a dirty working
  tree; HEAD alone does not identify the inspected source. See baseline below.
- Root `package.json`: version `0.0.1`, Node `22.12.0`, pnpm `10.31.0`,
  Electron `41.10.6`, TypeScript `5.9.3`. Local version probes returned Node
  `v20.20.2` and pnpm `10.31.0`. No runtime upgrade performed.
- `pnpm-workspace.yaml`: `apps/*`, `packages/*`.
- Root `dev` is `pnpm -r dev`; desktop `dev` is `electron .` with
  `apps/desktop/main.js` as package entry; renderer `dev` is `vite`.
  Do not combine root dev with another Electron/backend launch.
- `apps/desktop/main.js`: creates RPC before its BrowserWindow, loads
  `http://localhost:5173` in development, and uses
  `apps/renderer/dist/index.html` under `app.getAppPath()` when packaged.
  Running the desktop source against a built renderer does not automatically
  select packaged mode: the branch uses `app.isPackaged`.
- Development launch candidate: one separately owned renderer process using
  `pnpm --filter renderer dev -- --host 127.0.0.1 --port 5173 --strictPort`,
  then Playwright-controlled Electron with desktop directory as its app argument.
  This is a proposed invocation assembled from verified scripts, not a tested command.
  Verify localhost resolution and Electron availability before adoption.
- `apps/renderer/vite.config.ts` has relative base and React plugin; it does not
  explicitly set strict port behavior. Silent Vite port fallback must be prevented.
- `electron-builder.yml`: AppImage for Linux, NSIS for Windows, output `release`,
  packaged main `apps/desktop/main.js`. Root packaging scripts first build renderer.
  `release`, renderer `dist`, and root `node_modules` exist; their freshness and
  binary usability were not established. Root Electron shim exists; root Vite
  shim does not (workspace-local Vite resolution was not verified).
- `main.js` uses contextIsolation=true, nodeIntegration=false, sandbox=true.
  `preload.js` exposes only an allowlisted menu subscription bridge. Actual
  Playwright/Electron compatibility, packaged fuses, display access, and shutdown
  behavior require Batch 1 runtime verification; do not disable sandbox to guess.

## Process and port ownership contract

| Component | Verified source behavior | Required runner proof |
| --- | --- | --- |
| Renderer | Main expects localhost:5173 | Start exactly one owned Vite process; refuse occupied port; verify PID ancestry and loaded app identity |
| Electron | Main creates windows, no single-instance lock observed | Record launched PID and descendants; never attach to an unknown running Suite |
| RPC | Main generates 32 random bytes as hex; memoizes server startup | RPC listener must belong to launched Electron PID; do not start backend separately |
| RPC listener | `backend.js:startRpcServer` binds 127.0.0.1; main requests 38741 | Refuse conflict, including races; do not accept an unrelated responding service |
| Shutdown | will-quit closes RPC; non-mac window-all-closed quits app | Verify owned tree exits and ports release; never kill an unrelated process |

Backend listens on the requested port and rejects server errors; no automatic
port-increment retry was found in this startup path. Runtime initialization can
write diagnostics before binding succeeds. Thus a failed launch is not write-free.

Inspection command `ss -ltnp '( sport = :5173 or sport = :38741 )'` reported
“Cannot open netlink socket: Operation not permitted”. Its empty table does NOT
prove ports free. `ps -eo pid,ppid,comm` filtered for electron/vite/pnpm/pl-creators
returned no matches in this environment; host-wide absence is not established.
Ownership remains unproven and must fail closed if visibility remains insufficient.

## Persistent writes and isolation inventory

| Location / class | Source evidence | Isolation requirement |
| --- | --- | --- |
| Electron userData/window-state.json | `storage/windowState.js` | Dedicated profile; effective path verified before launch |
| userData/recents.json | `storage/paths.js`, `services/recents.js` | Separate from backend recents; create/open/import can update it |
| userData/plugins/registry.json and temporary files | `services/plugins/registry.js` | Fresh plugin registry; even listing can create storage |
| Chromium storage/cache and renderer localStorage | `main.js`, renderer `platform/*/storage.ts` | Isolate full profile/session storage, cache and OS config roots |
| ~/PLProjects | `storage/paths.js`, `services/projects.js`; also backend constant | Private home plus explicit disposable baseDir |
| ~/.plcs/recent-projects.json (+ .tmp) | `backend.js:readRecentsDb/addRecent` and injected recent RPC handlers | Private home; do not seed real recents |
| ~/.plcs/diagnostics | `services/runtime.js`, `diagnostics/storage.js` | Private home; logs/problems/jobs/crashes/resources JSONL, compaction temporary files |
| ~/.plcs/diagnostic-exports/*.json | `services/diagnostics/export.js:defaultExportPath` | Private home and explicit allowlisted export destinations |
| Project manifest and backups | `services/project/contract.js`, `project/persistence.js`, `projects.js` | All opened roots disposable; opening a migrated manifest may write |
| docs, code, sheets, movies, models, games, workflows | Corresponding `services/*/index.js` | All project subtrees, temporary saves, workflow backups/staging remain scratch-only |
| assets, registry, imported files | `services/assets/index.js`, `project-platform/assets.js` | Fixture-owned sources/destinations; reject symlink escapes |
| logs/session.log | `backend.js`, `util/fs.js` | Fixture-only project root; even log export can create file |
| .pl-index/project-index.json | `project-platform/indexing/constants.js`, `storage.js` | Fixture-only indexing writes and temporary files |
| .pl-recovery | `project-platform/recovery/paths.js`, `constants.js` | autosaves, status.json, journal.jsonl, snapshots/*/files and snapshot.json; restore/retention can remove files |
| Import/export and format output destinations | `projects.js`, `services/formats/output.js`, `archive.js` | Explicit scratch-only paths including sibling archives, staging, backups; archive helper spawns child commands |
| OS temporary files and subprocess side effects | `formats/archive.js`, Electron/runtime behavior | Private temp/cache roots and inherited isolation; exact runtime writes unverified |

Renderer keys observed include `pl.shell.workspace-state.v1`, legacy drawer keys,
`pl.command-center.dashboard.v1`, `pl.creator-profiles.v1`, `pl.creator-sessions.v1`,
and `pl.creator-session-recovery.v1`; CollapsiblePanel also writes per-panel keys.

This is a static inventory of discovered write classes, not proof that every
runtime write is contained. User-supplied project/export paths mean HOME changes
alone cannot enforce containment. No global runner ownership enforcement exists
in the target code inspected.

## Isolation proposal and smallest launch change

Prefer a runner-owned Linux filesystem sandbox with Suite mounted read-only,
normal home/project/business directories inaccessible, and only a uniquely marked
scratch tree writable. Give it private HOME, XDG config/cache/data, TMPDIR and
Electron profile paths before loading any target modules. Preserve only required
display access. Do not inherit production credentials or service configuration.
Validate effective Electron paths and Node homedir, observe writes, and prove
normal state is inaccessible before enabling GUI mutations. Check whether a
suitable unprivileged sandbox is available in Batch 1; none is assumed here.

If that cannot be achieved, block launch/mutations and propose a separately
owner-reviewed Suite launch contract that sets userData/sessionData and explicit
projects/recents/diagnostics/export roots before imports with path constants,
and restricts all mutation destinations to marked scratch. The runtime factory's
`diagnosticsRoot` option alone is insufficient: the production singleton uses
its default, and other services have separate paths. No target patch is included.

## Secret handling

Main passes `rpcToken` in the window query for both dev and packaged modes;
renderer `rpc.ts` sends it as `x-pl-rpc-token`. Never persist full window URLs,
query strings, HTTP headers, process environment, raw error dumps, or tokens.
Keep authentication in memory. Trace/HAR/network artifacts can contain both
query and header secrets; disable raw capture until a verified sanitization
strategy exists. Sanitize before writing evidence, not only before displaying it.
Screenshots must contain fixture data only. No production/cloud accounts.

## UI selector inventory (source verified, not runtime verified)

- `App.tsx:3717`: button named New Project; Open Project nearby.
- `components/Modal.tsx`: role=dialog and aria-modal=true, but no accessible
  name binding. Scope by dialog containing visible title text, not a guessed
  `getByRole('dialog', {name: ...})`.
- New project dialog (`App.tsx:4016`): placeholders `My Project` and
  `Defaults to ~/PLProjects`; scoped Create/Cancel buttons. The text labels are
  divs, not input label associations: do not assume getByLabel works.
- Open project dialog (`App.tsx:4084`): path input and scoped Open/Cancel buttons;
  empty path gives visible `Please enter a project folder path.`
- Navigation (`App.tsx:3040`, `config/navigation.ts`): buttons include label,
  hint and shortcut in their accessible name. Use a name regex beginning with
  the label (e.g. /^Docs/), not exact label alone. Active class is supporting
  state; assert the visible h2 from `WorkspaceHeader.tsx` as the main oracle.
- Current project summary displays projectRoot, and workspace subtitle is
  `Project: <root>` (`App.tsx:3081,3770`). The blueprint's example of a project
  name header is not the implemented contract.
- Docs (`components/workspaces/DocsWorkspace.tsx`): placeholder `new-doc.md`,
  New Document, Save Document, Close Document, filename library buttons, editor
  textarea. Editor lacks accessible label; scope to the active Docs workspace
  and require a unique textarea. Modified document panel title gains ` *`.
- Creator profile and Interface zoom have aria-label attributes.

## First five scenarios (all PLANNED / execution BLOCKED on isolation)

| Test | Action and visible oracle | Backend / persistence oracle | Capability mapping |
| --- | --- | --- | --- |
| PL-QA-BOOT-001 | Launch; visible New Project and ready workspace, no fatal error | Authenticated readiness may support UI proof; no persistence claim | Shell mapping pending |
| PL-QA-NAV-001 | Click Docs/Code IDE nav; corresponding h2 and workspace content visible | None required | Mapping pending; no whole-slice coverage claim |
| PL-QA-PROJ-001 | Create unique project with explicit scratch base; dialog closes and displayed root matches | pl-project.json schemaVersion=1, name and valid createdAt/updatedAt; both recents isolated | PL-CORE-PROJECT-001 (subset) |
| PL-QA-PROJ-002 | Open scratch project via path; close dialog and display matching root; also submit blank path and assert visible error | Existing manifest identity preserved; inspect any migration separately | PL-CORE-PROJECT-001 (subset) |
| PL-QA-PERSIST-001 | Create Docs file, edit fixed text, Save Document; dirty marker clears; restart, explicitly reopen project and document; textarea text matches | docs/<name>.md exactly matches before and after restart | PL-DOC-FILE-001/002/003, PL-DOC-EDIT-001 (subsets) |

Do not assume automatic project/document restoration. Ensure UI assertions fail
if backend succeeds but UI remains unchanged. Test implementation and fault
injection belong to Batch 2. Registry status is not runner validation evidence.

Registry source: `docs/capabilities/registry/*.json`; fields/status definitions in
`docs/capabilities/README.md`. Core project and listed Docs entries are marked
complete; missing/deferred and partial behaviors must not inflate coverage.

## Existing QA and minimum Batch 1

Root package scripts include smoke, RPC contract/execution/authorization/backend,
desktop lifecycle/security/filesystem, project persistence/recovery/indexing,
fixture roundtrip, shell accessibility/shortcuts, and diagnostics tests. Some
scripts compile into target-local .tmp directories or perform filesystem writes;
none was run during read-only discovery. No Playwright config was found in the
initial targeted file search; that is not proof of absence from every artifact.

Batch 1 recommendation: minimal TypeScript/pnpm scaffold here, draft config
validation, read-only doctor, scratch ownership/realpath guards, isolation
preflight, conflict/ownership checks and controlled launcher with bounded stop.
First resolve Node compatibility and filesystem isolation; validate Electron
sandbox/preload with an isolated runtime smoke only after containment is proven.
Test invalid targets, failure cleanup, unmarked roots, symlink escapes, port
conflicts and ambiguous ownership. Keep tests that cannot safely run BLOCKED.

## Batch handoff and validation record

Files changed in runner: `docs/batch-0-discovery.md` (replaces initial missing-target
note) and `config/example.target.json` (new). Config is a discovery template,
not a validated CLI schema or implemented feature. No Batch 1 code was created.

Commands actually used:

- `ls -la ..` and filtered `rg --files`: target now exists; scripts and source
  locations discovered. No target AGENTS.md appeared in the file search.
- `cat`, `sed -n`, `head`, `tail`, and targeted `rg -n`: inspected package and
  workspace manifests, main/preload/backend, storage/services, renderer controls,
  capability registry, architecture guidance and packaging configuration.
- `git -C ../pl-creators-suite rev-parse HEAD`: returned the hash recorded above.
- `git -C ../pl-creators-suite status --short`: returned existing dirty state
  below. Repeated at closeout to compare its status listing.
- `ls -ld` for dependencies/dist/release: all three directories exist.
- `ls -l` for root Electron/Vite shims: Electron exists, Vite absent; exit 2
  for the absent path. No attempt made to repair target dependencies.
- `node --version`, `pnpm --version`: v20.20.2 and 10.31.0.
- `ss` port inspection: insufficient permission, inconclusive.
- Filtered process-name listing: no matches, exit 1, limited visibility.
- Final JSON parse and local document-link existence checks: recorded by the
  closeout verification command. No app tests, typecheck, build, or GUI smoke run.

Existing target changes observed (not produced by this work):

```
 M apps/desktop/rpc/contracts.js
 M apps/desktop/rpc/registry.js
 M apps/desktop/services/diagnostics/index.js
 M apps/desktop/services/diagnostics/service.js
 M apps/desktop/services/operations.js
 M apps/renderer/src/App.tsx
 M apps/renderer/src/components/health/HealthContextRail.tsx
 M package.json
 M scripts/rpc-authorization-test.js
 M scripts/rpc-contract-test.js
?? apps/desktop/services/diagnostics/export.js
?? scripts/command-center-diagnostic-export-test.js
```

Verified: source integration facts and candidate selectors/schema only.
UI/backend/persistence behavior: NOT TESTED. Isolation, ownership, Playwright
compatibility, packaged binary freshness and Windows coverage: NOT VERIFIED.
Unexpected findings: target dirty baseline, additional recents/export paths,
Node version mismatch, unavailable socket ownership inspection. No unexpected
changes intentionally made. Runner Git status initially failed because its .git
metadata is not functional; no repository initialization or commit was attempted.

Owner review needed before Batch 1: accept the isolation-first implementation
scope; choose a compatible Node runtime; resolve sandbox feasibility without
privileged installs. Any Suite test-launch changes require separate approval.
Recommendation: review this report and approve Batch 1 only; no advance to Batch 2.
