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
