# Batch 1 — Owner runtime acceptance and checkpoint (2026-10-17)

**Owner-host functional lifecycle acceptance recorded. Formal isolation review
remains PENDING; no review approval is fabricated.** The owner supplied two real
LIFECYCLE_VERIFIED results, both non-mutating, with matching digests below, plus
130/130 host tests, doctor CHECKS_PASSED and six preflight stages PASS.

Repository-first inspection for Batch 2 found a **clean** local runner at
`38d0ede` (Complete Batch 1 isolated Electron launcher and runtime validation).
That existing focused commit already checkpoints the Batch 1 implementation,
tests, reviewed fixtures and handoffs. There were no uncommitted Batch 1 changes
to commit. No redundant commit, amend, reset, pull or push was performed.
The transcript contains no Git SHA; its test inventory and application digests
are consistent with this checkpoint, not independent proof of runner-code commit
provenance. Existing local staging independently reproduced all four digests:

| Digest | Owner cycles and local staging |
| --- | --- |
| source | 4354da402a02815910d2b49d28a398567ed01abd3c09031270450c05d972997a |
| renderer assets | a45ac412775fa9262bc0f6bb3490a168cf61a285e5bc1a5ee2764145cc7ea964 |
| desktop | 21cde5bc4184881826f97b04a7edd147f62fbe1ce2469667d8dd29403ca66c74 |
| staged snapshot | 3b99eeb81163024c110bf1827295722d20f9b15682209936c9bfbf2f1549de58 |

Before Batch 2 edits: `git diff --check`, typecheck and build/regression tests
passed (130 tests: 129 local passes, one TCP-dependent skip). Current root and
Git toplevel both resolve to `/home/brandenbarnes/Projects/pl-beta-test-runner`;
target realpath is `/home/brandenbarnes/Projects/pl-creators-suite`.
Cached origin/main also points to 38d0ede. Read-only `git ls-remote origin
refs/heads/main` failed because github.com could not resolve; a browser GitHub
lookup also failed. The stated older remote/uncommitted state was not observed
locally. Live remote comparison is unavailable; local source remains authoritative.

The owner separately authorized Batch 2 scratch-only mutations after fresh
runtime gates. That scoped operational authorization does not change the formal
review field, global mutation config default or application security. See the
[Batch 2 handoff](batch-2-handoff.md) for current changes, commands and limits.
Historical BLOCKED records below describe earlier attempts and are superseded
only by the specific owner-host evidence recorded here, not by local GUI proof.

---

# Batch 1 — BrowserWindow export compatibility repair (2026-10-17)

**Repair implemented and unit-tested; runtime acceptance remains BLOCKED pending
one owner-host rerun. Batch 2 remains disabled until two complete non-mutating
Electron lifecycles have succeeded.** Owner reports build/doctor/all six
Bubblewrap stages PASS, followed by PRELOAD_DECLARATION_CAPTURE_UNAVAILABLE.
No live Electron launch was attempted here. Retained scratch leases were untouched.
Prior working-tree changes were preserved.

## Exact failure diagnosis

Read-only byte inspection of the installed Electron 41.10.6 executable found its
embedded `lib/common/define-properties.ts` helper and browser module list. The
list includes BrowserWindow; the helper builds descriptors equivalent to:

```js
{ enumerable: true, get: handleESModule(module.loader) }
```

It calls Object.defineProperties with no configurable flag and no setter. These
are non-configurable accessor exports. The runner tried to replace BrowserWindow
with a data property using Object.defineProperty(..., { configurable: true,
value: wrapper }). Standard JavaScript rejects that replacement with TypeError.
The previous catch collapsed it to PRELOAD_DECLARATION_CAPTURE_UNAVAILABLE.
**Failure occurs during export replacement, before the Proxy can intercept a
constructor.** Changing assignment syntax cannot fix a getter with no setter;
replacing module caches is unnecessary and unsupported. There is no evidence
that BrowserWindow itself cannot be constructed or that preload is disabled.

This is a static diagnosis from the installed binary plus a regression reproducing
its exact descriptor shape, not a live descriptor dump from the host. The old
host report did not expose individual catch branches. No raw process metadata,
application logs or secrets were read. Commands included a Python read-only
search for the helper/browser export list, `sha256sum` for the reviewed source
files, and inspection of complete Suite main/preload and runner staging/bootstrap.

## Replacement verification contract

Constructor interception is removed. No Electron export, module cache, constructor,
BrowserWindow options or preload code is patched or injected. The original
Electron BrowserWindow API is used unchanged.

`src/preload-contract.ts` instead contains explicit SHA-256 pins for the complete
reviewed Suite main and preload files:

