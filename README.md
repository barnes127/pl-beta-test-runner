# PL Beta Test Runner

Standalone QA runner foundation. Batch 1 currently provides safety checks and a
**blocked target-launch gate**. It does not yet run Creators Suite or GUI scenarios.
The Suite checkout is inspection-only.

Use Node **22.12.0** and pnpm **10.31.0**. On this machine:

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
pnpm qa help
pnpm qa doctor
pnpm qa isolation-check
pnpm qa launch
```

The install example is for a normal development environment. This session used
`pnpm install --offline --ignore-scripts --store-dir /tmp/pl-runner-pnpm-store`
with three cached packages; it made no network requests. The temporary store is
machine-local, not required by the committed configuration. Node types 24.10.9
were available in the offline cache; source uses Node 22 APIs and tests run on 22.

`doctor` reads target metadata and checks process names and bind availability;
it does not create scratch state, launch target code, or prove filesystem
isolation. A port check temporarily binds and closes the port; it sends no RPC.
It never repairs or installs target dependencies. Config-relative target paths
resolve from the config file's directory, not the invoking working directory.

`isolation-check` creates a private marked run folder under `.scratch`, runs a
bounded Bubblewrap probe, then deletes only that marked folder. The root ownership
marker remains. A probe failure is BLOCKED, never a successful GUI launch.

`launch` runs doctor and isolation preflight, and remains blocked even if the
probe succeeds: target-session wiring and runtime ownership/compatibility proof
still require completion and review. No configuration switch bypasses this gate.
`run` always refuses GUI scenarios; `list` reports no implemented scenarios.
Development against a prebuilt renderer is a **candidate mode**, not a verified
launcher; packaged mode is rejected. No target security settings are changed.

CLI results are JSON. Exit codes: 0 = requested checks completed (not a behavioral
pass), 2 = invalid configuration/runtime, 3 = blocked safety/infrastructure,
4 = unexpected failure with raw details withheld. Inspect the explicit isolation
and mutation status even after exit 0. No traces, screenshots, environment dumps,
raw subprocess output, command lines, or RPC tokens are collected.

Git metadata for this environment is `.runner-git` because the pre-existing
`.git` is an empty read-only directory. Use:

```bash
git --git-dir=.runner-git --work-tree=. status
git --git-dir=.runner-git --work-tree=. diff --cached
```

The original `.git` was not replaced. `.runner-git` is ignored. In a normal fresh
clone, use normal Git commands; do not copy these environment-specific metadata
workarounds into another existing repository. No commit was made here.

See [Batch 1 handoff](docs/batch-1-handoff.md) for acceptance gaps and actual test
results, and [Batch 0 discovery](docs/batch-0-discovery.md) for source integration.
