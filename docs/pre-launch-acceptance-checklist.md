# Batch 1 — Pre-launch acceptance checklist

**Status: awaiting owner review. No first live Electron launch has occurred.**
`qa launch` is deliberately blocked by an explicit approval gate. Do not remove
it, use an internal entry point, or start Electron as part of this checklist.
All earlier owner preflight/test evidence refers to the previous implementation.

## Static integration review

| Area | Source/evidence | Disposition |
| --- | --- | --- |
| Electron version/API | Local Electron 41.10.6 `electron.d.ts` and distribution version file | Supported setters for home/appData/userData/sessionData/temp/crashDumps; explicit setAppLogsPath; all checked before ready |
| Application identity | Local `resources/default_app.asar` package-loader code; Suite metadata service | Start directory `/target` with runner-generated package main; require getAppPath=/target and isPackaged=false; no direct undocumented setAppPath call |
| Main/preload security | Suite `apps/desktop/main.js`, `preload.js` | Main sets sandbox=true/contextIsolation=true/nodeIntegration=false and source preload; runner verifies effective values and read-only plMenu bridge readiness |
| RPC | Suite main's ensureRpcServer and backend's startRpcServer | Server lives in Electron main process, not a separate backend child; exactly 127.0.0.1:38741; ownership checked against main PID/start identity |
| Renderer | Runner static server + Suite loadURL localhost:5173 | Separate owned Node PID; loopback-only listener, exact inode ownership; traversal/symlink refusal; query/token never logged |
| Immutable inputs | Read-only `/target`, `/electron`, `/runner`, `/runtime/node`, `/isolation-inputs` | Only private `state` is mounted writable at `/scratch`; snapshot and generated inputs have no writable guest alias |
| Host access | Empty root, private namespaces, cleared env, private Xvfb | Normal home/project/credential/profile roots and host X11/Wayland/DBus sockets not mounted; system runtime trees read-only |
| Shutdown | Supervisor + outer launcher | app.quit request, bounded waits, reverse owned shutdown, port release, no remaining live child processes, repeat containment proof; forced Electron termination cannot be success |
| Evidence/privacy | Lifecycle/proof schemas and error allowlists | Versioned nonce-bound result; no raw errors, window URL, header, environment dump, app streams, screenshot or trace |
| Build freshness | Read-only timestamp/hash inspection | **Currently BLOCKED** in inspected target: renderer index Oct 2, App.tsx Oct 15; no rebuild performed |

Evidence files inspected without executing target code:

- `../pl-creators-suite/node_modules/electron/electron.d.ts`: getPath around
  line 1274, setAppLogsPath around 1618, setPath around 1759. Documentation
  requires directories to exist and sessionData override before ready.
- Electron distribution `resources/default_app.asar`: read as bytes/text, not
  required/executed. Its package loader resolves the directory's main module and
  assigns the package directory as application path. It uses setAppPath internally;
  that method is absent from the public declarations and no longer called by us.
- Suite `apps/desktop/services/app/metadata.js` reads package.json under getAppPath.
  A runner-generated root package includes the original name/version/description
  and only changes its main selection to `/runner/electron-entry.js` in scratch.
- Suite `main.js` awaits in-process RPC initialization before creating its window;
  backend listens on requested port 38741 at IPv4 loopback. No backend service is
  separately spawned. New windows share the memoized server.

These facts establish static path-API compatibility, not successful Electron execution.
The preference getter getLastWebPreferences is absent from public declarations;
its name exists in the installed native binary, which does not prove callable
compatibility. A guarded inspection now fails with PREFERENCE_INSPECTION_UNAVAILABLE
if missing or unusable. It never substitutes assumed preferences for inspection.
Chrome sandbox nesting, preload execution, Xvfb dependencies and graceful exit
must be observed in the separately approved runtime operation. No sandbox,
web-security, setuid-sandbox or GPU-sandbox disabling flags are accepted.

## Owner review gates before authorizing the first launch

- [ ] Review the runner diff and local test evidence. This review has not committed
  or pushed anything and did not verify GitHub over the network.
- [ ] Resolve the stale renderer through the normal owner-operated Suite build
  workflow. No agent target build/edit/install is authorized here. If rebuilding
  is deferred, keep the launcher blocked; do not bypass freshness checks.
- [ ] Review source/asset/desktop SHA-256 digests from a successful doctor check
  against the exact build intended for validation. Timestamp checks detect stale
  outputs; they are not cryptographic proof that a build corresponds to source.
  The runner records provenance as NOT_PROVEN and checks for staging changes.
- [ ] Run runner build/typecheck/tests on host for this revision. Previous owner
  evidence was 96/96; this revision adds new lifecycle/static regressions.
- [ ] Rerun **non-app** isolation-check on host. The mount layout now separates
  writable state and readonly proof inputs/snapshots, so the previous six-stage
  pass does not validate the updated layout. Require all six checks PASS.
- [ ] Review that only `/scratch` state and namespace-local tmp/dev/proc resources
  are writable; no full run-root bind, host display or user directory binds exist.
  `/usr`, `/bin`, `/lib`, `/lib64` are trusted read-only system runtime inputs.
- [ ] Confirm no existing Suite/dev process or occupied required port. Doctor
  fails closed on insufficient process/port visibility and does not attach.
- [ ] Review how to handle `cleanup: RETAINED_FOR_REVIEW`. Do not override leases
  or upload retained profiles/raw logs; retained private state can include app
  session material. Only sanitized reason/status/hash evidence belongs in reports.
- [ ] Separately authorize one non-mutating Electron boot/readiness/stop operation
  and removal of the CLI approval gate for that operation. This checklist and the
  earlier preflight pass are not launch authorization. GUI mutations stay false.

Safe owner commands now (runner-only, no Electron):

```bash
nvm use 22.12.0
pnpm build
pnpm format:check
pnpm typecheck
pnpm test
pnpm qa isolation-check
pnpm qa doctor
```

Doctor reads target build inputs and may temporarily bind/close ports; it performs
no target writes or installs. It currently refuses the stale inspected renderer.
A failed check is a blocker, not a reason to relax namespaces or security flags.

## Evidence required during the later approved runtime operation

- [ ] Electron reports actual 41.10.6, package root `/target`, and all overridden
  storage paths at exact private locations before Suite imports/ready.
- [ ] Visible New Project readiness and the contextBridge API are verified with
  fixed read-only queries. No UI action or project create/open/save occurs.
- [ ] Renderer listener belongs to its owned Node PID and RPC listener to owned
  Electron main PID; no token-bearing URL/header is collected.
- [ ] Graceful Electron exit code 0, all owned groups stopped, no other live
  sandbox processes, both ports released, and final containment proof succeeds.
- [ ] Outer wrapper exits and confirms cleanup, with a nonce-bound result and
  sanitized source/asset/desktop/snapshot hashes. Any forced Electron shutdown,
  timeout, inconsistent result or unverified shutdown stays BLOCKED.
- [ ] Confirm enclosing PID-namespace teardown in a failed-start case. Group
  checks alone do not prove termination of descendants that create new sessions.
- [ ] Review runtime evidence before accepting Batch 1; no Batch 2 permission is
  implied. Existing group/start checks are not atomic pidfd signaling, and scratch
  safety does not claim resistance to hostile concurrent same-UID rename races.

Suite window-state save uses an async close listener without preventing close.
A successful boot/quit cannot be treated as proof that its persistence finished;
that behavior is outside this non-mutating launcher acceptance and was not changed.
