# Batch 1 — Runner Foundation and Safe Launcher

Date: 2026-10-17. **PARTIAL / BLOCKED acceptance; no isolated GUI launch claimed.**
Batch 2 was not started. The usable result is a standalone safety foundation,
read-only doctor, real isolation probe, process primitives, and a fail-closed
launch command. A functioning Electron/renderer/RPC session is not delivered.

## Implementation and verification status

| Requirement | Implemented | Evidence / limitation |
| --- | --- | --- |
| TypeScript/pnpm foundation | Yes | Build, typecheck, formatter check pass on Node 22.12.0 / pnpm 10.31.0 |
| Runner Git metadata | Yes, environment-specific workaround | Initialized `.runner-git`; existing empty read-only `.git` preserved; use explicit Git directory arguments; no commit |
| Config/CLI/errors | Yes | Strict keys, fixed supported ports/modes, relative path semantics, mutations forbidden; negative tests and real CLI exit codes |
| Read-only doctor | Yes | Reads metadata and dependencies, inventories process names, temporarily binds/closes ports; fixture unchanged in test; real doctor BLOCKED by bind EPERM |
| Scratch ownership / containment | Yes | Private root and per-run markers, nonce, UID/mode checks, realpath and symlink checks; deletion refusal and outside-data preservation tests |
| Filesystem isolation preflight | Probe implemented; isolation NOT VERIFIED | Real Bubblewrap subprocess fails closed; marked run cleaned; user namespace alone is insufficient |
| Controlled process operations | Yes, foundational primitives | Detached spawn, identity/start-time/group/session checks, readiness deadlines, bounded TERM/KILL, descendant group cleanup; actual Node subprocess tests |
| Renderer/Electron/RPC integration | NOT IMPLEMENTED beyond safety gate | `launch` checks doctor/preflight and always blocks target start, even if probe succeeds; listener ownership verifier tested with synthetic snapshots only |
| Port/process ownership | Partial | Existing-process refusal, IPv4/IPv6 bind checks, loopback socket-inode-to-PID check; simulated conflict/ambiguous ownership tests; live TCP test SKIPPED |
| Electron sandbox/preload | Preserved | No target files changed, no Electron flags changed; runtime compatibility NOT TESTED |
| Secret handling | Foundation implemented | No raw subprocess streams, environment dump, URL, RPC request, screenshot or trace collection; unknown errors replaced with fixed output; secret error fixture test |
| GUI mutations | Disabled | Config requires literal false; run rejects; no scenario is reported passed |

`doctor` success would mean only its declared checks passed; it never proves
isolation or reports a behavioral test PASS. Positive live socket ownership,
port-release behavior and GUI start/stop remain unverified. The `CHECKS_PASSED`
result carries explicit UNPROVEN isolation and DISABLED mutations.

## Files changed

New authored files:

- `.gitignore`, `README.md`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`
- `scripts/format.cjs` (TypeScript compiler printer; no new formatter dependency)
- `src/cli.ts`, `src/config.ts`, `src/errors.ts`, `src/doctor.ts`
- `src/scratch.ts`, `src/processes.ts`, `src/isolation.ts`, `src/launch.ts`
- `tests/safety.test.cjs`, `docs/batch-1-handoff.md`

Updated: `config/example.target.json`. Target path is now relative to the config
file (`../../pl-creators-suite`). The proposed built-renderer development mode
is explicitly unverified; packaged mode is unsupported. Removed null runtime
paths rather than presenting them as validated settings; they are generated only
for the scratch isolation probe. Isolation remains unproven and mutations false.

Existing `AGENTS.md`, blueprint and Batch 0 report were not edited. Initial
repository indexing may list these pre-existing files as added because the runner
has no previous commit; that does not mean their contents were authored here.

Local ignored/generated state: `.runner-git` metadata, `node_modules`, `dist`,
`.scratch` root ownership marker, and `artifacts/batch-1-tests.tap`. A temporary
pnpm store and temporary unit fixtures were created under `/tmp`; test fixtures
are removed by their test teardown. No credentials or target project fixtures.

## Commands executed and outcomes

Commands below ran in the runner unless a read-only Suite path is specified.
Runtime commands used:

```
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
```

| Command / operation | Actual result |
| --- | --- |
| Read AGENTS, blueprint, discovery report, config; inspect local .git | Existing `.git` empty and read-only; initial `git status --short` exited 128 |
| `git init --bare .runner-git` | Exit 0; fresh separate metadata initialized |
| `git --git-dir=.runner-git config core.bare false` and set core.worktree to runner path | Exit 0; runner worktree status available without replacing `.git` |
| `command -v node pnpm tsc bwrap unshare git`, version probes | Default Node 20.20.2, installed compatible Node 22.12.0, pnpm 10.31.0, global tsc 5.9.3; bwrap and unshare present |
| `unshare --user --map-root-user --mount --net /bin/sh -c ...` | Exit 0; namespace entry works; NOT a filesystem containment proof |
| Basic `bwrap` with user/PID namespaces and read-only root (no private network) | Exit 0; no target launched |
| Bubblewrap private-network probe | Exit 1, `loopback: Failed to create NETLINK_ROUTE socket: Operation not permitted`; no fallback to host network |
| Initial `pnpm install --offline --ignore-scripts` | Exit 226, EROFS when registering runner in global store; target untouched |
| Seed separate /tmp store with cached TypeScript 5.9.3, @types/node 24.10.9 and undici-types 7.16.0; `pnpm install --offline --ignore-scripts --store-dir /tmp/pl-runner-pnpm-store` | Exit 0, three cached packages reused, zero downloaded |
| `pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir /tmp/pl-runner-pnpm-store` | Exit 0, lockfile up to date |
| `pnpm format`, `pnpm format:check` | Exit 0 |
| `pnpm typecheck` | Exit 0 |
| `pnpm build` | Exit 0 |
| `git --git-dir=.runner-git --work-tree=. add ...` and scoped `diff --cached --check` | Runner files indexed for review; whitespace check exit 0; no commit |
| Final `pnpm test` | Exit 0: **31 tests, 30 passed, 0 failed, 1 skipped** |
| `node dist/cli.js help` | Exit 0, command list JSON |
| `node dist/cli.js doctor` | Exit 3, BLOCKED / PORT_UNAVAILABLE because TCP bind is denied |
| `node dist/cli.js launch` | Exit 3, BLOCKED / PORT_UNAVAILABLE; target never started |
| `node dist/cli.js isolation-check` | Exit 3, BLOCKED / ISOLATION_BLOCKED; owned probe stopped, per-run scratch removed |
| CLI invalid-input and `run` tests | Exit 2 and exit 3 respectively |
| Read-only `git --no-optional-locks -C ../pl-creators-suite status --short` | Existing dirty listing matches Batch 0 listing; no target mutation commands executed |

Safety evidence: [final test output](../artifacts/batch-1-tests.tap) is generated
and ignored, not a portable committed artifact. The test names also live in
`tests/safety.test.cjs`. Build/typecheck/format results above were observed in this
session; they are not claims about another machine.

## Failed checks and unexpected behavior

- Default Node was incompatible; selected the already-installed 22.12.0 binary.
  No system or Suite dependencies were upgraded.
- Global pnpm store registration was read-only; used an independent temporary
  offline store instead of changing permissions or accessing the network.
- Node 24 type declarations were in the existing cache; source and runtime tests
  use Node 22.12.0. Future APIs must not be assumed available from types alone.
- Managed environment rejects actual TCP bind (`EPERM`), despite namespace entry
  succeeding. The live occupied-port test is explicitly skipped. Simulated
  EADDRINUSE and EPERM checks both execute and distinguish conflict/unavailable.
- Default Node test worker execution did not relay useful TAP detail here.
  `--experimental-test-isolation=none` runs tests sequentially in one process.
  Spawned-process stdout pipes were also suppressed in probes; CLI exit tests
  use owned child exit status, with actual JSON output checked directly in shell.
- Early tests found unhandled bind restrictions and empty captured stdout;
  corrected fixtures to report the network limitation and avoid captured-output
  assumptions. A later shutdown test exposed a race between process death and
  the Node exit event; shutdown now waits for both group exit and child reaping.
- Scratch cleanup refuses active/unconfirmed subprocess runs. Failure to prove
  shutdown intentionally leaves the marked directory rather than deleting it.
- No privileged operations, network downloads, target builds, target tests,
  target Git writes, Electron startup or GUI mutations occurred.

## Behaviors verified, by layer

**Runner/backend primitives:** config refusal, safe errors, missing target/deps,
read-only doctor fixture, ownership/nonce/mode/path checks, symlink escapes,
non-traversing nested-link removal, bounded child startup failure and shutdown,
descendant shutdown, startup timeout, simulated listener ownership, process
inventory denial, failed real isolation probe and safe cleanup.

**UI:** none. **Suite backend:** none. **Suite persistence:** none.
Runner fixture persistence/deletion checks do not establish Suite persistence.
Normal Suite user directories were not read for content, launched against, or
used as fixtures. Complete isolation of all Suite writes is still unproven.

## Remaining risks and owner decisions

1. **Batch 1 acceptance remains incomplete.** The controlled target session
   still needs wiring: renderer hosting without target cache writes, Electron
   bootstrap with effective userData/sessionData verification, same-namespace
   loopback readiness and exact renderer/Electron/RPC PID ownership, full bounded
   stop and repeated runtime evidence. No Playwright package was added, and
   Playwright/Electron compatibility remains untested. These are unfinished
   Batch 1 work, not silently deferred into Batch 2.
2. Run these checks in an environment permitting unprivileged Bubblewrap network
   setup and local TCP binds. Do not weaken isolation, disable Electron sandbox,
   add privileged capabilities, or launch with real HOME as a workaround.
3. The current sandbox argument builder is a **probe**, not an approved app
   sandbox. Display sockets, runtime mounts, host IPC sockets, target read-only
   mounts and all effective OS storage paths need a dedicated runtime audit.
4. Process inventories are limited to the visible /proc namespace. `/proc`
   start-time/session/group checks reduce PID ambiguity but do not provide Linux
   pidfd atomic signaling guarantees. Children that deliberately escape their
   session/group and hostile same-UID races are outside the primitive's guarantee;
   a complete app launch must also enforce the enclosing PID/filesystem sandbox.
5. Scratch realpath/marker checks assume private scratch with no hostile
   concurrent same-UID rename races. Never treat the marker alone as a sandbox.
6. Existing Suite uncommitted changes remain the owner's work. Matching status
   lists are not a cryptographic snapshot of every target file. This runner did
   not invoke mutation operations there.
7. Runtime isolation proof and review must precede enabling any GUI mutations.
   Any necessary Suite launch changes require a separate owner-reviewed patch.

**Recommendation:** review this partial Batch 1 handoff, resolve the environment
restriction, and finish Batch 1 runtime integration and acceptance before Batch 2.
