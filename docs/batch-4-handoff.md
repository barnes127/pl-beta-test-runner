# Batch 4 first wave handoff — 2026-10-17

Status: **IMPLEMENTED_UNIT_VERIFIED / HOST_VALIDATION_REQUIRED**. Stop here for owner review. No Batch 5 or 6 work was started.

## Prerequisites and checkpoint

The master blueprint, `AGENTS.md`, and Batch 0–3 handoffs were reviewed before implementation. The runner was on `main` at `4af0539` with a clean worktree; the adjacent disposable Suite checkout was inspected only and had pre-existing changes. No Suite file was edited. Current committed revision `4af0539` was copied to `/tmp/pl-beta-b4-clone-SkdGz1/runner` with `git clone --local --no-hardlinks`; an offline frozen pnpm install, formatting check, typecheck, build, and tests completed there (214 pass, one managed-environment TCP skip). This proves the clean committed baseline, not the uncommitted Batch 4 work.

The disposable Suite checkout currently has pre-existing uncommitted changes, including `App.tsx` and desktop RPC files. It was never edited by this task. Those changes may make its renderer build stale; `qa doctor` must gate a live run until the owner has a fresh validated target build. The owner-host Batch 3 artifacts still verify under the current validator:

| Artifact run | Result | Evidence |
| --- | --- | --- |
| `cde34fe5-20bd-4fb3-a5da-0fc02cc0930b` | `REPORT_VERIFIED`, overall PASS | Five smoke scenarios PASS; shutdown, cleanup and final containment VERIFIED. |
| `76bc95b1-b50a-4028-a490-cd3c58485185` | `REPORT_VERIFIED`, intentional overall FAIL | Actual BOOT UI PNG CAPTURED; scenario/assertion, digest, shutdown, cleanup and final containment verified. |

These reports establish the prior host evidence. Formal `isolationReview` remains `PENDING`; build provenance remains `NOT_PROVEN`. Batch 4 has no live host result yet.

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
