# PL Beta Test Runner
## Master Development Blueprint & Codex CLI Implementation Handoff

**Praecursor Labs | Proposed internal QA utility | Revised draft v1.1 | 17 October 2026**

**Status:** Proposed; not an approved amendment to the Creators Suite roadmap.  
**Project owner:** Praecursor Labs. **Implementation mode:** standalone repository, Codex-assisted, owner-reviewed.  
**Primary platform:** Linux development machine; Windows validation before declaring cross-platform coverage.

---

## 1. Executive decision

Build a small, dependable **external QA runner** that uses the real Creators Suite user interface and validates observable results, persistence, and backend behavior. It must detect false positives such as a successful RPC response with no visible UI update. It is *not* a replacement for unit tests, security review, or manual exploratory testing. It must not delay the Creators Suite v1.3/v1.4 roadmap.

**v0.1 target:** launch the app; interact with a handful of stable controls; create/open/save/reopen a disposable project; verify UI, disk, and lifecycle behavior; produce an evidence-rich report; exit with a meaningful status code.

**Principles:** user-observable behavior is the pass criterion; deterministic before agentic; safe-by-default; versioned tests; evidence over assumptions; read-only source integration first; keep complexity proportional to immediate need.

## 2. Problem statement and success criteria

### Problem
- An RPC can succeed while the renderer fails to react, updates the wrong component, or displays stale state.
- Real development projects exercise some workflows but may never touch rarely used menus, recoverability paths, error states, settings combinations, or cross-slice handoffs.
- Manual checks are repetitive and difficult to compare between releases.
- Regression failures can remain unnoticed until a specific feature is needed months later.

### Objectives
1. Test actual user journeys through Electron windows, dialogs, menus, forms, and keyboard interaction.
2. Separately verify frontend state, backend effects, and persisted project data.
3. Bind each scenario to an expected behavior and, when available, a Creators Suite capability ID.
4. Save failure evidence (screenshot, trace, logs, expected/actual values, versions, environment).
5. Run subsets frequently and full applicable suites at development milestone gates.
6. Distinguish **PASS**, **FAIL**, **BLOCKED**, **SKIPPED**, and **NOT COVERED**; never silently treat a missing test as passed.

### Out of scope for first release
- Autonomous AI exploration, production cloud accounts, paid entitlement checks, full engine benchmarks, all six slice workflows, mobile automation, real customer data, automatic bug fixing, auto-commits to Creators Suite, or an elaborate custom GUI for the runner.
- Claiming exhaustive coverage of all possible states.

## 3. Architecture and integration boundary

```text
pl-beta-test-runner/ (independent repository)
  CLI entrypoint / scenario selection
             |
       Test orchestrator
      /       |        \
 Playwright  CLI/RPC    Fixture manager
 Electron    adapters   + isolated userData
      \       |        /
        Evidence collector
      screenshots, traces,
       structured results
             |
        HTML + JSON report
             |
       CLI exit status

Target: pl-creators-suite running from approved local build or dev entry
```

**Boundary rules**
- Initial runner repository must **not edit** Creators Suite source. It may read local build metadata and launch approved commands.
- No unrestricted shell execution derived from test scenario input. Use allowlisted runner commands and validated paths.
- Give every run its own temporary userData directory and project root; write an ownership marker; cleanup only marked paths inside the runner's designated scratch root. **This is necessary but not sufficient**: map *all* application write locations, including home-directory paths outside Electron userData, and prove they are isolated before any destructive tests.
- Never operate on real Praecursor Labs project directories, browser profiles, business accounts, or production services.
- Stop before destructive actions unless they target an explicitly marked disposable fixture.
- Use local loopback only if a test endpoint is specifically approved; don't introduce open, privileged RPC endpoints just for testing.
- Any application code changes required for stable test IDs, hooks, or launch options are proposed in a separate patch and reviewed manually before implementation.

## 4. Proposed implementation stack

