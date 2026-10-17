# Agent instructions — PL Beta Test Runner

## Mission
Implement a safe, standalone deterministic QA harness for PL Creators Suite. Read `PL_Beta_Test_Runner_Development_Blueprint.md` first. Work one approved implementation batch at a time.

## Non-negotiable boundaries
- The adjacent `pl-creators-suite` repository is **inspection-only**. Do NOT modify it, create branches, install/upgrade packages in it, commit to it, or create hooks there. Any requested change requires separate owner approval and the normal Suite development process.
- NEVER operate on the owner's real project folders, production accounts, production billing, or persistent user profiles.
- Electron `userData` isolation alone is NOT enough. Inventory and prove isolation for all write paths including `~/PLProjects`, `~/.plcs/recent-projects.json`, and `~/.plcs/diagnostics` (reported locations to reverify). Refuse destructive GUI scenarios until safe isolation is demonstrated.
- Detect existing Suite processes and port conflicts; prove ownership of the renderer, Electron, and app RPC processes. Do not leak auth/session tokens into evidence. Refuse ambiguous launches.
- Use dedicated temporary, runner-owned fixture directories. Do not delete directories without the runner's ownership marker and allowlisted scratch root.
- Do NOT install broad system dependencies or use privileged/root operations without approval.
- No secrets in Git, logs, screenshots, reports, or test fixtures.
- Do not introduce a remotely accessible RPC testing endpoint.
- UI actions must be asserted with visible state and, where appropriate, persistence oracles. An RPC success alone is never a behavioral pass.
- Avoid unnecessary abstractions and dependencies; prefer minimal TypeScript and existing tools.

## Engineering workflow
1. State the batch, files to inspect, and acceptance gate.
2. Discover and cite actual repository paths/scripts before assuming how Electron launches.
3. Implement only approved scope.
4. Run formatting/typecheck/tests and, when possible, real GUI smoke tests.
5. Review diffs, list all changed files, and distinguish verified results from untested changes.
6. Write a batch handoff stating built features, tests actually run/results, unfinished work, **all unexpected changes**, and owner decisions.
7. Stop and hand off rather than continuing into another batch unasked.

## Completion report format
- Batch and objective
- Files changed
- Commands run and exact results
- Behaviors verified (UI/backend/persistence separated)
- Failed/blocked/not tested
- Risks and follow-up owner decisions
- Next batch recommendation