- main: `02f9b57581b477f48953d8610b64e82f7c60bf97201e9e4484b28cb8a62a0537`
- preload: `0964512c1529b4c66bea67074baef277a95f902cc3fbc829c2f33970cd31e8d2`

The reviewed main has the one BrowserWindow construction site, imports Electron
normally, and declares path.join(__dirname, 'preload.js') with sandbox and context
isolation true, Node integration false. The reviewed preload exposes plMenu
through contextBridge. These pins are never automatically regenerated. Any source
change, including whitespace or a changed declaration, fails closed and requires
fresh review. Test fixtures preserve these exact reviewed public source bytes;
they contain no real token and are never executed as applications.

Staging writes a nonce-bound, versioned manifest with the complete snapshot digest
at `inputs/preload-contract.json`, outside the target and writable state. Existing
isolation mounts expose this directory read-only. The bootstrap checks canonical
regular main/preload files, reviewed hashes, nonce/schema and full staged tree
hash **before importing Suite main**, then repeats verification on readiness.
The manifest's snapshot digest equals the existing build-evidence snapshot digest.
No filename-only, regex-only or auto-approved declaration inference is used.
The manifest is not a signature from the application owner; it binds the exact
runner-staged bytes for this nonce, while independently pinned source binds the
reviewed declaration.

Runtime readiness still requires the sole actual Suite BrowserWindow through
BrowserWindow.fromWebContents/getAllWindows, exact webContents association/type,
and the fixed renderer origin/path. It checks effective sandbox=true,
contextIsolation=true, nodeIntegration=false and the existing webSecurity rule;
all forbidden-switch checks remain. The undocumented getter remains necessary
for these effective boolean checks and still fails closed when unavailable. Only
its missing preload property can use the independently reviewed snapshot contract.
A present conflicting preload property still fails. Public executeJavaScript
must separately observe the expected plMenu.onMenuAction function, and public
preload-error events still block. Bridge presence alone never proves declaration.
Both proof flags remain required by the supervisor. No UI action is invoked.

New fixed sanitized reasons: PRELOAD_REVIEW_MISMATCH (reviewed file changed),
PRELOAD_SNAPSHOT_INVALID (manifest/nonce/tree mismatch or unavailable evidence).
PRELOAD_FILE_INVALID covers missing/noncanonical/nonregular files. Legacy capture
reason codes remain accepted for old reports but no capture code emits them now.

## Validation and changed files

Using existing Node 22.12.0: `pnpm format`, `pnpm typecheck`, `pnpm test`
(includes build), `pnpm format:check`, `git diff --check`: **PASS**.
Final suite: **130 tests, 129 passed, 0 failed, 1 skipped** (real occupied-port
test skipped because this execution environment denies TCP binding). Tests use
fixtures/fake Electron windows; no live Electron compatibility success is claimed.
Focused regressions cover non-configurable getter replacement failure, verification
without export mutation, changed/removed declarations even with refreshed snapshot
manifests, altered preload bytes, wrong nonce, tree changes, missing files,
symlink escapes, missing bridge, conflicting effective preferences, sanitization,
and existing actual-window/supervisor proof requirements. Staging tests verify
manifest nonce/digest equality with build evidence.

Changed this turn: `src/electron-contract.ts` (removes interception),
`src/preload-contract.ts` (reviewed snapshot verifier), `src/runtime-files.ts`
(read-only-input manifest generation), `src/electron-entry.ts` (async pre-import
and readiness verification), `src/lifecycle-diagnostics.ts`,
`tests/launcher-static.test.cjs`, `tests/fixtures/reviewed-desktop/main.js`,
`tests/fixtures/reviewed-desktop/preload.js`, `docs/batch-1-handoff.md`.
No Suite changes, dependency installation, host security changes, Bubblewrap
relaxation, ownership/cleanup changes, GUI mutations, lease deletion, network
access, commits, pushes or Batch 2 work occurred.

## One host rerun after review

```bash
(
set -euo pipefail
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm build
pnpm typecheck
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa launch
)
```

Share only sanitized CLI JSON; preserve any retained leases. Stop after this one
attempt for review. Effective security, actual bridge execution, graceful exit,
listener ownership/release, no surviving processes, final containment and repeated
successful lifecycle acceptance remain host runtime gates. One successful rerun
would not satisfy the requirement for two complete cycles or authorize Batch 2.
Earlier constructor-interception entries below are historical and superseded.

---

# Batch 1 — Preload verification contract correction (2026-10-17)