| Layer | Default choice | Reason / caveat |
|---|---|---|
| Language/runtime | TypeScript on Node.js, pnpm | Fits the Electron/React/TS ecosystem and reduces integration friction |
| UI/Electron | Playwright `_electron` | Real-window interaction, assertions, screenshots/tracing; **Electron support is marked experimental** |
| Test framework | Playwright Test or an equivalent thin test orchestrator | Deterministic suites, retries (controlled), artifacts, and reports |
| CLI command execution | Node `spawn`/`execFile` with strict args | Observe exit codes and stdout/stderr; avoid shell interpolation |
| Fixtures | JSON/TS structured metadata + temporary directories | Reproducible, reviewable, safe |
| Reporting | Native Playwright HTML plus normalized custom JSON summary | Fast MVP; avoid building a dashboard immediately |
| Optional future integration | Vitest, pytest, explicit RPC adapter | Incorporate existing suite/unit/engine testing when needed |

**Confirm before coding:** target Electron version, package scripts, main entrypoint, dev-vs-packaged launch, preload constraints, CLI paths, runner permissions, current capability registry structure, and test IDs. Also verify the renderer server, app-owned RPC lifecycle, authenticated-session token handling, all port conflicts, and which exact launched process Playwright controls. Do not invent these values. Refuse ambiguous launches.

## 5. Test evidence contract: the anti-false-positive rule

A *behavioral pass* requires the relevant observable effect, not merely a command acknowledgement. Each scenario should declare its own oracles (evidence checks):

1. **Action oracle:** the actual requested user gesture or command ran.
2. **UI oracle:** a specific visible element, value, component state, focus state, or accessible status changed as expected.
3. **Backend oracle:** if applicable, authoritative RPC/service result is correct; logs are *supporting* evidence only.
4. **Persistence oracle:** a save/reload/restart proves that the correct user data was retained where applicable.
5. **Negative-path oracle:** invalid input, cancellation, timeout, and error presentation are handled visibly and safely.

**Illustrative scenario PL-QA-PROJ-001:**

- **Given** a clean disposable profile and workspace.
- **When** the tester opens New Project, enters a unique name, and clicks Create.
- **Then UI** the dialog closes and the project header displays the same name; relevant project workspace opens.
- **Then data** expected project metadata appears inside the disposable project root and agrees with the chosen name.
- **Then persistence** close and reopen: the project name/content remains correct.
- **Failure example:** `project.create` RPC logs success but header remains unchanged => **FAIL: UI contract**, even if the file exists.

Use test IDs, stable selectors/accessibility roles, explicit waits on conditions (never arbitrary sleeps as the primary synchronization method), and assert meaningful user-visible states.

## 6. Coverage model

### Coverage inventory

Each requirement entry records: `capability_id`, `slice_or_system`, `behavior`, `priority`, `test_id(s)`, `last_tested_version`, `last_result`, `evidence`, `manual_only_reason` and `status`. Source of truth for capabilities remains the Creators Suite capability registry; runner links to it, never replaces it.

**Statuses:** `PLANNED`, `IMPLEMENTED_UNVERIFIED`, `PASS`, `FAIL`, `BLOCKED`, `SKIPPED`, `DEFERRED`, `NOT_COVERED`. A skipped or absent test never increments validated coverage. **The denominator is the number of implemented, applicable behaviors in the version under test.** Report `validated_applicable / implemented_applicable` with both counts; also publish distinct functional scenario coverage, executed scenario pass rate, and automated-versus-manual coverage. A passing subset is never presented as whole-product correctness.

### Layers

| Layer | Examples | Best cadence |
|---|---|---|
| Smoke | app boot, main window, navigation, project create/open/save | every working batch / before committing a milestone |
| Functional GUI | forms, dialogs, shortcut behavior, panels, settings, selections | nightly or batch closeout |
| GUI + RPC + persistence | actual UI action produces backend and saved result | release candidate |
| Cross-slice | linked resource moves or refreshes across two or more slices | once supported, milestone gates |
| Failure/recovery | invalid input, malformed file, missing assets, extension errors, crash/restart | milestone gates |
| Engine/visual | reference output, rendering, numerical accuracy, performance baseline | v1.6 onward; separate suites |
| Cloud/entitlement | billing and collaboration sandbox scenarios | only after approved services exist |

