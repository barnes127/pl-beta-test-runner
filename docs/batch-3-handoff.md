# Batch 3 screenshot implementation — owner-host acceptance pending (2026-10-17)

## Screenshot safety-gate correction — host rerun required (2026-10-18)

The owner-host controlled run `ead1d9fa-06d9-4b96-82ac-23cab5963955`
verified 215/215 automated tests, the deliberate BOOT failure, five normal smoke passes, six Bubblewrap
stages, and shutdown/cleanup/final containment. Its report has overall FAIL,
`BOOT_EVIDENCE_PROBE_CONTEXT_MISMATCH`, screenshot
`OMITTED_SAFETY_GATE/UI_CONTENT_UNEXPECTED`, no PNG or HTML image. The existing
report remains valid and unchanged. It stored only an aggregate UI reason, so
it cannot by itself prove the exact predicate that fired.

The reviewed Suite source exposes a deterministic mismatch with that gate.
`apps/renderer/src/platform/shell/defaults.ts` sets Copilot visibility true.
`App.tsx` renders `.copilotActions input[type="checkbox"]` in that default
drawer, with `checked={allowProjectContext}` (initially false),
`disabled={!projectRoot}` (true at BOOT), and no explicit `value`. Chromium's
standard checkbox value is `on`. The old `syntheticPageCheck` inspected every
input, but its synthetic-value allowlist excluded `on`, so this benign initial
control was rejected as `UI_CONTENT_UNEXPECTED`. BOOT readiness had already
observed the single visible `No project open` subtitle. Source and a focused
DOM-contract test establish this mismatch; the old aggregate result cannot
exclude an additional host-only UI predicate failure.

The corrected policy accepts `on` **only** for that exact Copilot checkbox
while disabled and unchecked. It does not accept `on` in other inputs, checked
or enabled project-context controls, editor content, recents, dialogs, error
surfaces, arbitrary paths, token-like text, navigation or project state. The
renderer check now returns one allowlisted code for origin, unexpected surface,
empty-project state, field, recent item, summary, error or visible-text
rejection. Only these fixed codes cross the Electron boundary; raw DOM values,
URLs, paths and pixels remain private. Unknown renderer values retain the
generic `UI_CONTENT_UNEXPECTED` refusal. A before/after mismatch still omits
the image, preserving the original scenario FAIL.

Changed in this correction: `src/screenshot.ts`, `tests/screenshot.test.cjs`,
`README.md`, and this handoff. All other working-tree changes listed below
predate this correction and were preserved. No Suite files, dependencies,
leases, Git commits or remotes were changed. `pnpm format`,
`pnpm format:check`, `pnpm typecheck`, `pnpm build` and `pnpm test` passed here
with **214 pass, 0 fail, 1 skipped** (the managed TCP-bind test). The old
owner-host failure report still passes `pnpm report:verify`. Tests cover the
approved inert checkbox, enabled/checked/lookalike controls, token-looking and
personal fields, dialogs, recent projects, bad summaries, navigation, dynamic
post-capture UI changes, sanitized reason transfer, PNG digest/structure,
private file permissions, symlink/tamper refusal and JSON/HTML agreement.
These are unit and mocked-window checks; **no new live PNG has been captured**.