**Implemented and unit-tested; live acceptance remains BLOCKED pending one host
rerun and owner review. Batch 2 remains disabled.** Owner reports build PASS,
doctor CHECKS_PASSED, all six isolation stages PASS/PREFLIGHT_VERIFIED, then a
real Electron launch failing PREF_PRELOAD_MISSING. This is evidence that the
undocumented getter omitted that property, not proof of a disabled preload.
No local Electron launch was attempted. All retained scratch leases were left
untouched. Pre-existing working-tree changes were preserved.

## Inspected facts and corrected contract

Read-only inspection of Suite `apps/desktop/main.js` confirms its BrowserWindow
constructor declares `path.join(__dirname, 'preload.js')`, sandbox=true,
contextIsolation=true, nodeIntegration=false, with webSecurity left at Electron's
default. `apps/desktop/preload.js` uses contextBridge.exposeInMainWorld to expose
a frozen `plMenu` object with `onMenuAction`. No handler is invoked by readiness.

Runner `prepareRuntime` copies desktop JS/JSON with before/after/copy digests,
rejects symlinks, and stages main/preload under `/target/apps/desktop`. The staged
package selects `/runner/electron-entry.js`, which imports the staged Suite main.
The existing mount proof requires `/target` read-only without a writable alias.
The intended canonical preload is therefore `/target/apps/desktop/preload.js`.
No Suite source or build files were modified.

Installed Electron 41.10.6 declarations document the absolute-path preload
constructor option and the public webContents `preload-error` event. They do not
document getLastWebPreferences or promise its preload field. The observed host
omission means that field is not a reliable standalone preload oracle for this
configuration. We do not infer how every Electron 41 distribution serializes it,
and do not guess a replacement field or normalize unexpected paths.

Verification now has three independent gates:

1. **Declared configuration:** before importing Suite main, the bootstrap wraps
   the exported public BrowserWindow constructor with a JavaScript Proxy. It
   observes actual arguments, forwards them unchanged to the original constructor,
   and records the returned webContents in a private WeakSet. It requires the
   exact intended preload, safe declared preferences, and an existing regular
   file whose realpath equals the intended path. It does not inject a preload or
   fix application options. Missing/mismatched declaration and invalid file are
   distinct failures. If export wrapping is unavailable or a window bypasses
   capture, launch fails closed. Native constructor interception compatibility
   remains a host runtime gate, not a unit-test claim.
2. **Effective security:** on the sole actual Suite window, the existing guarded
   inspector still requires sandbox=true, contextIsolation=true,
   nodeIntegration=false and rejects webSecurity=false. Command-line bypass
   checks and existing webSecurity default handling are unchanged. Missing or
   failed inspector remains blocked. An absent preload property is accepted
   **only after the captured declaration has been verified for those same
   webContents**; a present contradictory path/type still blocks. Informational
   internal status distinguishes PRESENT from OMITTED_DECLARATION_VERIFIED.
3. **Observable execution:** readiness still independently evaluates
   `typeof window.plMenu?.onMenuAction === 'function'` using public
   webContents.executeJavaScript in the actual Suite page. Only exact boolean
   true passes; no menu action or GUI mutation occurs. A public preload-error
   event blocks with a fixed reason, discarding its raw path/error arguments.
   READY requires both declaration and bridge proof, plus visible UI readiness.
   The supervisor now explicitly requires both proof flags and a recognized
   inspector status; it cannot accept the older single preloadVerified flag alone.

The internal getter's limitation is therefore distinguished from an actually
missing/incorrect declaration or missing bridge. The correction does not claim
that a declaration alone proves execution, nor that bridge presence alone proves
which file was configured.

## Sanitized diagnostics

New fixed reasons: PRELOAD_DECLARATION_MISSING,
PRELOAD_DECLARATION_MISMATCH, PRELOAD_FILE_INVALID,
PRELOAD_DECLARATION_CAPTURE_UNAVAILABLE, PRELOAD_DECLARATION_UNVERIFIED,
PRELOAD_EXECUTION_FAILED. PRELOAD_BRIDGE_MISSING remains separate. Contradictory
inspector values retain PREF_PRELOAD_PATH_MISMATCH/PREF_PRELOAD_TYPE_INVALID;
PREF_PRELOAD_MISSING still applies when no independent declaration is verified.
Sanitized constructor failures also survive asynchronous startup rejection
handling rather than collapsing into generic startup failure. No raw path,
URL, token, environment value, error or application output is added to evidence.

## Validation and files changed this turn