**Prioritization:** P0 = boot/data-loss/privilege; P1 = core user workflow; P2 = auxiliary workflow; P3 = cosmetic. P0/P1 must be covered or explicitly documented as unsupported before a release gate.

## 7. Test runner CLI contract (proposed)

Illustrative commands, **not commands that already exist**:

```bash
pnpm qa list
pnpm qa doctor
pnpm qa run --suite smoke --target ../pl-creators-suite
pnpm qa run --test PL-QA-PROJ-001 --headed
pnpm qa run --suite regression --report ./artifacts
pnpm qa coverage --target-version 1.4
```

- `doctor`: validate target paths, Electron launch assumptions, environment isolation, write permissions and required dependencies without modifying target files.
- `list`: enumerate scenarios with labels, priorities, and capability IDs.
- `run`: start scoped fixtures, run tests, collect evidence, then safely terminate and clean up.
- `coverage`: report tested vs untested vs known failures **only for capabilities registered as implemented in the target build**.
- Return nonzero exit for failed test assertions, blocked infrastructure, or incomplete required gate; encode distinct reason in JSON. A skipped optional test is not a passing test.

## 8. Repository layout (proposed)

```text
pl-beta-test-runner/
  README.md
  AGENTS.md
  package.json
  pnpm-lock.yaml
  tsconfig.json
  playwright.config.ts
  config/example.target.json
  src/cli.ts
  src/config.ts
  src/target/electron-launch.ts
  src/target/target-doctor.ts
  src/fixtures/profile.ts
  src/fixtures/project.ts
  src/evidence/results.ts
  src/evidence/report.ts
  src/coverage/registry.ts
  src/suites/smoke/
  src/suites/projects/
  src/suites/settings/
  src/suites/slices/              # populated gradually
  tests/unit/
  docs/architecture.md
  docs/scenario-spec.md
  docs/runbook.md
  docs/release-checklist.md
  artifacts/                    # ignored
  .gitignore
```

Keep wrappers minimal: do not build an abstraction around Playwright until repeated use proves it's necessary. Do not store credentials, application data, recordings, or real user projects in Git.

## 9. Implementation batches and acceptance gates

### Batch 0 — Discovery and integration contract
**Objective:** inspect current Creators Suite safely and record verified integration details.  
**Deliverables:** discovery report, known scripts/entrypoints, supported Electron launch mode, UI selectors inventory, first five scenarios, target config template, persistent-state/write-path inventory, process-and-port ownership map, secret-handling policy, and isolation proposal.  
**Gate:** no guessed app paths, commands, file schemas, UI IDs, or test assumptions. Identify every persistent write location, including paths **outside** Electron `userData`. The developer’s normal projects, recents, diagnostics, settings, and business data must not be writable by destructive runner scenarios. If this cannot be proven, **block destructive GUI scenarios** and propose the smallest owner-reviewed test-launch configuration. No changes to Creators Suite in Batch 0.

### Batch 1 — Repository scaffold and safe launcher
**Objective:** initialize TS/pnpm repo, config schema, doctor, isolated scratch fixture, robust Electron launch/stop.  
**Tests:** doctor missing target, invalid path, simulated launch failure, cleanup refusal for unmarked directories.  
**Gate:** repeated start/stop works; target source unmodified; no writes outside approved isolated roots; nonzero failure codes. Runner must detect port conflicts, refuse ambiguous ownership of renderer/Electron/RPC processes, keep RPC session tokens out of logs and reports, and distinguish development-build from packaged-build runs. Verify actual Playwright/Electron compatibility with the target sandbox/preload configuration. The target app’s normal user-data, home-directory recents, diagnostics, and default project paths remain unchanged.