Host acceptance, in a normal Pop!_OS terminal:

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
pnpm report:verify artifacts/reports/<normal-run-id>/report.json
pnpm qa evidence-check
# Use the exact failure run ID printed by evidence-check:
pnpm report:verify artifacts/reports/<failure-run-id>/report.json
```

`evidence-check` must still exit 3 with overall FAIL and the fixed BOOT
reason. If the synthetic safety boundary holds, require screenshot `CAPTURED`,
a private validated PNG referenced by matching JSON/HTML, and all three final
lifecycle fields VERIFIED. If it instead omits the image, report the new fixed
reason without relaxing another gate. Inspect the actual local PNG before
acceptance; `report:verify` proves integrity and contract consistency, not
pixel-level confidentiality. A fresh-clone check for this uncommitted revision
remains host-required; the safe temporary-clone procedure is below. The prior
managed clone install failed because pnpm's default store was read-only here.
Formal isolationReview remains PENDING, provenance NOT_PROVEN, and the
behavior-level coverage denominator NOT_VERIFIED. Batch 3/v0.1 and Batch 4
remain pending owner review.

---

This section supersedes the historical review below. The owner approved a
**trusted synthetic-session boundary**, while explicitly declining any claim
that the runner can classify every pixel. The runner now has a narrowly scoped
real-window screenshot path, but no live Electron screenshot has been captured
in this managed environment. Batch 3 and v0.1 remain **pending** until the
owner validates a real image, report integrity and cleanup on Pop!_OS.

## Current repository and verified evidence

The canonical runner root is `/home/brandenbarnes/Projects/pl-beta-test-runner`,
branch `main`, HEAD `f94654d`. The current changes are uncommitted and were not
pushed. The adjacent disposable Suite checkout was inspected only; its pre-existing
owner changes remain untouched. The accepted owner-host PASS report
`64d57b95-2a1d-4947-b66e-588c29503b0c` still passes `report:verify`: five
scenarios PASS, shutdown/cleanup/final containment VERIFIED, isolationReview
PENDING and build provenance NOT_PROVEN. It is historical live evidence, not
validation of the new screenshot code. Existing unresolved scratch leases were
not deleted.

Managed validation on Node 22.12.0: `pnpm format:check`, `pnpm typecheck`,
`pnpm build`, `git diff --check` and `pnpm test` passed. The automated suite
reported **214 pass, 0 fail, 1 skipped** (215 total); the skipped case requires
a loopback bind unavailable in the managed environment. The current code's
safe `pnpm qa run --config /dev/null` returned CONFIG/BLOCKED without a Suite
launch, and its report `a1738530-b60c-4ac4-8e84-e1e7ea7bc922` passed
`report:verify`. This is an infrastructure negative case, not an image test.
The managed `pnpm qa evidence-check` returned `PORT_UNAVAILABLE/BLOCKED`
before Electron or any GUI scenario; its report
`4cc44b3a-2ee1-431e-94f2-e5e093647924` passed `report:verify` with screenshot
`OMITTED_NOT_APPLICABLE`. This restriction does not establish a Pop!_OS host
failure or a successful capture.

## Approved capture policy and implementation

The only retained screenshot presently allowed is the fixed `pnpm qa
evidence-check` negative control. After real BOOT readiness, it checks an
intentionally absent synthetic project context, records
`BOOT_EVIDENCE_PROBE_CONTEXT_MISMATCH` with observed `NOT_OBSERVED`, and leaves
the actual failed Suite UI visible for `BrowserWindow.capturePage()`. It adds
no overlay, navigation, source modification or direct backend substitute. This
probe creates no project or document. Normal smoke failures record
`OMITTED_SAFETY_GATE/CAPTURE_SCOPE_UNAPPROVED`; broader failed UI states need a
separate content review before images are retained.

Capture is refused unless the current run/permit, exact Electron and renderer
PID/start times and listeners, sole actual BrowserWindow, fixed origin,
reviewed preload and security preferences, approved staged snapshot digest,
read-only mounts, private loopback and Xvfb, unexposed host homes, empty
scratch-project root, visible initial project state and pre/post UI checks all
pass. Unexpected dialogs, editors, recents, fields, error surfaces, navigation,
visible secret-pattern text or dynamic changes cause fixed omission reasons.
These checks implement the owner's approved synthetic-session trust boundary;
they do **not** prove arbitrary pixels universally safe. The renderer URL token,
raw DOM, process environment and application output never enter the report.
The sandbox sees only its existing marked `/scratch` state. It cannot write the
final `artifacts/reports` tree, and the private Xvfb has no host display mount.

The image remains in memory in the owned Electron main process, crosses an
authenticated bounded child IPC channel to the inner supervisor, and is
materialized in a random private scratch transfer directory **only after**
verified child shutdown, port release and final containment. The outer launcher
validates the transfer, removes marked scratch after confirmed cleanup, then
writes a private PNG beside report JSON/HTML with exclusive creation. PNG
dimensions (at most 1280×800), decoded structure, encoded bytes (at most 2 MB),
SHA-256 and image identity are checked. The image is never printed, sent over
RPC/network, uploaded, or taken from the host display. A screenshot failure
cannot turn the original scenario FAIL into PASS.

Report v2 keeps the historical omission string readable and adds screenshot
contract v1 with `CAPTURED`, `OMITTED_NOT_APPLICABLE`,
`OMITTED_SAFETY_GATE` and `OMITTED_CAPTURE_FAILED`; it binds run/scenario/stage,
relative PNG name, dimensions, size, digest and fixed reason. HTML uses a local
image reference and self-only image CSP. `report:verify` rejects wrong or extra
files, symlinks, unsafe permissions/paths, malformed or mismatched PNG, forged
run/scenario/status, contradictory cleanup and HTML/JSON differences. Unit
tests cover actual PNG bytes from a fake `capturePage` window, pre/post content
changes, ownership/nonce/readiness/containment refusals, malformed transfers,
partial writes, symlink and digest attacks, and blocked shutdown. These are
mocked contract tests, **not** a live Electron capture.

## Blueprint §§5, 6, 9 and 13 requirement matrix

| Requirement | Classification | Evidence / gate |
|---|---|---|
| §5 action, expected/actual UI and persistence oracles; negative path | IMPLEMENTED_AND_HOST_VERIFIED | Prior five live smoke PASS and duplicate-project negative case; deterministic BOOT failure remains host-pending |
| §5 screenshot, bounded trace, reproduction, fixed reason/category | IMPLEMENTED_UNIT_VERIFIED | Contract and report tests pass; actual image and full failure artifact HOST_VALIDATION_REQUIRED |
| §5 no false PASS for backend success/unchanged UI | IMPLEMENTED_UNIT_VERIFIED | Controlled mocked UI mismatch fails; no Suite defect injected |
| §6 authoritative capability IDs, untested/unsupported accounting | IMPLEMENTED_AND_HOST_VERIFIED | Prior report registry 329 entries: 44 complete, 50 partial, 235 missing; BOOT/NAV/Code mappings, two project tests UNMAPPED |
| §6 whole-product applicable behavior denominator/manual coverage | BLOCKED | Registry has no authoritative per-build applicability/priority/manual completion; denominator NOT_VERIFIED |
| §9 JSON/HTML, failure categories, fingerprints, environment, coverage | IMPLEMENTED_AND_HOST_VERIFIED | Prior accepted PASS report and verifier; new screenshot schema unit-verified |
| §9 actual failed Suite UI image and third-party failure review | IMPLEMENTED_UNIT_VERIFIED | Real-window capture wired; owner-host failure run/image verification pending |
| §13 fresh-clone install/build/tests | IMPLEMENTED_UNIT_VERIFIED | Prior offline clone check predates this patch; repeat below on host |
| §13 doctor, six-stage isolation, scratch-only GUI, cleanup | IMPLEMENTED_AND_HOST_VERIFIED | Prior owner-host PASS; current screenshot path host-pending |
| §13 five real Electron interactions and UI/disk assertions | IMPLEMENTED_AND_HOST_VERIFIED | Prior owner-host five PASS |
| §13 failure screenshot, traces, command, cleanup | IMPLEMENTED_UNIT_VERIFIED | Mock report verifies; live controlled failure pending |
| §13 no unexpected Suite changes, no real-project/profile access | IMPLEMENTED_UNIT_VERIFIED | This turn read Suite only; prior host isolation PASS; current host audit pending |
| §13 version-tagged documentation and known limits | IMPLEMENTED_UNIT_VERIFIED | README and this handoff updated; owner review pending |
| Retry trace | NOT_APPLICABLE | Fixed suite has no retry mechanism |

The 329 registry entries are capability inventory, not a behavior-level
denominator. Four capability entries have a linked validated smoke behavior;
five passing tests do not imply whole-product coverage. Formal isolationReview
remains PENDING and build provenance remains NOT_PROVEN.

## Pop!_OS acceptance commands

Run only in the approved runner checkout with Node 22.12.0, pnpm 10.31.0 and
the disposable adjacent Suite checkout. Do not use an unresolved lease or
change Suite source. These commands do not change host security settings:

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm install --frozen-lockfile --ignore-scripts
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run
```

