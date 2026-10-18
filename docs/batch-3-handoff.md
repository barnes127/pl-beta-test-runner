# Batch 3 — minimal reports and v0.1 completion handoff

**Implementation complete; live report acceptance pending one owner-host run.**
The owner accepted Batch 2 on Pop!_OS with 196/196 automated tests, all five
isolated smoke scenarios PASS, `LIFECYCLE_VERIFIED`, scratch-only mutations and
matching build fingerprints. That is evidence for the previous smoke
implementation, not a live validation of the new report writer. Formal
`isolationReview` remains `PENDING`.

The local repository is the canonical
`/home/brandenbarnes/Projects/pl-beta-test-runner`, branch `main`, HEAD
`38d0ede` (Batch 1). Existing uncommitted Batch 2 files were preserved. The
adjacent disposable Suite checkout was inspected only; it already has unrelated
owner worktree changes. No Suite file, dependency, lockfile or setting was
changed. Conventional `.git` exists, but this Codex filesystem grants read-only
access to it. `git add` failed at `.git/index.lock` with **Read-only file
system**; no Git index or commit was changed. The ignored historical
`.runner-git` was not used. The requested Batch 2 checkpoint commit therefore
remains an owner-host action, not a claimed completed commit. No push was made.

## Delivered behavior

`pnpm qa run` now writes `report.json` and a self-contained `report.html` under
`artifacts/reports/<run-id>/`. The reports root is private, has an ownership
marker and refuses an unmarked directory, symlink or noncanonical path. Each
run uses a new UUID directory and exclusive writes. Relative report paths are
returned by the CLI. Reports persist outside disposable scratch, after cleanup
has been assessed. Existing unrelated `artifacts/` files are untouched.

The JSON records run ID, timestamp, runner version, validated source/asset/
desktop/snapshot digests when staging succeeded, Linux/runtime configuration,
fixed execution mode, all five scenario names/IDs/results/durations, fixed
failure code and category, shutdown/cleanup/final containment, automated
isolation proof and formal-review status. It includes a bounded trace of fixed
scenario/action/assertion outcomes and elapsed times, plus fixed reproduction
steps and `pnpm qa run`. The HTML contains the same sanitized summary with no
external assets, script, URL or dependency. Both outputs reject unknown fields
and unallowlisted data. The trace contains no selectors, DOM text, project
names/paths, content, RPC tokens, environment variables or raw app output.

Overall PASS requires a validated five-scenario PASS report with durations and
trace, validated build fingerprints, verified inner shutdown/final containment,
and verified outer process stop **and** scratch cleanup. A smoke assertion
failure after verified cleanup becomes overall FAIL. Any uncertain shutdown,
cleanup, evidence or build becomes BLOCKED. Formal isolation review stays
`PENDING` even when automated isolation is verified. Screenshot capture is
explicitly `OMITTED_CONTENT_SAFETY_UNVERIFIED`: the current runner cannot prove
arbitrary failure-window text safe to retain. No host display mount or capture
path was added.

## Validation and limits

Commands executed with Node 22.12.0 and pnpm 10.31.0: `pwd`, Git root/branch/
status/log and ignored-file inspection; read-only Suite status/source inspection;
`git diff --check`; `pnpm format`, `pnpm format:check`, `pnpm typecheck`,
`pnpm build` via `pnpm test`, focused `node --test ... tests/report.test.cjs`
and `tests/smoke.test.cjs`; `pnpm qa run --config /dev/null`; `pnpm qa run`.
Focused report tests: **5 PASS, 0 FAIL**. Full local regressions: **201 total,
200 PASS, 0 FAIL, 1 SKIP** (managed TCP restriction); build and typecheck PASS.
The safe invalid-config command produced an actual private JSON/HTML report,
overall BLOCKED/CONFIG, exit 2, and started no Suite process. The managed
default `qa run` produced an actual BLOCKED/PORT_UNAVAILABLE report, exit 3,
before Electron. That report correctly has five NOT_RUN scenarios and
shutdown/cleanup UNVERIFIED. No live screenshot, new successful smoke/report
run, or owner-host cleanup result is claimed from local mocks.

Negative tests cover malformed results, extra secret fields, forged review
approval, HTML escaping, symlinked/unmarked output roots, duplicate artifact
IDs, missing build/trace, and incomplete shutdown/cleanup. Existing smoke tests
still exercise the fixed scenarios and now confirm bounded, content-free trace
and scenario durations. No dashboard, Playwright dependency, extra scenario or
cloud service was added.

## Exact owner-host validation

Run from a normal Pop!_OS terminal. The first command is the single real
smoke/report acceptance run; it uses the approved disposable Suite checkout
and the existing runner-owned sandbox.

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

Expect **201/201 tests** on the host and five PASS scenarios with
`LIFECYCLE_VERIFIED`. The CLI prints relative JSON/HTML artifact paths. Check
both files for overall PASS, shutdown/cleanup VERIFIED, build digests and
`isolationReview:PENDING` before accepting v0.1 reporting.

The following deterministic failure test reads no Suite source, performs no
GUI mutation and starts no Electron process. Exit 2 and a BLOCKED/CONFIG
report are expected.

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm qa run --config /dev/null
```

The owner can checkpoint the working tree in the normal terminal after
reviewing `git diff --check`, `git status --short`, and the two report files.
The original Batch 2 changes and new Batch 3 changes are both present in this
worktree; select the intended hunks if separate commits are required. Exclude
ignored `.scratch/`, `artifacts/`, `dist/`, `node_modules/`, `.runner-git/`,
credentials and all Suite files. No commit or push is claimed here.

## Changed files

Batch 3 changes: `src/report.ts`, `tests/report.test.cjs`, `src/cli.ts`,
`src/launch.ts`, `src/smoke.ts`, `src/smoke-contract.ts`, `README.md`, and this
handoff. Existing uncommitted Batch 2 files remain as listed in the Batch 2
handoff. The only unexpected implementation limitation is managed `.git`
read-only access; report writing itself is tested locally. Batch 4–6 were not
started.