### Batch 2 — End-to-end smoke tests
**Objective:** implement navigation + New Project + create/save/reopen, at least one error path.  
**Tests:** prioritize `PL-QA-BOOT-001` (visible ready window), `PL-QA-NAV-001` (correct active slice), `PL-QA-PROJ-001` (disposable project UI+manifest), `PL-QA-PROJ-002` (restore project context), and `PL-QA-PERSIST-001` (save/reopen a PL Docs or Code IDE document). These are **candidates**, not claims that the needed selectors or fixtures already exist. Implement 3–5 verified feasible scenarios.  
**Gate:** tests fail when UI effect is intentionally absent even if mocked backend reports success; exact evidence retained.

### Batch 3 — Evidence and regression reports
**Objective:** HTML report, machine-readable JSON, categorized failures, screenshot on failure, trace on retry/failure, environment metadata, capability map.  
**Gate:** a third party can identify failing step, actual/expected UI behavior and reproduction command using only artifacts.

### Batch 4 — Wider functional coverage
**Objective:** settings, keyboard shortcuts, dialogs, error boundaries, project operations, CLI/RPC path checks, normal user workflows.  
**Gate:** each new feature maps to one or more capability IDs; no coverage inflation; runnable smoke subset under a practical time budget.

### Batch 5 — Heavy subsystem coverage (deferred)
**Objective:** geometry/render golden scenes, units/calculations, deterministic simulations, long-running operations, resource contention, cross-slice asset provenance, extension isolation.  
**Gate:** tests exercise user-observable behavior and independent mathematical/data oracles; recorded tolerance/platform rules.

### Batch 6 — Pre-commercial and collaboration verification (deferred)
**Objective:** sandbox cloud usage, sync/conflict/recovery, per-user access, subscriptions/extension entitlements, customer-safe failure modes.  
**Gate:** zero production billing or real customer data, explicit access boundaries, sandbox/test accounts only.

**Stop rule:** after Batch 3, the first usable release is complete. Don't let Batch 4–6 block Creators Suite development; implement only where capabilities become available.

## 10. Test reliability, platform policy and safety

- Prefer `getByRole`, `getByLabel`, stable `data-testid` only when necessary. Avoid nth-child, random class names, text that changes with copy updates.
- Test actual packaged builds periodically as well as dev builds; record which was tested. Electron Playwright APIs may behave differently with settings/fuses and require investigation.
- Never accept a passing UI snapshot alone as proof of correct calculation or saved data.
- Use deterministic fixed fixture values and unique run-specific IDs; reset state between tests.
- Handle OS-native file dialogs with explicitly approved test stubs where needed; they are not automatically intercepted by Playwright.
- Run negative/fault-injection tests against disposable projects; never corrupt actual development projects.
- Mask credentials, paths with personal information, and confidential text in reports.
- Capture display scaling, resolution, platform, Node/Electron/Playwright versions, target commit/version and build mode.
- Only regenerate screenshot baselines after manual review; don't blindly accept a changed screenshot.
- Keep security checks independent from GUI tests: successful GUI automation is not a security audit.
- A test bot cannot prove absence of bugs; treat results as bounded evidence for declared scenarios.

## 11. Agentic exploratory testing — later option, not MVP

After the deterministic suite proves reliable, an optional exploration agent can navigate the accessible UI, propose test cases for unexpected state combinations and record reproduction steps. It must operate only on a disposable test profile, use restricted actions, obey a maximum duration/step count, and require human approval before generating persistent test cases or changing production app code. Deterministic assertions remain the official release-gate evidence.

## 12. Codex CLI working agreement

This is a good contained first Codex CLI project. Use the agent as an implementer under a deliberately strict engineering contract:

1. Create a **separate Git repository** and commit a clean scaffold.
2. Copy this blueprint and `AGENTS.md` into that repository; give Codex specific **one-batch tasks**, not “build everything.”
3. For Batch 0, grant inspection-only access to the local Suite repository and require a discovery report before changes.
4. Keep tool execution and file edits within the runner workspace; require explicit approval for network actions and anything touching the Suite repository.
5. Review `git diff`, run tests, inspect artifacts, and commit only after the batch's acceptance gate passes.
6. Record what Codex actually verified versus generated but untested; keep a human-readable handoff at each stop.
7. Never let Codex silently update the official Suite blueprint or architectural contracts.

**Strict repository rule:** Codex may inspect the adjacent Creators Suite repo during discovery but **must not edit it, create branches, upgrade or install dependencies in it, or commit to it**. Any proposed test hooks or target launch flags require separate approval through the normal Creators Suite development process. End **every** batch with a handoff report listing changed files, actual commands and test results, incomplete work, unexpected changes, and owner decisions.

**Current setup reference:** official Codex CLI documentation at https://github.com/openai/codex and https://developers.openai.com/codex/ . Verify the installed CLI's available commands with `codex --help` rather than assuming older approval flags are current. Official install options include `npm install -g @openai/codex`; run `codex` and follow the authentication prompts.

### First Codex assignment — Discovery only

> Read `PL_Beta_Test_Runner_Development_Blueprint.md` and `AGENTS.md`. Our target is an adjacent Electron/React/TypeScript repository `../pl-creators-suite`. Do not edit or run destructive commands against it. Inspect the target's current package scripts, Electron entrypoints, development and packaged startup flows, tests, capability registry, available accessible selectors, and existing QA tooling. Explicitly inventory all persistent state/write paths (not merely Electron userData), renderer port 5173 and RPC port 38741 assumptions, process ownership, service duplication, token secrecy, existing-suite instance conflicts, and sandbox/preload compatibility. Refuse destructive test proposals unless isolated writes can be demonstrated. Report concrete verified facts with file paths, identify unknowns, and propose the minimum viable Batch 1 implementation. Do not implement Batch 1 until I approve your discovery report.

### Second Codex assignment — Batch 1

> Implement only Batch 1 using the approved Batch 0 discovery. Keep changes within this runner repository. Provide a `doctor` command, validated target configuration, independently verified isolation of ALL app write paths, safe port/process ownership, isolated scratch directory management with ownership markers, Electron start/stop fixture, automated tests for unsafe cleanup and invalid paths, README usage examples, and a handoff report. Run the available tests and report actual results. Do not change Creators Suite or start Batch 2.

### Third Codex assignment — Batch 2

> Implement only the approved Batch 2 scenarios using selectors and app behaviors verified in Batch 0. Include direct UI outcome assertions and, where applicable, project persistence after restart. Demonstrate that a backend-success/unchanged-UI condition fails. Capture screenshots/traces on failure. Run tests, provide a coverage list and limitations, and stop for review.

## 13. Definition of done for v0.1

**All must be true:**
- A fresh clone installs with documented commands and passes the runner's own tests.
- `doctor` clearly validates or rejects target configuration without modifying target app files.
- A disposable user profile is created and removed safely; malicious or unexpected paths are rejected.
- Real Electron GUI smoke scenarios work in an approved development environment.
- At least one real create/save/reopen workflow tests visible state and persisted data. The runner demonstrably cannot mutate the owner's normal `~/PLProjects`, `~/.plcs` recents/diagnostics, or other verified normal-state paths; otherwise destructive tests remain blocked.
- An intentionally broken UI behavior causes a reproducible failed test despite backend success.
- The results report contains expected/actual values, failing step, app version, screenshots/traces and command for reproduction.
- All unsupported or untested capabilities appear as such, not as successful.
- The Creators Suite repository has no unexpected diffs and no real project data was modified.
- Version-tagged documentation includes known limits and the next prioritized scenarios.

## 14. Release cadence and handoff