Copy the run ID from the returned report path and verify it:

```bash
pnpm report:verify artifacts/reports/<run-id>/report.json
```

The controlled failure uses the same isolation and owned Electron session. It
is expected to exit 3 with overall FAIL, BOOT as the sole failed scenario,
`BOOT_EVIDENCE_PROBE_CONTEXT_MISMATCH`, verified shutdown/cleanup/final
containment, and screenshot `CAPTURED` with a private PNG. An omission is a
safe result but leaves the screenshot acceptance gate open:

```bash
pnpm qa evidence-check
pnpm report:verify artifacts/reports/<failure-run-id>/report.json
```

Inspect the generated local HTML/PNG with the owner before accepting image
content. Confirm it depicts the actual unchanged Suite window and the JSON
failed step/expected/actual/reproduction agree. A reviewer needs only these
artifacts and the fixed command. Fresh-clone validation can use a separate
temporary local clone plus this uncommitted patch. It never copies scratch,
reports or Suite files. Run from the runner root after the commands above,
preserving the temporary directory for review if anything fails:

```bash
cd ~/Projects/pl-beta-test-runner
review_dir=$(mktemp -d)
git clone --local --no-hardlinks . "$review_dir/runner"
git diff --binary HEAD | git -C "$review_dir/runner" apply -
cp src/screenshot.ts "$review_dir/runner/src/screenshot.ts"
cp tests/screenshot.test.cjs "$review_dir/runner/tests/screenshot.test.cjs"
cd "$review_dir/runner"
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm format:check
pnpm typecheck
pnpm test
```

An offline install may need a populated pnpm store. Record that separately
rather than silently fetching packages or changing the Suite. A fresh clone
of remote `main` alone cannot test these uncommitted changes.
The managed fresh-clone attempt reached `pnpm install --offline` but stopped
with `EROFS` while pnpm tried to register the temporary project in its
read-only global store. The copied runner source remains under `/tmp`; no
Suite files or package store were modified. Fresh-clone install/build/test
therefore remains HOST_VALIDATION_REQUIRED for this patch.

Changed runner files: `src/screenshot.ts`, `src/electron-entry.ts`,
`src/sandbox-session.ts`, `src/processes.ts`, `src/launch.ts`, `src/cli.ts`,
`src/smoke.ts`, `src/smoke-contract.ts`, `src/lifecycle-diagnostics.ts`,
`src/report.ts`, `tests/screenshot.test.cjs`, `tests/smoke.test.cjs`,
`tests/launcher-static.test.cjs`, `tests/report.test.cjs`, `README.md`, and
this handoff. No dependencies, Suite files, commits, pushes or leases changed.
The next owner decision is acceptance of the actual host failure image and
report, or a documented blueprint amendment if the host safety gate omits it.

---

# Historical screenshot-boundary review — superseded by owner policy above

**Decision:** The owner requires an actual image of the failed Creators Suite UI.
No such image was captured or retained. The present runner cannot demonstrate a
content-safe frame for this application, so `evidence.screenshot` remains
`OMITTED_CONTENT_SAFETY_UNVERIFIED` and **Batch 3 / v0.1 is not accepted**. A
synthetic failure card is not being substituted. The existing five-scenario
smoke suite, report v2 and owner-host results remain intact. No Batch 4–6 work.

## Repository and accepted baseline

