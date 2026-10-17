# Batch 1 — Filesystem containment correction (current)

**Acceptance remains BLOCKED pending host revalidation.** This continuation only
corrected the private-environment proof contract. No Creators Suite launch,
GUI action, Suite change, host security change, dependency installation, commit,
push or Batch 2 work occurred. Earlier records below are historical.

## Observed host evidence

Owner ran the previous diagnostic code in a normal Pop!_OS terminal and reports:
Node 22.12.0 PASS; build PASS; **69 tests passed, zero failed, zero skipped**;
Xvfb available. Namespace creation, mount setup, proof binary/library availability
and private loopback networking all PASS. Filesystem containment FAIL with
`ENVIRONMENT_NOT_ISOLATED`; final proof validation NOT_VERIFIED.

These are owner-supplied runtime results for the previous code, not a successful
host run of this correction. They demonstrate that the host reached the actual
filesystem/environment assertions, unlike the agent's earlier netlink failure.

## Exact condition, diagnosis and correction

The old assertion in `src/isolation-proof.ts` combined two checks:

```
process.env.HOME !== '/scratch/home'
  || Object.keys(process.env).some(key => !sixExplicitEnvironmentNames.includes(key))
```

The six names were PATH, HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME, XDG_DATA_HOME,
and TMPDIR. **PWD was missing.** `sandboxArgs()` uses `--clearenv` and
`--chdir /scratch`. The installed Bubblewrap 0.11.0 manual explicitly documents
that clearenv excepts PWD. Its source sets PWD to the chosen working directory
after the chdir, immediately before launching the child:
[Bubblewrap 0.11.0 source](https://github.com/containers/bubblewrap/blob/v0.11.0/bubblewrap.c#L3268).
The local manual was read directly from `/usr/share/man/man1/bwrap.1.gz`.

Thus Bubblewrap's legitimate `PWD=/scratch` alone necessarily triggered the old
unexpected-variable predicate. This is a verified code/configuration contract
defect, reproduced in regression tests; it is sufficient to explain the host's
reported generic failure. No host environment dump or secret values were needed.
The old combined diagnostic cannot independently exclude a second bad value;
the new specific assertions will identify any additional issue on host rerun.

There was no evidence that HOME initialization itself failed. The correction:

- Defines a shared exact environment contract in `src/isolation-environment.ts`.
- Keeps clearenv and every existing private HOME/XDG/TMP/PATH initialization.
  The builder uses the shared contract and still leaves PWD generation to
  Bubblewrap after `--chdir /scratch`.
- Requires actual `process.cwd()` and PWD both to equal `/scratch`.
- Requires all seven allowed variables to have their exact expected values;
  missing values, other private paths and noncanonical spellings fail closed.
- Rejects every other variable, including credential keys, NODE_OPTIONS,
  DISPLAY and OLDPWD. It does not silently delete unexpected values or accept
  arbitrary PWD values.
- Checks that the new compiled helper exists before attempting the proof.

New allowlisted codes, all in FILESYSTEM_CONTAINMENT:
`ENV_WORKING_DIRECTORY_MISMATCH`, `ENV_PWD_MISMATCH`, `ENV_HOME_MISMATCH`,
`ENV_PATH_MISMATCH`, `ENV_XDG_CONFIG_MISMATCH`, `ENV_XDG_CACHE_MISMATCH`,
`ENV_XDG_DATA_MISMATCH`, `ENV_TMPDIR_MISMATCH`, `ENV_UNEXPECTED_VARIABLE`.
No variable names from untrusted input, values, paths or secrets are included in
diagnostics. The old generic code remains recognized for historical failure
records, but the new assertions emit the specific codes.

Empty-root mounts, read-only system/input mounts, private namespaces/network,
private storage roots, EROFS write-denial proof, secret handling, nonce/result
validation and marked cleanup were preserved. No additional host path or service
is exposed. Electron's sandbox configuration was not touched.

## Validation and commands

| Check / command | Actual result |
| --- | --- |
| Read AGENTS, blueprint, discovery and prior handoff | Completed |
| `bwrap --version` | bubblewrap 0.11.0 |
| Read installed bwrap manual; inspect official version-tagged source | Confirmed PWD exception and post-chdir assignment |
| `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` | Exit 0 |
| `pnpm test` | Exit 0: **96 tests, 95 passed, 0 failed, 1 skipped** |
| `node dist/cli.js isolation-check` | Exit 3, PRIVATE_LOOPBACK_SETUP_DENIED in agent execution; corrected filesystem stage NOT_VERIFIED here |
| `git diff --check` | Exit 0 |

Local evidence: `artifacts/batch-1-filesystem-containment-tests.tap` (generated,
ignored). The one skipped test is the live TCP bind test, denied by the agent
execution environment. The owner had no skips running the prior 69 tests on host;
that does not imply the new 96-test suite has been run there.

Mocked proof tests now include the complete production environment and private
cwd, rather than an incomplete environment missing PWD and XDG/TMP fields.
New regression tests reproduce the original false rejection, verify exact good
values, reject each missing/altered value, reject cwd/PWD aliases and mismatches,
reject unexpected secret/injection keys, check sanitized output and verify the
builder's clearenv/redirect contract. These establish assertion correctness;
they do not substitute for successful real host containment proof.

## Files changed this continuation

Added: `src/isolation-environment.ts`, `tests/isolation-environment.test.cjs`.
Updated: `src/isolation.ts`, `src/isolation-proof.ts`,
`src/isolation-diagnostics.ts`, `tests/isolation-diagnostics.test.cjs`,
`docs/batch-1-handoff.md`.

Rebuilt ignored dist and generated local test evidence. All pre-existing working
tree changes were preserved. No target config, package/lockfile, launcher/session
code, README, AGENTS, blueprint, Suite files or Git metadata were changed this
turn. Unexpected finding: the earlier proof test fixture also omitted PWD and
several required redirect variables, so it failed to model Bubblewrap's real
child environment; that fixture has been corrected.

## Next host commands and remaining gates

Diagnostics only; do not run a launcher or GUI command:

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm build
pnpm typecheck
pnpm test
pnpm qa isolation-check
printf 'isolation-check exit=%s\n' "$?"
```

Record the sanitized JSON result and exit status only. A successful corrected
host filesystem/proof validation result is still required. If another assertion
fails, its allowlisted code identifies which requirement failed without an
environment dump. Overall Batch 1 runtime lifecycle and Electron compatibility
acceptance remain separate outstanding gates; none was attempted here. Stop for
owner review. **Batch 1 is not accepted and Batch 2 has not begun.**

---

# Batch 1 — Isolation diagnostics update (current)

**Acceptance remains BLOCKED. Scope: diagnostics only.** No target launch, GUI
mutation, host security change, target edit, dependency installation, commit or
push was performed in this continuation. The earlier completion report below is
historical; this section supersedes its test counts and Xvfb availability note.

## Owner host evidence received

Owner reports Node 22.12.0 and build PASS; the previous 42-test suite passed with
42 passes, zero failures and zero skips. Xvfb is installed and `/usr/bin/Xvfb` is
now also present in the agent execution view. The previous host isolation check
returned only BLOCKED / ISOLATION_BLOCKED. **That old generic result does not
identify the host's failing stage.** No new host result has been received yet.

## Precisely observed agent failure

The updated real `node dist/cli.js isolation-check` exits 3 with:

```json
{
  "status": "BLOCKED",
  "code": "ISOLATION_BLOCKED",
  "isolation": {
    "stage": "PRIVATE_LOOPBACK_NETWORKING",
    "reasonCode": "PRIVATE_LOOPBACK_SETUP_DENIED"
  }
}
```

Its full JSON marks that stage FAIL and the other five stages NOT_VERIFIED.
Bubblewrap fails creating its private-loopback NETLINK_ROUTE socket before the
proof executable starts. A direct bounded in-memory stderr classification probe
confirmed native exit 1 and that reason. No raw stderr or paths are retained in
runner evidence. This identifies this execution environment's observed failure,
not the still-unknown host failure; the host previously succeeded at basic TCP
and a broader bwrap probe, but its full empty-root proof remains unverified.

## Diagnostic stages and representative reason codes

| Stage | Reason codes |
| --- | --- |
| NAMESPACE_CREATION | NAMESPACE_SETUP_DENIED, NAMESPACE_IDENTITY_MISMATCH, NAMESPACE_INSPECTION_FAILED |
| MOUNT_SETUP | MOUNT_SOURCE_UNAVAILABLE, MOUNT_SETUP_FAILED, MOUNT_INSPECTION_FAILED, MOUNT_REQUIRED_MISSING, MOUNT_NOT_READ_ONLY, SCRATCH_NOT_WRITABLE |
| BINARY_LIBRARY_AVAILABILITY | BWRAP_UNAVAILABLE, SANDBOX_PROCESS_UNAVAILABLE, RUNTIME_BINARY_UNAVAILABLE, RUNTIME_EXECUTION_FAILED, PROOF_MODULE_UNAVAILABLE, RUNTIME_LIBRARY_UNAVAILABLE |
| PRIVATE_LOOPBACK_NETWORKING | PRIVATE_LOOPBACK_SETUP_DENIED, LOOPBACK_INTERFACE_INVALID, LOOPBACK_INSPECTION_FAILED, LOOPBACK_BIND_DENIED |
| FILESYSTEM_CONTAINMENT | SCRATCH_PREPARATION_FAILED, HOST_DIRECTORY_VISIBLE, ENVIRONMENT_NOT_ISOLATED, WRITE_CONTAINMENT_FAILED, CONTAINMENT_INSPECTION_FAILED |
| PROOF_VALIDATION | PROOF_MISSING, PROOF_MALFORMED, PROOF_STALE, PROOF_TIMEOUT, PROOF_PROCESS_FAILED, PROOF_WRITE_FAILED, SANDBOX_STARTUP_UNCLASSIFIED |

Native startup stderr is consumed only by the trusted isolation preflight,
bounded to 8 KiB in memory, translated to allowlisted codes, then discarded.
It is neither echoed nor saved. App-launch streams still default to discard.
Unknown messages remain unclassified. Other stage results are never inferred
from a native startup error. Proof failures serialize only stage/code/status;
no environment values, namespace IDs, file paths, session tokens or raw errors
are included in public diagnostic results.

## Implementation defects corrected

- The old child failure handler swallowed proof errors and emitted no result.
  It now writes a structured sanitized failure report identifying its stage and
  preserving only checks that actually passed before the failure.
- The parent previously collapsed startup, loader, proof and parsing failures
  into one generic result. It now separates source/executable prechecks, native
  startup classification, typed child failures, timeouts and result validation.
- Proof reports now require a version, the current run's marker nonce, all six
  stage results and a consistent outcome. Missing, malformed, stale, incomplete
  and nonzero-success reports fail closed. Internal nonce values are not printed.
- A failed write was previously accepted regardless of its error. Mounts must
  still be verified read-only, and write probes now require EROFS: ENOENT, EEXIST
  or unrelated failures cannot masquerade as containment. Unexpected denial
  behavior is reported and remains blocked rather than relaxing the proof.

The empty-root mount plan, namespace flags, cleared environment, private storage
roots, Electron sandbox and cleanup ownership rules were not weakened or changed.
No mount source was added and no private network was replaced with host networking.

## Tests and commands executed in this continuation

| Command/check | Actual result |
| --- | --- |
| Read instructions, blueprint, discovery and previous handoff | Completed |
| `ls -l /usr/bin/Xvfb` | Exit 0; executable present |
| `bwrap --version` | bubblewrap 0.11.0 |
| Direct Node spawn of namespace-only bwrap with classified stderr | Native exit 1; PRIVATE_LOOPBACK_SETUP_DENIED; raw text not printed |
| `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` | Exit 0 |
| `pnpm test` | Exit 0: **69 tests, 68 passed, 0 failed, 1 skipped** |
| `node dist/cli.js isolation-check` | Exit 3, PRIVATE_LOOPBACK_SETUP_DENIED; per-run scratch removed |
| `git diff --check` | Exit 0 |

Generated local evidence: `artifacts/batch-1-isolation-diagnostics-tests.tap`
(ignored). Tests are reproducible from the workspace test sources.

**Real validation:** actual restricted Bubblewrap startup and sanitized reason;
normal subprocess, scratch and shutdown tests; executable/source availability
checks; fail-closed cleanup. The existing live TCP test is skipped only for EPERM
in this execution environment. The owner's earlier 42/42 host result is separate
owner-supplied evidence, not an agent run of the new 69-test suite.

**Mocked validation:** every proof-stage failure reason, complete proof success,
missing/writable mounts, namespace identity, extra interfaces and failed bind,
host directories, inherited environment, misleading write failures, child failure
serialization, nonce/protocol validation, startup-message classification and
secret-field stripping. Parent source/executable failure tests verify no child
is started when prechecks fail. These do not establish real full containment.

**Still blocked/unverified:** successful empty-root proof on the host or in the
agent environment; host's exact failing stage; real private loopback inside this
full plan; actual mount/namespace/filesystem proof; proof-loader compatibility
inside the full plan; Electron/Xvfb runtime compatibility. No target launch was
attempted and no Batch 2 behavior was exercised.

## Files changed in this continuation

Updated: `src/isolation.ts`, `src/isolation-proof.ts`, `src/errors.ts`,
`src/processes.ts`, `README.md`, `docs/batch-1-handoff.md`.

Added: `src/isolation-diagnostics.ts`, `tests/isolation-diagnostics.test.cjs`.
Rebuilt ignored dist and generated test evidence; scratch runs were removed.
Pre-existing uncommitted completion work was preserved. No target configuration,
package, lockfile, launch/session code or Suite files were changed this turn.

## Next host verification (diagnostics only)

```bash
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm build
pnpm typecheck
pnpm test
pnpm qa isolation-check
printf 'isolation-check exit=%s\n' "$?"
```

Record the sanitized JSON `isolation` object and the exit status. Do not collect
raw stderr, full environment dumps, URLs or session tokens. This runs no Suite
app and requires no privilege or policy change. No launcher/GUI command is part
of this diagnostic request. A host result is required to identify and correct
its exact failing stage; do not infer it from the agent-only netlink denial.
Stop for owner review. **Batch 1 acceptance remains BLOCKED.**

---

## Historical acceptance-completion record

# Batch 1 — Acceptance completion handoff

2026-10-17. **Acceptance: BLOCKED.** Launcher integration code is now present;
complete isolation and an actual isolated Electron lifecycle have NOT been
verified. No Batch 2 scenarios, GUI mutations, commits or pushes were performed.
This report supersedes the earlier partial Batch 1 handoff in Git history.

## Current acceptance matrix

| Area | Implementation | Evidence / acceptance |
| --- | --- | --- |
| Runtime/config/CLI | Implemented | Node 22.12.0, pnpm 10.31.0, strict config and explicit errors retained; tests pass |
| Conventional Git | Resolved by existing owner setup | `.git` now works, initial worktree clean, existing HEAD `3fa69d0`; no Git metadata changes made this turn |
| Environment diagnosis | Implemented diagnostic; comparison obtained | Owner terminal binds loopback successfully; agent execution returns EPERM; host bwrap transcript reports no error |
| Empty-root filesystem/PID/network sandbox | Implemented; runtime BLOCKED | Bubblewrap fails setting up private loopback in agent execution; full proof has not executed successfully |
| Scratch/path/lease safety | Implemented and tested | Unmarked roots, symlinks, forbidden project paths and persistent process leases rejected; marked cleanup tested |
| Owned renderer/Electron/RPC lifecycle | Implemented; target runtime UNTESTED | Private Xvfb, static renderer child, Electron bootstrap, listener/PID checks, readiness deadlines, shutdown and released-port checks wired |
| Electron security compatibility | Checks implemented; runtime UNVERIFIED | Actual distribution version file says 41.10.6; actual preload/preferences/DOM readiness checks await runtime |
| Source staging | Verified against actual target inputs | Desktop and renderer snapshot copied to marked scratch and removed; no target launched or modified |
| Safety tests | Pass with one explicit skip | **42 tests: 41 passed, 0 failed, 1 skipped** in agent environment |
| UI mutation tests | Disabled | Config requires false, `run` refuses, boot performs only a read-only readiness query |

No successful lifecycle, UI, Suite backend or Suite persistence behavior is claimed.
The final config still says isolation unproven and GUI mutations false. Its paths,
ports and version assumptions were not replaced with invented validated settings.

## Environment attribution and safe testing method

Observed inside agent execution:

- Pop!_OS 24.04 identity; `/proc/self/status` reports Seccomp=2 and
  NoNewPrivs=1. AppArmor current label reports unconfined.
- A direct Node loopback probe returns EPERM. Doctor and launch exit 3 with
  PORT_UNAVAILABLE, distinguishing denied inspection from an occupied port.
- Bubblewrap with private network returns exit 1:
  `loopback: Failed to create NETLINK_ROUTE socket: Operation not permitted`.
- Two queried host sysctl files are unavailable in this execution view. Their
  absence does not prove the host kernel settings or an AppArmor cause.

Owner-provided normal terminal evidence (not executed by this agent):

```
nvm use 22.12.0
# Now using node v22.12.0 (npm v10.9.0)
# Loopback TCP: OK
bwrap --unshare-user --unshare-pid --unshare-net --ro-bind / / --proc /proc --dev /dev -- /bin/true
# Returned to prompt without an error in the supplied transcript.
git status --short
# No changes shown in that transcript.
```

**Finding:** the TCP failure is specific to the agent execution context relative
to the tested host terminal. The corresponding bwrap comparison strongly points
to the same execution boundary. The exact denying syscall/filter is not identified;
no host bwrap exit code was supplied. Seccomp is active, but its presence alone
is not proof that a particular filter caused either denial.

Official OpenAI documentation states that spawned commands inherit the sandbox's
file and network boundaries: [Sandbox documentation](https://learn.chatgpt.com/docs/sandboxing).
This supports the execution-context interpretation; it does not prove this host's
kernel/filter implementation. The OpenAI Docs skill was used for this documentation
check; no privilege or security-setting recommendations from external pages were
applied.

Safe next host checks, from the runner checkout:

```bash
nvm use 22.12.0
pnpm build
pnpm qa environment
pnpm test
pnpm qa isolation-check
command -v Xvfb
```

These start no Suite app. They require no elevated privileges, host security
changes, real profiles, network downloads, or changes to Codex settings. The probe
uses its own disposable scratch. Review the full empty-root isolation result
before scheduling `pnpm qa launch` as a separate non-mutating lifecycle validation.
Do not use host networking, host display sockets, `--no-sandbox`, sudo, or broad
filesystem bindings as a fallback. `/usr/bin/Xvfb` is absent in the current agent
view; host availability is not established. No installation was attempted.

## Implemented runtime design

The previous broad read-only host-root probe is replaced by an empty-root bwrap
plan. Only system binary/library trees, the loader cache, a generated localhost
hosts file, compiled runner files, and the exact Node executable enter preflight.
Host `/home`, `/root` and `/run` remain empty; `/tmp` is private. HOME, XDG and temp
paths point into marked scratch. The environment is cleared. Mount, PID, network,
user and IPC namespaces must differ from the caller's recorded namespaces.
Effective mount permissions, read-only write refusals and loopback binding are
checked inside the sandbox before target code is eligible to execute.

The target launch uses the same filesystem plan plus a source snapshot and the
existing Electron distribution mounted read-only. Staging accepts desktop JS/JSON
and selected built renderer assets; it refuses hidden files and symlinks, excludes
node_modules, and does not copy target Git metadata or environment files. Root
package metadata is reduced to name/version/description. The source snapshot is
disposable; no target code/dependency writes are required. This is not a packaged
build and does not certify renderer build freshness.

An inner supervisor reruns containment proof, creates a private Xvfb display,
starts a loopback-only built-asset server and starts Electron with a runner-owned
bootstrap. It refuses missing Xvfb and verifies listener inode ownership against
both child PIDs/start identities. It never attaches to host display or dev
services. The static server never logs URLs/queries and confines real paths to
its asset root. All subprocess output is discarded, not saved as evidence.

Before target imports, the Electron bootstrap redirects home/userData/sessionData/
appData/temp/logs/crashDumps and checks scratch containment. It preserves the
actual main/preload source. After load, it checks sandbox=true,
contextIsolation=true, nodeIntegration=false, the exact preload, actual Electron
41.10.6 and visible New Project readiness via a fixed read-only DOM query. It
never records the window URL or RPC token and performs no GUI action. No
Playwright package/API compatibility has yet been tested.

Shutdown requests app.quit through a private scratch control file, bounds its
wait, then stops owned process groups in reverse order. It checks port release
before reporting lifecycle success. Outer bwrap startup has a 35-second deadline;
its death/PID-namespace boundary is intended to contain descendants that change
sessions. **These target-session paths are untested**, including Chrome namespace
sandbox nesting, Xvfb, graceful Electron quit, and the outer-wrapper kill behavior.

Persistent `.active-process.json` leases complement in-memory scratch ownership.
A runner crash leaves a lease that prevents deletion by a later runner process;
no automatic stale-lease override exists. On uncertain shutdown the safe result
is a blocked operation with scratch retained for owner review.

## Validation, commands and exact outcomes

Commands used installed Node 22.12.0 through an explicit PATH. No install/update
commands or package/lockfile changes were needed this turn.

| Command/check | Result |
| --- | --- |
| Read AGENTS, blueprint, Batch 0 and earlier Batch 1 report | Completed |
| `git status --short`, `git rev-parse --git-dir`, `git log -1 --format=...` | Exit 0; conventional `.git`, clean initial worktree, existing owner commit |
| OS, `/proc/self/status`, AppArmor label and sysctl reads | Findings above; sysctl reads missing, no settings changed |
| Direct Node TCP bind/close probe | JSON tcp=EPERM; exit 3 |
| Direct `bwrap --unshare-all ... /bin/true` probe | Exit 1; private-loopback netlink denied |
| `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` | Exit 0 |
| Final `pnpm test` | Exit 0; 42 total, 41 passed, 1 skipped, no failures |
| `node dist/cli.js environment` | Exit 0, DIAGNOSTIC_ONLY, DENIED_EPERM, seccompMode=2, noNewPrivileges=1 |
| `node dist/cli.js isolation-check` | Exit 3, ISOLATION_BLOCKED; probe process stopped and run scratch removed |
| `node dist/cli.js doctor` and `launch` | Each exit 3, PORT_UNAVAILABLE; no target executed |
| Actual target staging / cleanup script | First safely refused dependency-store hidden files; after explicit node_modules exclusion, ACTUAL_TARGET_INPUTS_COPIED; exit 0; no target launched |
| Read Electron distribution `dist/version` | 41.10.6; no Electron execution |
| `ls -l /usr/bin/Xvfb` | Exit 2, absent in agent execution view |
| `git --no-optional-locks -C ../pl-creators-suite status --short` | Same pre-existing dirty listing as discovery; no Suite mutation commands |
| `git diff --check` and final diff review | Completed before handoff |

Real tests use disposable directories, actual owned Node children, process-group
shutdown, failed Bubblewrap startup and cleanup. Synthetic tests cover listener
ownership tables, EADDRINUSE/EPERM, process-inventory denial, shutdown EPERM,
mount permission rejection and launch-gate failure. The skipped test binds an
actual TCP port; it skips only on EPERM. A skipped network test is not a pass.

Additional acceptance tests cover forbidden project roots, copied-input symlink
parents, hidden fake credentials, dependency-store exclusion, missing/writable
mounts, isolation-bypass arguments, failed readiness cleanup, persistent leases
and no process creation after failed isolation. Dummy secret strings belong to
unit fixtures only and are removed by teardown.

Generated test evidence: `artifacts/batch-1-acceptance-tests.tap` (ignored, local).
Tests live in `tests/safety.test.cjs` and `tests/acceptance.test.cjs`. No screenshots,
traces, raw app output, token-bearing network evidence or environment dumps exist.

## Changed files and unexpected findings

Changed: `README.md`, `docs/batch-1-handoff.md`, `src/cli.ts`, `src/isolation.ts`,
`src/launch.ts`, `src/scratch.ts`.

Added: `src/environment.ts`, `src/runtime-files.ts`, `src/isolation-proof.ts`,
`src/renderer-server.ts`, `src/electron-entry.ts`, `src/sandbox-session.ts`,
`tests/acceptance.test.cjs`.

Generated: rebuilt ignored dist and local test output; scratch runs were removed,
leaving the pre-existing root marker. Existing `.runner-git` preserved unchanged.
No changes to package manifests, lockfiles, target config, AGENTS, blueprint,
Batch 0 report, Suite source, dependencies or Git data. No commits or pushes.

Unexpected: owner had already established a conventional Git repository between
sessions; host networking worked while agent networking remained denied; target
apps/desktop/node_modules initially caused staging to fail closed; private Xvfb
is absent from this execution view. No target dependencies were copied or changed.

## Unresolved acceptance gates and owner review

1. Obtain a successful full `isolation-check` result on the host. The earlier
   broad host bwrap command did not test the new empty-root plan or all write paths.
2. Confirm an available private-display prerequisite without installing anything
   or changing security settings as part of this task.
3. Run repeated non-mutating boot/stop cycles with the new launcher only after
   reviewing containment evidence. Retain sanitized success/failure records for
   actual PID/port ownership, every effective storage path and security preference.
4. Prove renderer/Electron/RPC shutdown and no surviving sandbox processes/ports
   on successful and failed startup. Actual positive socket ownership and app
   namespace behavior remain unverified in this execution environment.
5. Validate Playwright/Electron compatibility separately before enabling Batch 2.
   No app patch is required or proposed as validated here; any future required
   Suite changes need separate approval.

Process guards still rely on visible /proc start/group/session evidence rather
than atomic pidfd operations. Private scratch assumes no hostile same-UID rename
races. Runtime system mounts and actual effective Electron/OS storage paths need
review against observed evidence; static code and mocked tests do not establish
complete isolation. **Batch 1 remains BLOCKED for acceptance; stop for owner
review and do not begin Batch 2.**