Commands: `pnpm format`, `pnpm typecheck`, `pnpm test` (includes TypeScript build),
`pnpm format:check`, `git diff --check`: **PASS**, using existing Node 22.12.0.
Final suite: **129 tests, 128 passed, 0 failed, 1 skipped**. The occupied-port
runtime test remains skipped because this managed environment denies TCP binding.
No dependencies installed; no extra isolation or live lifecycle probe attempted.

Focused new tests use fake native constructors/windows, not Electron. They cover
argument identity/forwarding, same-window declaration association, missing/wrong
preload, missing file verifier failure, unavailable/replaced capture, omitted
inspector preload with verified declaration, missing bridge, contradictory
inspector values, unsafe security preferences, diagnostic sanitization, and
supervisor rejection of incomplete proofs. A mocked full session accepts the
omitted-inspector case only with both explicit proof flags. Actual native
constructor/export wrapping, preload execution and full shutdown remain untested
locally; no successful isolated Electron lifecycle is claimed.

Files changed in this focused turn: `src/electron-contract.ts`,
`src/electron-entry.ts`, `src/lifecycle-diagnostics.ts`, `src/sandbox-session.ts`,
`tests/launcher-static.test.cjs`, `docs/batch-1-handoff.md`.
No Bubblewrap/mount, process ownership, scratch cleanup or target configuration
changes; no Suite modifications, GUI mutations, lease deletion, network access,
host-security changes, installation, commit, push or Batch 2 implementation.

## One host rerun after owner review

Run in a normal Pop!_OS terminal. This stops on any failed prerequisite and
performs exactly one non-mutating launch attempt:

```bash
(
set -euo pipefail
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm build
pnpm typecheck
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa launch
)
```

Share only sanitized CLI JSON. Do not dump internal files, app output, process
environments or token-bearing URLs, and do not delete leases to rerun. Stop for
review after that attempt. Batch 1 still requires full lifecycle acceptance and
repeatable cleanup before any Batch 2 authorization can take effect.

Earlier entries below are historical; their preload-omission policy is superseded.

---

# Batch 1 — Live security-preference diagnosis (2026-10-17)

**BLOCKED pending host diagnostic rerun; no Batch 2 work.** Owner reports the
first real isolated Electron attempt reached LAUNCH_BLOCKED /
SECURITY_PREFERENCES_INVALID after 120 tests, doctor and six preflight stages
passed. That shared code cannot identify the failed assertion retrospectively.
No local live launch was attempted during this focused change. Retained scratch
leases were not read, deleted, overridden or reused. Prior working-tree changes
from the preceding turn were preserved.

## Exact assertion trace and focused change

`src/electron-contract.ts::initializeElectronPaths` previously emitted the same
code for four command-line switches. Each now has a fixed allowlisted reason:

| Rejected switch | Diagnostic |
| --- | --- |
| no-sandbox | SWITCH_NO_SANDBOX |
| disable-web-security | SWITCH_DISABLE_WEB_SECURITY |
| disable-gpu-sandbox | SWITCH_DISABLE_GPU_SANDBOX |
| disable-setuid-sandbox | SWITCH_DISABLE_SETUID_SANDBOX |

`verifyWebPreferences`, called by `inspectWebPreferences` from the bootstrap's
`did-finish-load`, previously combined these assertions into that same code:

| Assertion | Diagnostic |
| --- | --- |
| sandbox must equal true | PREF_SANDBOX_MISSING or PREF_SANDBOX_INVALID |
| contextIsolation must equal true | PREF_CONTEXT_ISOLATION_MISSING or PREF_CONTEXT_ISOLATION_INVALID |
| nodeIntegration must equal false | PREF_NODE_INTEGRATION_MISSING or PREF_NODE_INTEGRATION_INVALID |
| webSecurity must not equal false | PREF_WEB_SECURITY_DISABLED |
| preload must equal the staged absolute script path | PREF_PRELOAD_MISSING, PREF_PRELOAD_TYPE_INVALID or PREF_PRELOAD_PATH_MISMATCH |

The original predicates and order are preserved. In particular, the existing
webSecurity default handling is unchanged. Missing sandbox/contextIsolation/
nodeIntegration values are never inferred safe. Missing/failing native inspection
still gives PREFERENCE_INSPECTION_UNAVAILABLE. The legacy generic reason remains
allowlisted for older reports; these assertions no longer emit it.

The bootstrap now verifies BrowserWindow.fromWebContents identity, exact
webContents association, sole non-destroyed BrowserWindow, webContents type
`window`, and the known renderer origin/root path before inspecting preferences.
Failures are SUITE_WINDOW_IDENTITY_INVALID or SUITE_WINDOW_LOCATION_INVALID.
Actual Suite `main.js` creates one BrowserWindow and loads localhost:5173 with
RPC query parameters. Those parameters are ignored for location identity and
never logged. No title/URL/path/preference dump or raw application output is
recorded. This identity logic is **unit verified, not yet runtime verified**.

