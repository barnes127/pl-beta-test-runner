# PL Beta Test Runner

Standalone TypeScript developer QA utility. The owner verified two isolated
non-mutating Batch 1 lifecycles and all five Batch 2 smoke scenarios on Pop!_OS
with complete shutdown. Formal `isolationReview` remains `PENDING`.
Creators Suite remains inspection-only.

Use Node **22.12.0** and pnpm **10.31.0**:

```bash
nvm use 22.12.0
pnpm install --frozen-lockfile --ignore-scripts
pnpm format:check
pnpm typecheck
pnpm test
pnpm qa help
pnpm qa environment
pnpm qa doctor
pnpm qa isolation-check
```

The environment command temporarily binds/closes a loopback socket and reads
only selected security flags. It launches no target and prints no environment
values, process command lines, credentials or raw error output. Compare its
results inside Codex and in a normal terminal to diagnose execution restrictions.
The same read-only doctor and disposable isolation probe can run on the host
without changing system policy, application security, or Codex permissions.

`doctor` reads target metadata/dependencies and checks existing processes and
ports. It does not create scratch data, start the target, install dependencies,
or demonstrate isolation. It temporarily binds/closes required ports without
sending RPCs. Config paths resolve relative to the config file.

`isolation-check` creates a private marked run under `.scratch` and executes a
bounded Bubblewrap probe with an empty filesystem root, private PID/network/user/
mount/IPC namespaces, cleared environment, private HOME/XDG/temp roots, and a
small set of read-only system/runtime mounts. It verifies effective namespaces,
mount permissions, hidden host homes/IPC directories, denied writes, and local
socket availability. A successful probe is not full app acceptance.


Isolation failures now include `isolation.stage`, an allowlisted `reasonCode`,
and stage checks marked `PASS`, `FAIL` or `NOT_VERIFIED`. Run `pnpm build` before
`pnpm qa isolation-check` to use the updated diagnostics. Stages distinguish
namespace creation, mount setup, proof binary/library availability, private
loopback networking, filesystem containment and result validation. A failure
before the proof executable runs leaves other stages unverified. Unknown startup
errors remain `SANDBOX_STARTUP_UNCLASSIFIED`; they are never guessed or printed.
The binary stage covers the proof's Node loader, not Electron or Xvfb compatibility.

**`pnpm qa launch` is owner-authorized for non-mutating boot/stop against only
the canonical adjacent disposable `pl-creators-suite` checkout.** Alternate
checkouts and symlink redirects are refused. Doctor and isolation preflight
must succeed. It stages desktop JS/JSON and built renderer assets
in scratch, excluding target dependency stores, Git metadata, hidden inputs and
symlinks. It uses the existing Electron distribution read-only and a **private
Xvfb display**; it never attaches to host X11/Wayland or an existing Suite.
Missing Xvfb blocks startup; no installation or security fallback is automatic.
No `--no-sandbox`, network-sharing, host-home or environment-inheritance fallback.

The sandbox exposes only private state writable at `/scratch`; generated proof
inputs, staged target, Electron and runner code have no writable guest aliases.
Doctor rejects outputs older than source/configuration inputs and reports hashes;
timestamps are not build provenance.

The launcher checks both listener PIDs, source preload and security preferences,
actual Electron version, isolated storage paths, and a read-only visible New
Project check. It stops gracefully, falls back to bounded owned-process shutdown,
verifies released ports, and cleans only marked scratch. Ordinary launch keeps GUI mutation scenarios
disabled; explicit smoke mode is separately gated as described below. No screenshots, traces, HAR,
raw stdout/stderr, window URLs or RPC tokens are retained. Trusted isolation
preflight stderr is classified in bounded memory only; raw text is discarded. A process lease left
by an unconfirmed shutdown blocks automatic cleanup across runner restarts.

**Batch 2:** `pnpm qa list` lists the fixed suite; `pnpm qa run` executes boot,
navigation, scratch project creation (including duplicate-creation rejection),
Code IDE save/close/reopen, and recent-project context reopen. The command accepts
no custom script, selector, RPC or project path. `allowGuiMutations: false` stays
the global config default; the explicit `run` command is the sole scratch-only
exception, authorized by the owner after Batch 1 runtime acceptance.

A readonly nonce-bound smoke plan plus a supervisor permit issued only after
fresh isolation, window/preload readiness and exact listener ownership gates
controls interactions. The bridge/window/security/snapshot are rechecked before
each UI action. The public Electron executeJavaScript API drives inspected DOM
handlers, with native input setters/events for React; no Playwright, CDP port,
remote debugger, sandbox switch or dependency is added. Each scenario checks
observable UI state and project/document scenarios independently read scratch
output. No direct testing RPC calls substitute for UI actions.

**Managed Codex runtime remains blocked:** TCP DENIED_EPERM; doctor and `run`
return PORT_UNAVAILABLE before Electron. The owner's normal Pop!_OS terminal
completed all five scenarios; local unit/fake-DOM results are not a substitute
for that evidence. See the [Batch 2 handoff](docs/batch-2-handoff.md) for the
owner's actual results. Packaged mode is unsupported.

`pnpm qa run` writes an immutable JSON and self-contained HTML report under
`artifacts/reports/<run-id>/` after process shutdown and scratch cleanup are
assessed. The private reports root has an ownership marker; an unmarked or
symlinked path is refused. The CLI returns relative report paths. Reports show
scenario durations, fixed failure codes, a bounded trace of action/assertion
outcomes, build fingerprints, reproduction steps, and the separate automated
isolation and formal-review states. Screenshot capture is omitted because the
runner cannot prove that arbitrary failure-window text is safe to retain.
Failure or blocked reports contain no raw app output, DOM text, paths, tokens or
environment values. An uncertain shutdown or cleanup yields overall BLOCKED,
even when the smoke assertions passed. Reports are intentionally retained until
the owner reviews/removes them; the runner never deletes a retained process lease.

A safe deterministic report failure check that reads no Suite source is
`pnpm qa run --config /dev/null`. It exits 2 with a CONFIG/BLOCKED report and
does not start Electron. Run a real smoke/report check in a normal Pop!_OS
terminal with `pnpm qa run` after `pnpm build`, `pnpm qa doctor` and
`pnpm qa isolation-check`. See [Batch 3 handoff](docs/batch-3-handoff.md).

CLI outputs JSON. Exit 0 means requested checks completed, 2 means invalid config/
runtime, 3 means blocked safety/infrastructure, 4 means unexpected failure with
raw details withheld. Read explicit isolation and mutation fields after exit 0.
`run` requires all runtime gates and reports fixed per-scenario statuses.
A scenario failure stops subsequent scenarios and still triggers owned cleanup.

Conventional Git now works: use `git status` and `git diff`. The owner established
a `.git` repository after the original session. Historical `.runner-git` is
preserved and ignored, but no longer used. No commits or pushes were made during
acceptance completion. This managed Codex workspace can read `.git` but cannot
write its index, so the Batch 2 checkpoint commit must be made in the owner's
normal terminal after reviewing the combined Batch 2/3 worktree.

Runner dependencies were originally installed from an independent cached offline
store under `/tmp` (three packages, zero downloaded); that store is not required
by repository configuration. Node 24 type declarations were cached; runtime is
pinned to Node 22.12.0 and source must use APIs available on that version.

See [Batch 1 handoff](docs/batch-1-handoff.md) for actual evidence and remaining
acceptance gaps, and [Batch 0 discovery](docs/batch-0-discovery.md) for source paths.