| When | Run | Required output |
|---|---|---|
| During development | Narrow smoke / recently touched behavior | Immediate regression signal |
| At batch closeout | Smoke + applicable functional suite | Failure triage and coverage delta |
| Before a beta release | Applicable regression + persistence/recovery | Versioned validation report |
| During v1.6–v1.8 engine work | Engine-specific numerical/performance suite + UI outcome checks | Benchmarks and correctness evidence |
| At v1.15 integration | End-to-end cross-slice realistic projects | Multi-slice workflow evidence |
| Commercial preparation | Sandbox cloud/entitlement suites | Safety, authorization and operational evidence |

Each handoff should include **implemented**, **tested**, **known failures**, **not covered**, **source files changed**, **commands run**, **next batch**, and **risks/decisions requiring owner approval**.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Unstable selectors and frequent UI changes | accessibility-first selectors, small reusable fixtures, versioned mapping |
| Electron automation compatibility limitations | validate launch early; packaged-build fallback; document specific unsupported paths |
| Flaky timing/render tests | condition-based waits, controlled data, failure traces, reasonable tolerance |
| False confidence from high pass counts | require capability mapping, visible effect and persistence oracles |
| Accidental source/project modifications | separate repo, read-only target access, isolated marked scratch, path allowlists |
| Scope creep into second full application | CLI first, Batch 3 stop gate, postpone agent/dashboard features |
| Agent-generated code that only appears plausible | owner review, unit tests, real app execution, evidence-based done criteria |
| Cross-platform behavior divergence | Linux-first evidence, explicit Windows verification later |

## 16. Creators Suite-specific discovery findings and regression backlog

**Current implementation observations reported in the review (verify afresh in Batch 0; do not treat as permanent contracts):**

| Component | Reported current behavior |
|---|---|
| Electron window state | `app.getPath("userData")` |
| Default projects | `~/PLProjects` |
| Recent projects | `~/.plcs/recent-projects.json` |
| Diagnostics | `~/.plcs/diagnostics` |
| RPC | App-owned local HTTP server initialized from port `38741` |
| Dev renderer | `http://localhost:5173` |
| Packaged renderer | `apps/renderer/dist/index.html` |

The review points to `apps/desktop/main.js`, `backend.js`, `services/runtime.js`, `services/projects.js`, and `storage/windowState.js`. Confirm paths and behavior in the current checkout before implementing. The application's `pnpm dev` orchestrates the workspace recursively; do **not** blindly launch duplicate services alongside `electron .`.

**Targeted scenario backlog (only implement when the target feature actually exists):**

| Target milestone | Candidate behavior |
|---|---|
| v1.3.3 | Health Center opens, refreshes, reports actual service health |
| v1.3.3 | Export Diagnostics writes disposable JSON and visibly shows location |
| v1.3.3 | Unavailable collectors show unavailable, not false success |
| v1.3.4 | Task submit/progress/completion/cancel and notification visibility |
| v1.3.5 | Search/command results reflected in the correct workspace |
| v1.3.6 | Workflow execution yields expected visible and persisted outputs |

These backlog entries are not part of v0.1 acceptance unless separately approved.

## 17. Authorities and reference documents

**Praecursor Labs internal sources:**
- *PL Creators Suite — Official Version 1 Master Development Blueprint* (canonical plan, available in Library; Notion metadata record: https://app.notion.com/p/3ce24a2d48b1814690a1ec42ed41e435).
- GitHub repository: https://github.com/barnes127/pl-creators-suite
- Architecture guardrails: https://github.com/barnes127/pl-creators-suite/blob/main/docs/architecture/ARCHITECTURE_GUARDRAILS.md
- Documentation source hierarchy: https://github.com/barnes127/pl-creators-suite/blob/main/docs/README.md

**Technology references:**
- Playwright Electron API: https://playwright.dev/docs/api/class-electron
- Official Codex CLI: https://github.com/openai/codex

**Authority note:** This document is a proposed implementation plan for a new independent test utility. Whenever actual Suite architecture or the canonical blueprint differs, verify the target and seek owner approval rather than silently changing the Suite. No code implementation or live test-run results are claimed here.
