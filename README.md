# PL Beta Test Runner

Standalone TypeScript QA foundation. **Batch 1 acceptance remains BLOCKED**:
controlled launch code is present, but a successful isolated Electron session
has not been demonstrated. No Batch 2 scenarios or GUI mutation tests exist.
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
verifies released ports, and cleans only marked scratch. GUI mutation scenarios
stay disabled even after a successful lifecycle. No screenshots, traces, HAR,
raw stdout/stderr, window URLs or RPC tokens are retained. Trusted isolation
preflight stderr is classified in bounded memory only; raw text is discarded. A process lease left
by an unconfirmed shutdown blocks automatic cleanup across runner restarts.

**Current validation:** owner reports 120/120 tests, refreshed renderer, doctor
and all six isolation-preflight stages passing. In this execution environment,
loopback binding is denied, doctor is blocked, and preflight retained an
unconfirmed process lease. No Electron launch or Batch 2 scenario was run.
See the [current handoff](docs/batch-1-handoff.md) for exact host commands and
remaining lifecycle acceptance gates. Packaged mode is unsupported.

CLI outputs JSON. Exit 0 means requested checks completed, 2 means invalid config/
runtime, 3 means blocked safety/infrastructure, 4 means unexpected failure with
raw details withheld. Read explicit isolation and mutation fields after exit 0.
`run` refuses GUI scenarios; `list` reports none implemented.

Conventional Git now works: use `git status` and `git diff`. The owner established
a `.git` repository after the original session. Historical `.runner-git` is
preserved and ignored, but no longer used. No commits or pushes were made during
acceptance completion.

Runner dependencies were originally installed from an independent cached offline
store under `/tmp` (three packages, zero downloaded); that store is not required
by repository configuration. Node 24 type declarations were cached; runtime is
pinned to Node 22.12.0 and source must use APIs available on that version.

See [Batch 1 handoff](docs/batch-1-handoff.md) for actual evidence and remaining
acceptance gaps, and [Batch 0 discovery](docs/batch-0-discovery.md) for source paths.