Before editing, `pwd` and `git rev-parse --show-toplevel` both returned
`/home/brandenbarnes/Projects/pl-beta-test-runner`; branch `main`, HEAD
`f94654d` (`Expand Batch 3 evidence reporting and capability coverage`), and
`git status --short` was empty. This is newer than the request's historical
`9ef3527` checkpoint. The canonical disposable target is the adjacent
`/home/brandenbarnes/Projects/pl-creators-suite`, inspected read-only. Its
worktree already contains unrelated owner changes, including renderer and RPC
files; their content was not copied into this report or edited here. The runner
worktree had no uncommitted changes to discard.

The owner's accepted live report is
`artifacts/reports/64d57b95-2a1d-4947-b66e-588c29503b0c/`: version 2,
overall PASS, all five scenarios PASS (77, 79, 762, 909, 608 ms), shutdown,
cleanup and final containment VERIFIED, automated isolation RUNTIME_VERIFIED,
formal review PENDING, provenance NOT_PROVEN. The four app-build digests match
the previous accepted cycles. `pnpm report:verify` returned REPORT_VERIFIED for
this report; its HTML has the same outcome, a no-external-assets CSP and the
explicit screenshot omission. This is owner-host execution evidence for the
prior code, not a live test of this review's changes.

## Real-window screenshot threat model and failed safety proof

Installed Electron is **41.10.6**. Its local declarations provide public
`BrowserWindow.capturePage(rect?, opts?)` and `webContents.capturePage`; a
capture would have to run in `src/electron-entry.ts` after the actual Suite
window, nonce-bound smoke permit, reviewed staged preload/snapshot, effective
preferences and fixed renderer origin pass. That is the only process with the
owned BrowserWindow. `/scratch` is the only guest-writable mount and maps to
the marked run's `state` directory; `artifacts/reports` is outside Bubblewrap.
Therefore an image would have to cross the existing inner-result boundary and
be retained before verified scratch cleanup. No screenshot path is currently
passed through that boundary, and no host display mount is present.

The actual renderer can put arbitrary bytes into pixels: the Code IDE
`textarea.codeEditor` displays editable document content; `App.tsx` renders
project roots, recent names/paths, status and error messages; Open Project has
a literal personal-home path placeholder; modal/error surfaces and other
workspace panels can cover the viewport. Static imagery, CSS effects and
offscreen/overlay content must also be considered. A private Xvfb display
prevents capture of the **host desktop**, but does not certify these Suite
pixels. A synthetic token-looking string or secret-pattern document could be
visible in an editor or error at the instant of failure. Normal fixtures are
synthetic, but failed or unclassified UI state is precisely when assumptions
about what is visible are weakest. The RPC token is in the renderer URL query;
the runner does not display or log it, but cannot infer from that alone that no
unexpected UI surface will show it.

The existing page checks observe booleans, not a complete visible-pixel
inventory. A before/after DOM scan would miss CSS-generated content, canvas or
image pixels and could race a React update or overlay between scan and
`capturePage`. Electron's API returns a compositor image; it does not bind the
frame atomically to the inspected DOM state. A crop is safe only if every pixel
in that exact rectangle has independently reviewed provenance, including
overlays. The current Suite source and runner do not provide that guarantee for
the failed states of all five scenarios. OCR, secret regexes and checking just
the fixture strings would leave unknown pixels unclassified. **The proposed
capture eligibility test therefore fails at content provenance, before any
capture or artifact write.** Wrong window, nonce, origin, timing, dimensions,
size and path guards cannot repair that missing proof.

The fail-closed policy is to retain no image while content provenance is
unverified. Report v2 already allows only the fixed omission status; it rejects
image references, arbitrary metadata, traversal and forged success. A new
adversarial report test exercises wrong-window/expired-nonce/unverified-source
claims, oversized/dimension claims, synthetic token-looking data, traversal,
partial files and a symlink. These tests verify **refusal**, not real-window
capture. An image's existence cannot make a failed scenario pass. No capture
API was called, image file created, privacy scan claimed or screenshot acceptance
fabricated. No new security boundary was activated.

**Concrete next design for separate review:** define one or more exact
failure-state/rectangle pairs in a reviewed Suite snapshot, with a source-level
inventory of every renderable child, pseudo-element, image and overlay in that
rectangle; reject any editor, recent list, dialog, project path, status/error,
external content or unknown layer intersecting it. Bind the exact owned
BrowserWindow, nonce, origin and immutable snapshot to a compositor capture
made before shutdown, and prove with adversarial frames that dynamic updates
cannot insert unclassified pixels between eligibility and capture. Only then
validate dimensions/PNG bytes, pass through a nonce-bound bounded inner result,
and exclusively write a private image under the marked report directory before
scratch cleanup. The verifier must check the image hash, run/scenario identity,
regular-file ownership and HTML reference. A narrow crop may not depict every
failure usefully; failures without a proven region must continue to omit the
image. If the needed atomic provenance cannot be achieved without a Suite test
hook, propose that Suite change separately for owner approval. Owner approval
to explore screenshots does not approve this unproven retention boundary.

## Independent report and coverage inspection