## Electron 41 evidence and limits

Read-only inspection of the installed Electron declaration file confirms preload
is specified as an absolute file-path string; sandbox defaults true since
Electron 20. Actual Suite source explicitly sets sandbox/contextIsolation true,
nodeIntegration false, and preload via path.join(__dirname, 'preload.js'). It
omits webSecurity. Its staged entry point implies the existing expected absolute
preload path. getLastWebPreferences remains an undocumented guarded native getter.
The declarations do **not** establish how that getter serializes preload at
runtime. No independently justified path-normalization correction was found.
File URLs, objects, alternate paths and lexical aliases therefore remain rejected.
**Whether Electron 41 normalizes this getter's output, and which assertion
actually failed, remain unverified until the host rerun.** No sandbox/security
switch or containment boundary was relaxed to accommodate a hypothesis.

## Validation and changed files for this focused turn

- `pnpm format`, `pnpm typecheck`, `pnpm test` (includes build),
  `pnpm format:check`, `git diff --check`: PASS. Final suite: 124 tests,
  **123 passed, 0 failed, 1 skipped**. The real occupied-port test is skipped
  because the managed execution environment forbids TCP binding; simulated
  conflict tests still ran.
- Focused tests cover all four switches, each unsafe/missing preference,
  unsupported preload representations, actual-window association, ambiguous
  windows, incorrect origin/path, secret-bearing query suppression, and diagnostic
  propagation through session/public sanitizers. All use fakes, not Electron.
- Files changed this turn: `src/electron-contract.ts`, `src/electron-entry.ts`,
  `src/lifecycle-diagnostics.ts`, `tests/launcher-static.test.cjs`, this handoff.
- No Suite writes, installations, host security changes, raw evidence capture,
  external network access, GUI mutations, lease deletion, commits or pushes.

## Host rerun and remaining gate

In a normal terminal, after owner review:

```bash
(
set -euo pipefail
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm build
pnpm typecheck
pnpm test
pnpm qa doctor
pnpm qa isolation-check
pnpm qa launch
)
```

Share only the sanitized CLI JSON. Do not print raw electron-status files,
URLs, process environments, application logs or token-bearing data. Do not
remove leases to rerun. A more specific failure is diagnostic progress, not
acceptance. Batch 1 still requires two successful full lifecycles, security and
preload readiness, owned listeners, graceful shutdown, clean process/port
release, final containment and unchanged input evidence. Stop after this focused
rerun for review; Batch 2 remains disabled.

---

# Batch 1 — Authorized runtime acceptance attempt (2026-10-17)

**Acceptance BLOCKED in the Codex execution environment. Batch 2 NOT STARTED.**
The owner authorized two non-mutating isolated Electron boot/stop cycles against
only `~/Projects/pl-creators-suite`. That authorization is now implemented at
the CLI boundary; alternate target paths and symlink redirects are refused.
`run` remains blocked, `allowGuiMutations` remains false, and configuration still
explicitly says unverified. No Electron launch was attempted after infrastructure
checks failed. No Suite changes, dependency installations, host-security changes,
commits, pushes, GUI mutations or external network access occurred.

## Evidence and commands executed

Owner-supplied host evidence: Node 22.12.0 / pnpm 10.31.0; 120/120 tests;
refreshed renderer; doctor CHECKS_PASSED; isolation-check PREFLIGHT_VERIFIED with
all six stages passing; Xvfb available. These reports establish host preflight,
not an accepted live Electron lifecycle.

Local commands used Node 22.12.0 through its existing nvm binary directory on PATH:

- `pnpm qa environment`: DIAGNOSTIC_ONLY, TCP DENIED_EPERM, seccompMode=2,
  noNewPrivileges=1. No target launched.
- `pnpm qa isolation-check`: exit 3, OWNERSHIP, “Scratch still has an active or
  unconfirmed process; cleanup refused.” The final cleanup refusal masks the
  earlier startup diagnostic, so **no specific Bubblewrap-stage failure is
  asserted for this attempt**. Retained `.scratch/run-R8Cads` and its process lease
  were not removed, overridden or reused. Unconfirmed ownership is not evidence
  of a live remaining process. Its disposition requires separate investigation.
- `pnpm qa doctor`: exit 3, PORT_UNAVAILABLE, required listener port cannot be
  checked in this environment. This independently prevents Electron startup.