The accepted PASS JSON/HTML agree on overall/scenarios, no failed step,
shutdown/cleanup/final containment, fingerprints, review PENDING and screenshot
omission. The safe controlled infrastructure failure `pnpm qa run --config
/dev/null` (Node 22.12.0) produced a new report at
`artifacts/reports/b3ebb14d-b66f-4a90-9edc-c4a57cb66738/`: overall BLOCKED,
CONFIG/CONFIGURATION, zero executed scenarios, unverified lifecycle, and no
image. `pnpm report:verify` returned REPORT_VERIFIED for it. This launches no
Suite process and is **not** an actual failed-UI demonstration. The existing
controlled mock persistence failure still generates a FAIL report with
`PERSIST_SAVED_BYTES_MISMATCH`, expected `EXACT_FIXTURE_BYTES`, actual
`NOT_OBSERVED`, reproduction `pnpm qa run`, and verified mocked cleanup; it is
not a live Electron failure. A reviewer can diagnose these records using their
artifacts, but the blueprint's actual failed-UI screenshot remains absent.

The authoritative checkout registry currently reports 329 entries: 44
`complete`, 50 `partial`, 235 `missing`, none blocked/deferred. The live report
maps BOOT/NAV to `PL-CORE-SHELL-001` and PERSIST to
`PL-CODE-FILE-001/002/003`; both project scenarios are `UNMAPPED`. Four
capability entries have at least one validated smoke behavior, 90 implemented
entries have no validated behavior, and 235 missing entries are unsupported.
Five of five executed smoke scenarios passed; this is **not** whole-product
coverage. Registry metadata cannot establish per-build implemented/applicable
behavior counts, priority, manual completion or version history, so the
denominator, build binding and manual coverage remain NOT_VERIFIED/NOT_PROVEN.

## Blueprint §9 and §13 acceptance matrix

| Requirement | Classification | Evidence or remaining gate |
|---|---|---|
| §9 JSON, self-contained HTML, categorized failures, environment | IMPLEMENTED_AND_HOST_VERIFIED | Accepted v2 PASS report and `report:verify` |
| §9 bounded trace of actions and observations on failure | IMPLEMENTED_UNIT_VERIFIED | Controlled mock failure; live failure not yet demonstrated |
| §9 capability map without inflated coverage | IMPLEMENTED_AND_HOST_VERIFIED | Live report registry inventory and explicit UNMAPPED/denominator limit |
| §9 actual failed-Suite-UI screenshot | BLOCKED | Pixel content provenance and atomic capture boundary unproven; capture disabled |
| §9 third-party failed-step/expected/actual/reproduction from artifacts | IMPLEMENTED_UNIT_VERIFIED | Mocked UI failure report; live failing Suite artifact pending |
| §13 fresh clone installs and passes tests | IMPLEMENTED_UNIT_VERIFIED | Prior separate `/tmp` offline clone of `9ef3527` plus then-current patch passed; repeat for this HEAD on host |
| §13 doctor validates/rejects without Suite writes | IMPLEMENTED_AND_HOST_VERIFIED | Owner doctor CHECKS_PASSED; managed environment cannot bind ports |
| §13 disposable profile, path rejection and safe cleanup | IMPLEMENTED_AND_HOST_VERIFIED | Owner isolated lifecycle and final cleanup VERIFIED; negative tests retained |
| §13 real Electron GUI smoke and create/save/reopen UI + disk | IMPLEMENTED_AND_HOST_VERIFIED | Five owner-host scenarios PASS; scratch-only mutations |
| §13 no normal project/profile writes | IMPLEMENTED_AND_HOST_VERIFIED | Owner-host Bubblewrap proof and final containment; formal isolation review PENDING |
| §13 backend-success/unchanged-UI must FAIL | IMPLEMENTED_UNIT_VERIFIED | Controlled mock, not a live injected Suite defect |
| §13 failing step, expected/actual, version, trace, command | IMPLEMENTED_UNIT_VERIFIED | Mock failure report plus live PASS report; live UI-failure artifact pending |
| §13 screenshot of failed UI | BLOCKED | Same content-safety gate as §9 |
| §13 unsupported/untested capabilities truthful | IMPLEMENTED_AND_HOST_VERIFIED | Live registry inventory; applicability denominator NOT_VERIFIED |
| §13 no unexpected Suite diff or real-project mutation | IMPLEMENTED_UNIT_VERIFIED | This turn only read Suite; pre-existing owner diffs remain, no full host write audit here |
| §13 version-tagged docs and known limits | IMPLEMENTED_UNIT_VERIFIED | README and Batch 3 handoff updated; owner review pending |
| Retry trace where no retry exists | NOT_APPLICABLE | Fixed suite has no retry mechanism; failure trace is retained |

## Commands, files and host acceptance gate

This managed turn used Node 22.12.0 for the runner tests. `pnpm test` returned
**207 total, 206 PASS, 0 FAIL, 1 SKIP**; the skip is the existing live
TCP-port test denied in this execution environment. Build passed as part of
that command. `pnpm report:verify` passed for the accepted host PASS report and
new deterministic CONFIG/BLOCKED report. An initial no-prefix `pnpm qa run
--config /dev/null` used the shell's Node 20 and correctly returned RUNTIME;
rerunning under Node 22 produced the intended safe CONFIG report. No live
Electron run occurred here. `pnpm format:check`, `pnpm typecheck`, `pnpm build`
and `git diff --check` all exited 0 after the final edits.

Files changed in this pass: `tests/report.test.cjs`, `README.md`, and this
handoff. No runner dependencies, lockfile, Suite files, host settings, leases,
existing accepted report or Git history changed. The new CONFIG report is an
expected ignored artifact. Existing unresolved scratch leases were not read,
deleted or reused. The unexpected shell-default Node 20 is recorded above.