- `pnpm format`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`: PASS.
  Test command builds TypeScript first. 120 tests: **119 passed, 0 failed,
  1 skipped** (real occupied-port test requires TCP binding). Conflict/ownership
  simulations still ran. Electron session tests are mocks, not runtime proof.
- Read-only review of AGENTS.md, blueprint, Batch 0 discovery, prior Batch 1
  handoff/checklist, CLI, launcher, isolation, process ownership and runtime-file
  contracts; `git status --short` and `git diff` review.

No host-user profile/project inventory was taken. Source/profile unchanged
claims for a complete live lifecycle remain **unverified**, because none ran.
The runner's unchanged isolation model still requires empty root, private
namespaces/network/HOME/XDG/TMP, private Xvfb, read-only inputs, sandboxed
Electron, strict ownership and final containment checks. These requirements
were not relaxed to work around execution restrictions.

## Files changed

- `src/launch-authorization.ts`: narrow canonical adjacent-checkout authorization.
- `src/cli.ts`: replaces obsolete approval refusal with authorization check and
  the existing non-mutating isolated lifecycle.
- `src/launch.ts`: updates obsolete CLI-gate comment; lifecycle unchanged.
- `tests/launcher-static.test.cjs`: replaces obsolete refusal assertion with
  positive canonical-path and negative alternate/missing/symlink-target tests.
- `README.md`, `docs/batch-1-handoff.md`,
  `docs/pre-launch-acceptance-checklist.md`, `docs/batch-2-handoff.md`: status,
  authorization, host procedure and remaining gates. No target config changes.

## Exact host procedure

Run in a normal Pop!_OS terminal, with no other Suite/dev instance running.
These commands do not install or rebuild anything in the Suite checkout. Execute
as one subshell so any failed prerequisite stops the procedure. Do not delete a
retained process lease to obtain a pass. Each launch performs its own doctor and
full preflight before Electron, then bounded readiness and shutdown checks.

```bash
(
set -euo pipefail
cd ~/Projects/pl-beta-test-runner
nvm use 22.12.0
pnpm --version
pnpm build
pnpm typecheck
pnpm test
pnpm qa doctor
pnpm qa isolation-check
node <<'NODE'
const assert = require('node:assert/strict');
const path = require('node:path');
const {loadConfig} = require('./dist/config');
const {assertApprovedLaunchTarget} = require('./dist/launch-authorization');
const {inspectRendererBuild} = require('./dist/runtime-files');
const {launch} = require('./dist/launch');
const {publicError} = require('./dist/errors');
(async () => {
  const root = process.cwd();
  const config = await loadConfig(path.join(root, 'config/example.target.json'));
  await assertApprovedLaunchTarget(config.targetRoot, root);
  const before = await inspectRendererBuild(config.targetRoot);
  for (let cycle = 1; cycle <= 2; cycle++) {
    const result = await launch(config, root);
    assert.equal(result.status, 'LIFECYCLE_VERIFIED');
    assert.deepEqual(await inspectRendererBuild(config.targetRoot), before);
    console.log(JSON.stringify({cycle, status: result.status,
      consumedInputsUnchanged: true, guiMutations: 'DISABLED'}));
  }
})().catch(error => {
  console.log(JSON.stringify(publicError(error)));
  process.exitCode = 3;
});
NODE
)
```

Only fixed status JSON is printed by the Node procedure; assertion details,
raw app output, RPC tokens, environment values and profiles are not saved.
The digest comparison covers inspected source/configuration inputs, desktop
runtime files and built renderer assets; it is **not** a full checkout or host
profile audit. The lifecycle verifies visible DOM readiness on private Xvfb,
not a human-observed host desktop window. On failure, stop and share only the
sanitized status; preserve leased scratch for review.

## Remaining acceptance gates

- Both actual cycles must report LIFECYCLE_VERIFIED, with visible New Project
  readiness, actual preload/security checks, exact renderer/RPC ownership,
  graceful exit 0, released private ports, no remaining live sandbox processes,
  and final filesystem isolation verification. None are locally runtime-verified.
- Confirm consumed inputs unchanged and assess whether further read-only checkout
  integrity evidence is needed. Host writable-location exclusion remains a
  runtime containment gate, not a claim from inspecting normal user data.
- Review both sanitized results before accepting Batch 1 and enabling any Batch 2
  mutations. Current config remains unverified and GUI mutations disabled.
- Batch 2 selectors, Playwright compatibility, projects, navigation, persistence
  and negative UI behavior have not been exercised. No Batch 3 work is authorized.

Earlier entries below are historical; their approval-gate statements are superseded.

---

# Batch 1 — Final launcher static review (historical)

**Static corrections delivered; runtime acceptance BLOCKED; awaiting owner review.**
No Electron/Suite launch, GUI mutation, external network access, target mutation,
installation, host security change, commit, push or Batch 2 work occurred. The
CLI launch command now explicitly refuses until separately approved. Local tests
of that command exercise the refusal only. Earlier records below are historical.

See [pre-launch acceptance checklist](pre-launch-acceptance-checklist.md).

## Owner evidence and applicability

Owner reports Node 22.12.0, build PASS, 96/96 tests PASS, Xvfb installed, all six
preflight stages PASS and PREFLIGHT_VERIFIED/reviewed=false, with implementation
pushed to GitHub. These are owner-supplied results for the previous revision.
No GitHub/network verification was attempted. Local initial runner HEAD was
`d8f2926` and the worktree was clean. No Electron lifecycle was reported or run.

This review changes private state/input mounts and requires a fresh **non-app**
host preflight before approving a first launch. Earlier preflight success is not
proof of an entire live Electron lifecycle or this revised mount layout.

## Findings resolved in runner code

1. **Application-path contract:** direct app.setAppPath is absent from public
   Electron 41.10.6 declarations (although used internally by the installed
   default app). The runner now stages a package wrapper with main pointing to
   the bootstrap, launches `/target` as a directory, and verifies getAppPath and
   isPackaged rather than calling that internal setter itself.
2. **Storage initialization:** documented home/appData/userData/sessionData/temp/
   crashDumps setters run before ready and before target imports, with directories
   created first and exact getPath equality checked. Home is redirected to and validated against
   private HOME; logs use the supported explicit setAppLogsPath. Version/security
   bypass checks precede target imports. Runtime compatibility remains untested.
3. **Writable aliases:** `/target` used to be reachable through writable
   `/scratch/target`; generated readonly hosts/proof inputs also had writable
   scratch aliases. Only run/state is now bound to `/scratch`; target is outside
   that binding, and generated inputs are separately readonly at /isolation-inputs.
   Ownership markers, leases and build evidence stay outside guest writable state.
4. **False shutdown success:** a forced Electron stop previously could lead to
   lifecycle success. Graceful exit 0 is now required; timeouts/nonzero exits are
   blocked. A failed stop request no longer skips other owned shutdown attempts.
5. **Cleanup uncertainty:** leases now precede process spawn. Identity failures,
   malformed results and unverified inner shutdown retain private scratch and its
   lease. Reports include cleanup=RETAINED_FOR_REVIEW. A known exec failure with
   no child can release its lease; confirmed complete shutdown permits cleanup.
6. **Result/containment checks:** lifecycle results are versioned, nonce-bound,
   schema-checked and require completed shutdown for success. Ports and remaining
   live processes are checked before final isolation/application-mount revalidation.
   Both /target and /electron must have effective readonly mounts.
7. **Readiness deadline:** a never-settling condition previously defeated waitFor's
   deadline. Async conditions now have bounded waits; port preflight also bounds
   closure and destroys unsolicited probe connections. The outer lifecycle deadline
   allows the display, renderer, Electron readiness and shutdown budgets.
8. **Stale build:** actual inspected index timestamp is Oct 2; actual App.tsx is
   Oct 15. Read-only freshness inspection now refuses outputs predating tracked
   source/configuration inputs. No Suite rebuild was run. SHA-256 source, asset,
   desktop and staged snapshot digests bind evidence to content; timestamp passes
   explicitly remain provenance=NOT_PROVEN. Source changes during staging and
   symlink/hidden input escapes are rejected.
9. **Diagnostics:** bootstrap, display, renderer, RPC readiness, graceful exit,
   process cleanup, final containment and result failure codes are allowlisted.
   Public reports contain no raw error, profile path, URL, RPC token or environment.
   Bootstrap checks effective security and the actual preload bridge with fixed
   read-only queries. Unhandled startup failures are converted to fixed codes.

## Static integration conclusions

- Installed Electron 41.10.6 public declarations and embedded default package
  loader were inspected locally as data, without requiring or launching Electron.
  Setter timing and existing-directory requirements are enforced. Supported API
  use is statically established; actual sandbox nesting/preload/graphics startup
  is not empirically established.
- Suite main/preload source is unchanged: explicit sandbox=true,
  contextIsolation=true, nodeIntegration=false, allowlisted plMenu bridge, local
  renderer URL. Runtime checks now verify both preferences and bridge readiness. The native
  getLastWebPreferences getter is not publicly declared; its name is present in
  the local binary, but callable compatibility is unverified. A missing/unusable
  getter now blocks with PREFERENCE_INSPECTION_UNAVAILABLE, never assumed security.
- RPC is started inside Electron main by ensureRpcServer, with one memoized server;
  backend binds 127.0.0.1:38741. Expected owner is the Electron main PID, not an
  independent backend child. Renderer owns its separate 127.0.0.1:5173 listener.
  Listener evidence checks socket inode and PID/start identity, including a second
  identity check after descriptor inspection.
- Normal home/projects/profiles/credentials and host display/IPC sockets are not
  mounted. Only trusted system runtime trees and selected inputs are readonly;
  private state and namespace-local tmp/dev/proc resources support app execution.
  No security fallback or network-sharing option was introduced.
- Every input stays readonly throughout the planned lifecycle; final proof is
  rerun after stopping all children. Descendants that create sessions are covered
  by the enclosing PID namespace plus final census, not by process groups alone.
  Actual namespace teardown still needs the separately approved runtime evidence.
- Suite async window-state close handling does not guarantee persistence completed
  before quit. This review does not change it or claim persistence validation.

## Validation and exact commands/results

Commands used installed Node 22.12.0 through explicit PATH; no install/update or
network command was used.

| Command/check | Result |
| --- | --- |
| Read AGENTS, blueprint, discovery, previous handoff and runner modules | Completed |
| Read Suite main/preload/backend/storage/metadata sources | Inspection only |
| Read Electron declarations, version and embedded default_app.asar text | 41.10.6; public setters and package-root loading confirmed statically |
| `stat` source and renderer index | Source newer than build, as above |
| Read-only `inspectRendererBuild('../pl-creators-suite')` | Exit 3, CONFIG: stale renderer; no target code executed |
| `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` | Exit 0 |
| Final `pnpm test` | Exit 0: **120 tests, 119 passed, 0 failed, 1 skipped** |
| `node dist/cli.js launch` | Exit 3, LAUNCH_BLOCKED: separate owner approval required; no target loaded |
| `git diff --check` | Exit 0 |

Local generated evidence: `artifacts/batch-1-static-review-tests.tap` (ignored).
Real runner tests use disposable files and owned Node children; the inherited
real bwrap probe tests fail-closed behavior, not a target launch. The live TCP test
is skipped only for agent-context EPERM. All new Electron API/session integration
checks use mocks; they never spawn Electron, Xvfb or Suite backend processes.

New regressions cover public path/log setter sequencing and exact verification,
unsupported app identity/version/security, preload preferences, missing/readonly
application mounts, readonly input aliases, stale build refusal, wrapper metadata,
query/traversal/symlink asset confinement, nonsettling deadlines, approval refusal,
forced quit rejection, stop-request failure, all-child shutdown attempts, and
lease/scratch retention versus verified cleanup. One initial gate test assumed
child stdout pipes would be relayed here; it was corrected to capture the fixed
CLI result in a runner-owned temporary file. No application defect was inferred
from that test-environment behavior.

## Files changed

Added: `src/electron-contract.ts`, `src/lifecycle-diagnostics.ts`,
`tests/launcher-static.test.cjs`, `docs/pre-launch-acceptance-checklist.md`.

Updated: `src/cli.ts`, `src/doctor.ts`, `src/electron-entry.ts`, `src/errors.ts`,
`src/isolation-proof.ts`, `src/isolation.ts`, `src/launch.ts`, `src/processes.ts`,
`src/renderer-server.ts`, `src/runtime-files.ts`, `src/sandbox-session.ts`,
`tests/acceptance.test.cjs`, `tests/isolation-diagnostics.test.cjs`,
`tests/safety.test.cjs`, `README.md`,
`docs/batch-1-handoff.md`.

Generated: rebuilt ignored dist and local test evidence. No target files,
configuration, dependencies, lockfiles, runner package files, AGENTS, blueprint
or Git metadata changed. No commit or push. All unexpected findings are listed
above, including stale assets, writable aliases, the internal preference-inspection
API limitation and the test stdout limitation.

## Remaining gates / stop

**Do not launch yet.** Owner review must address stale renderer provenance through
normal Suite workflow, new runner test results, renewed host isolation-check for
separated inputs/state, exact build hashes and the pre-launch checklist. Then a
separate approval may authorize removing the CLI gate and performing one
non-mutating Electron lifecycle validation. That runtime must demonstrate security,
preload, actual listener ownership, graceful exit, complete namespace/process/port
teardown and cleanup. Live runtime, Playwright integration and persistence remain
untested. Batch 2 and GUI mutations remain unauthorized. Stop for owner review.

---

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