Normal-host review commands, with other Suite instances stopped and existing
leases preserved:

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
pnpm report:verify artifacts/reports/<run-id>/report.json
```

Safe controlled failure and refusal checks (no Suite launch):

```bash
pnpm qa run --config /dev/null
# Expected exit 2; verify the exact report path printed by that command.
pnpm report:verify artifacts/reports/<blocked-run-id>/report.json
node --test --experimental-test-isolation=none --test-name-pattern='controlled persistence mismatch|unverified screenshot claims' tests/report.test.cjs
```

For a fresh-clone check of the **current uncommitted patch**, from the runner
root use a private directory and apply only tracked changes to the clone:

```bash
fresh_dir=$(mktemp -d /tmp/pl-beta-fresh-XXXXXX)
git diff --binary > "$fresh_dir/runner.patch"
git clone --local --no-hardlinks . "$fresh_dir/checkout"
git -C "$fresh_dir/checkout" apply "$fresh_dir/runner.patch"
cd "$fresh_dir/checkout"
nvm use 22.12.0
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
```

This requires the packages to be available in pnpm's offline store; if they
are not, report the clone check as blocked rather than silently fetching. It does
not copy `.scratch` or `artifacts`. The host must still validate this revision.
**There is no legitimate screenshot-acceptance command yet:**
`report:verify` currently proves omission, not a captured image. Owner review
is required for a content-safe actual-UI capture design, a live failed-UI
demonstration and the resulting report/image verification before Batch 3 can
be accepted. Formal isolation review stays PENDING and build provenance stays
NOT_PROVEN. Stop here; no commit or push.

---

# Batch 3 completion review — v0.1 candidate, acceptance pending

The owner has **not** accepted Batch 3. The last owner-host acceptance evidence
belongs to checkpoint `9ef3527` on `main`: 201/201 regressions, five live smoke
PASS results, `LIFECYCLE_VERIFIED`, scratch-only mutations, and JSON/HTML
artifacts. Formal `isolationReview` is `PENDING`; renderer build provenance is
`NOT_PROVEN`. This revision changes the report contract to version 2 and has
**not** had a live Electron run on the owner's Pop!_OS host. Batch 4 was not
started.

The runner root is `/home/brandenbarnes/Projects/pl-beta-test-runner`. The
adjacent `/home/brandenbarnes/Projects/pl-creators-suite` checkout was read
only. It already contained unrelated owner worktree changes when inspected;
this work made no Suite, dependency, lockfile, Git, or host-security change.
No commit or push was made.

## Audit of the newest successful Batch 3 artifact

The newest successful artifact inspected was
`artifacts/reports/ee265ad8-1530-421e-9464-f94d591ade8e/report.json`
and its sibling `report.html`, written 2026-10-18 02:52:17 UTC. Both were
inspected as contents, not inferred from existence. JSON version 1 reports
overall PASS, five scenario PASS results (75, 81, 725, 854, 676 ms),
shutdown/cleanup/final containment VERIFIED, Electron 41.10.6, four build
digests, automated isolation `RUNTIME_VERIFIED`, formal review `PENDING`,
and provenance `NOT_PROVEN`. The report file and directory are private
(0600/0700). The HTML repeats those statuses and has a no-external-assets CSP.

| Blueprint or agent requirement | Existing successful artifact | This revision / remaining gate |
|---|---|---|
| §5 action oracle | Generic `ACTION/PASS` events; no action identity | Fixed target and `ACTION_DISPATCHED` with actual observed/unobserved/unverified outcome from the executed UI operation. Host proof pending. |
| §5 visible UI oracle | Five live scenarios passed, but report events only said `ASSERTION/PASS` | Fixed UI target, expected state and typed actual result from each visibility/value check. A missing result fails. Host proof pending. |
| §5 backend oracle where applicable | No direct RPC-result assertion in the report | Project manifest and Code IDE file bytes remain independent scratch backend/persistence effects. Direct RPC result is **not claimed** as a separate oracle. |
| §5 persistence oracle | Smoke tests checked save/reopen; report did not identify the byte checks | Trace records exact-fixture-byte comparisons without retaining the bytes; reopen is still verified through UI and scratch. |
| §5 negative path | Duplicate project rejection was exercised; report lacked its individual checks | Visible error, unchanged manifest and unchanged directory count get separate typed observations. |
| §6 registry source of truth | No capability inventory or mapping | Reads canonical Suite `docs/capabilities/registry/*.json` read-only before and after run, rejects symlinks, duplicates, unknown statuses and changes. Reports registry digest and every bounded ID/status/coverage result. Live binding to the exact staged app snapshot remains `NOT_PROVEN` because registry docs are outside the runtime snapshot. |
| §6 mapped scenario IDs | No mapping | BOOT/NAV link to `PL-CORE-SHELL-001`; PERSIST links to `PL-CODE-FILE-001/002/003`. PROJ-001/002 are `UNMAPPED`: `PL-CORE-PROJECT-001` is a broader versioned project-contract requirement, not a verified ID for these complete UI journeys. |
| §6 status and denominator | Five PASS could be mistaken for whole-product coverage | Registry currently has 329 entries: 44 complete, 50 partial, 235 missing. Report distinguishes validated **behaviors**, untested/unsupported capability entries, failed/blocked/skipped scenarios and automated/manual status. The implemented-applicable **behavior** denominator is `NOT_VERIFIED`: the registry does not enumerate applicable behaviors per build, and 94 implemented capability entries are not a defensible behavior denominator. No whole-product ratio is published. |
| §6 inventory fields | Entire inventory absent | New inventory has ID, registry status, linked test IDs and runner coverage state. Per-capability behavior granularity, priority, version applicability, manual-only reason and last-tested history remain **not verified**; copying unreviewed descriptions or inventing these fields would overstate coverage. |
| §9 JSON/HTML/categorized failures | Present and host-demonstrated | Version 2 retains these and adds app version, typed evidence, registry coverage, configured display resolution, unverified scale, and explicit automation mode. New schema has only local/mock validation so far. |
| §9 screenshot on failure | `OMITTED_CONTENT_SAFETY_UNVERIFIED` | **BLOCKED.** See capture boundary below. No screenshot was taken or inserted into evidence. |
| §9 trace on retry/failure | Bounded generic trace; no retries | Bounded fixed-code trace is kept on every run, including failure. The runner has no retry mechanism, so retry traces are not applicable. |
| §9 third-party diagnosis | Reproduction command and reason, but no failing step expected/actual | Version 2 report and `pnpm report:verify` expose scenario, fixed reason/category, failed step, expected/actual observation, environment, fingerprints and lifecycle. A controlled fixture demonstrates review using generated files alone; live failure review pending. |
| §13 fresh clone | No prior separate-environment proof in the v1 artifact | A local clone at `9ef3527` with this uncommitted patch overlaid installed offline and ran formatting/typecheck/build/tests in `/tmp`; see commands/results below. Host clean-install acceptance pending. |
| §13 doctor/isolation/scratch safety | Host baseline verified; report lists lifecycle | No safety boundary was changed. The managed doctor still cannot check ports; managed isolation generated a retained lease and did **not** pass. Earlier owner-host proofs apply only to the prior checkpoint. |
| §13 intentionally broken UI despite backend success | No failure artifact in successful report | Controlled mock sets backend-created project state while leaving visible header wrong; `PL-QA-PROJ-001` fails `PROJ_CONTEXT_NOT_UPDATED` with `NOT_OBSERVED`. This is a mock contract demonstration, not a live injected Suite defect. |
| §13 result evidence and unsupported capabilities | Missing expected/actual, screenshots, coverage | Expected/actual and registry inventory are implemented; screenshot and per-build applicable behavior denominator remain blocked. Therefore **v0.1 definition of done is not met**. |
| AGENTS.md privacy, source and cleanup | Old artifact contained no raw app output; Suite unchanged | Version 2 validator rejects extra fields, unknown strings, forged approval, screenshot paths and unsafe report paths. Scratch and process ownership remain unchanged. Retained leases were not deleted. |

The old successful report remains a valid historical v1 artifact. The new
`report:verify` command requires v2 and is intentionally expected to reject
that old report rather than silently upgrade or reinterpret its missing fields.

## Screenshot boundary and decision needed

The Suite renderer can display a project root in its workspace subtitle,
arbitrary error text in `.errorBox`, and editable Code IDE content in
`textarea.codeEditor` (`apps/renderer/src/App.tsx` and
`components/workspaces/CodeWorkspace.tsx`). `capturePage()` would copy pixels,
not typed DOM fields, so the current report validator cannot prove that an
actual failure frame contains only synthetic fixture content. Bubblewrap and
private Xvfb prevent host-desktop capture, but do not classify pixels inside
the Suite window. This is the precise reason screenshot remains
`OMITTED_CONTENT_SAFETY_UNVERIFIED`; enabling raw capture would change the
evidence boundary without proof.

The smallest proposed capture design requires a separate owner decision:
after a failure, revalidate the exact owned BrowserWindow, nonce, snapshot and
private display; render an opaque, fixed-code synthetic failure card covering
the entire viewport inside that private window; verify the card's bounds and
paint, then capture only that card to a private, marked report artifact. An
adversarial fixture must place known secret-pattern pixels beneath/around the
card and prove none appear in the saved image. Any failed window/bounds/paint,
image-size or ownership check omits the image. Such a picture would document
the sanitized failure state, **not** the raw failed UI. Capturing the raw Suite
UI would require a different reviewed redaction policy. No capture code or
mount relaxation was enabled in this revision. Owner approval of the capture
boundary is required before implementation.

## Implementation and verification

`src/smoke.ts` now records fixed targets, expected conditions and actual
observations from the same UI checks that decide PASS/FAIL. Disk oracles record
typed comparisons. A final fixed reason event identifies stage failures even
when the underlying inspection was unavailable; it reports `UNVERIFIED` in
that case rather than inventing an observed value. `src/smoke-contract.ts`
allowlists every emitted field. `src/coverage.ts` reads the Suite registry
without copying free-form descriptions, reports all 329 IDs, and separates
registry implementation status from runner-validated behavior. `src/report.ts`
validates v2 JSON, renders escaped self-contained HTML, and verifies report
ownership plus exact HTML/JSON correspondence. `scripts/review-report.cjs`
prints only sanitized review fields.

Commands executed in this managed workspace (Node 22.12.0, pnpm 10.31.0):

```text
pwd; git rev-parse --show-toplevel; git status --short; git branch --show-current; git log -1 --oneline
read AGENTS.md and all 344 blueprint lines; inspect newest successful JSON/HTML
read-only Suite registry and renderer-source inspection; git -C ../pl-creators-suite status --short
pnpm format; pnpm format:check; pnpm typecheck; pnpm build; pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run --config /dev/null
pnpm report:verify artifacts/reports/629edfea-515d-4f08-9e47-2db3153c0790/report.json
```

The final full local regression run had **206
tests: 205 PASS, 0 FAIL, 1 SKIP**. The skipped port-conflict test is the
existing managed-environment TCP-bind limitation. Formatting, typecheck and
build passed. The read-only `doctor` returned `PORT_UNAVAILABLE` here. The
managed `isolation-check` returned `OWNERSHIP` and retained a new marked lease
at `.scratch/run-k1lw0f`; the older `.scratch/run-R8Cads` lease also remains.
Neither was deleted. The underlying namespace failure was not established by
that masked result, so no host conclusion is drawn from it. The safe invalid
config command returned exit 2, `BLOCKED/CONFIG`, created no target process,
and produced a v2 report. `report:verify` checked its schema, private file
ownership and exact HTML content: `REPORT_VERIFIED`, overall BLOCKED.

A separate `/tmp/pl-beta-fresh-ZRgibh/checkout` clone of `9ef3527` with this
uncommitted working patch overlaid installed with
`pnpm --store-dir /tmp/pl-beta-fresh-ZRgibh/store install --offline
--frozen-lockfile --ignore-scripts` and passed format check, typecheck, build
and the same 205 PASS / 1 SKIP test run. An initial install attempt using the
default pnpm store failed `EROFS` when pnpm tried to register the `/tmp` clone
under the read-only host store. Copying the cached store into `/tmp` resolved
that environment restriction; no network or Suite installation was used.
That clone check is a **separate-environment local verification**, not an
owner-host live smoke result. The final revised source was copied into the
clone and the format/typecheck/build/test sequence was repeated with the
same result. The owner must still validate the live v2 report on the host.

Focused negative tests cover malformed v2 results, forged coverage or formal
review state, injected secret fields, HTML escaping, unmarked/symlinked report
paths, HTML tampering, failed cleanup, registry duplicates/symlinks, and
backend-success/unchanged-UI false positives. A controlled persistence-failure
test writes JSON/HTML in a private temporary runner fixture, then reviews the
files without reading the mock's internal state; the reviewer obtains scenario
ID, `PERSIST_SAVED_BYTES_MISMATCH`, `EXACT_FIXTURE_BYTES`, `NOT_OBSERVED`,
verified cleanup and reproduction command. This demonstrates report mechanics
only; no new live Suite failure has been observed.

## Report review and owner-host gate

From a normal Pop!_OS terminal, with the disposable Suite checkout and no
unresolved process ownership, run:

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm install --frozen-lockfile --ignore-scripts
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa run
# Use the exact relative JSON path printed by qa run:
pnpm report:verify artifacts/reports/<run-id>/report.json
```

Review the same run's JSON and HTML. Require five scenario PASS results,
overall PASS, `shutdown/cleanup/finalContainment: VERIFIED`, fixed UI and
scratch observations in the trace, the expected registry digest/mappings,
`isolationReview:PENDING`, `provenance:NOT_PROVEN`, and no screenshot claim.
The report verifier requires both files to match and checks private ownership.
Do not treat a PASS smoke subset as whole-product coverage. A safe deterministic
infrastructure-failure report, with no Suite launch, is obtained by:

```bash
pnpm qa run --config /dev/null
# Exit 2 is expected. Review the relative report.json path printed above:
pnpm report:verify artifacts/reports/<blocked-run-id>/report.json
```

The owner may also run `node --test --experimental-test-isolation=none
--test-name-pattern='mocked backend success|controlled persistence mismatch'
tests/smoke.test.cjs tests/report.test.cjs` after `pnpm build` to repeat the
controlled failure demonstrations. They do not mutate Suite and do not count
as live acceptance. Do not run a live GUI failure injection against Suite.

## Changed files, limits and owner decisions

Changed runner files: `src/cli.ts`, `src/launch.ts`, `src/report.ts`,
`src/smoke.ts`, `src/smoke-contract.ts`, new `src/coverage.ts`,
`scripts/review-report.cjs`, `tests/report.test.cjs`, `tests/smoke.test.cjs`,
new `tests/coverage.test.cjs`, `package.json`, `README.md`, and this handoff.
Generated `dist/`, `artifacts/` and `.scratch/` remain ignored. The new
retained lease from the managed isolation check is the only unexpected scratch
change; it is preserved for owner review. No Git changes were authorized in
Suite; no runner commit or push was made.

Remaining gates: owner-host v2 smoke/report verification; owner review of the
two retained leases; formal isolation review if the owner wants that status to
change; a proved build-provenance mechanism if desired; the registry's missing
behavior-applicability/priority metadata; and an owner-approved screenshot
capture boundary. **Batch 3 and v0.1 remain pending while the blueprint's
screenshot and complete evidence requirements are blocked.** Continue Suite
development only after the owner decides how to handle this acceptance gap;
do not begin Batch 4 in the runner.
