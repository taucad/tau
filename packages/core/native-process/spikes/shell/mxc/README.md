# Spike W2 — Windows MXC `processcontainer` S1 isolation

Dev-only evidence harness for the desktop Bash/Terminal blueprint, ratification §RQ5. It proves (or
records the typed infeasibility of) the ratified Windows `ShellProvider` target: **Microsoft MXC
(Microsoft eXecution Containers) `processcontainer`** over the Windows process security environment
(PSEC), on `windows-2025` (hosted Server 2025, build ~26100 / 24H2-equivalent).

Nothing here is shipped or exported by the package. The workflow is
`.github/workflows/spike-w2-win-mxc.yml` (workflow_dispatch only, ref-keyed concurrency with
cancel-in-progress false). The scripts are standalone so the Win11 Eval VM lane reuses them.

## D14: PowerShell on Windows (blueprint D14, Brain f1b7c6df)

The Windows shell is **PowerShell, not Git Bash** (operator ruling 2026-10-23T03:09Z). The tool is
one `shell` tool whose description names the host language + major version; grammar tests split into
**T02-bash** (macOS/Linux) and **T02-pwsh** (Windows), while containment cases stay language-neutral.

- **Shell resolution — FIXED PATHS ONLY, never PATH** (`shell-identity.ps1`, mirrored in
  `mxc-lib.mts resolveWindowsShell`): pwsh 7 at `%ProgramFiles%\PowerShell\7\pwsh.exe` wins when
  present, else Windows PowerShell 5.1 at `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`.
  WindowsApps aliases, profile-path copies and `.cmd`/`.bat` shims are refused. `ShellIdentity`
  (kind + version + digest) is recorded in **every** receipt.
- **Launch argv** `-NoLogo -NoProfile -NonInteractive -Command`, with **no `-ExecutionPolicy`
  override** — the machine/GPO policy applies; a blocked script is an ordinary nonzero `completed`,
  not an error. Terminal pane uses `-NoLogo -NoProfile` over ConPTY.
- **Git Bash is not offered on Windows**: the in-MXC shell, the preflight sentinel, the isolation
  commands and the reaping writers are all PowerShell. Prior Git Bash receipts (spike-w1, the Win11
  SRT row) remain as historical evidence only.

### Hosted-collectable D14 receipts (windows-2025)

| receipt          | file                          | what it proves                                                                               |
| ---------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| ShellIdentity    | `shell-identity.receipt.json` | both resolution branches: pwsh 7 present, and forced 5.1 (`-HidePwsh7`)                      |
| T02-pwsh grammar | `grammar.receipt.json`        | here-string, pipeline, subexpression, exit code (gated); `&&`/`\|\|` + Unicode characterized |
| PTY              | `pty.receipt.json`            | interactive PowerShell over a real ConPTY terminal (marker echoed back, external)            |

The isolation receipt's new **reaping** case proves a detached native `.exe` child, a PowerShell
`Start-Job`, and a `Start-Process` writer are ALL reaped when the foreground PowerShell exits. The
restricted-token fallback (below) is receipted on both hosted rows.

## What is pinned (`pin.json`)

| Field              | Value                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Node SDK           | `@microsoft/mxc-sdk@1.0.1` (publishers `microsoft1es`, `microsoft-oss-releases`)                  |
| Licence            | **MIT**                                                                                           |
| Registry integrity | `sha512-2cP925G5+lQyKzjBVha8uNtVd7XESgDBtgi1yCYYSo9M3xiFyZWtCO4SWPGTk509rdI6nqjyGcZxvEP3t6l8Hg==` |
| Registry shasum    | `f1a4859f7810b34f01a238c98166012a5d63a3fb` (re-verified against the downloaded tarball)           |
| Entry              | `@microsoft/mxc-sdk/v1`                                                                           |
| Runtime deps       | `koffi` (FFI), `semver`, `node-pty`                                                               |
| Node engine        | `>= 24.0.0`                                                                                       |
| Spec upstream      | `github.com/microsoft/mxc` revision `b2112016…` (ratification §RQ5, Brain commit `96d2e015`)      |

`provision.mts` binds the receipt to **real bytes on the host**: it records the installed version
(gated `== 1.0.1`), the MIT licence, the registry integrity/shasum from `pin.json`, and the SHA-256
of the resolved native `wxc-exec` executable (`findWxcExecutable()`), which is the binding digest
over and above the registry integrity.

> The ratification pins the upstream `microsoft/mxc` **source** at `b2112016…`. The artifact Tau
> actually consumes is the published Node SDK above; that is what is pinned and digested here.

## The real SDK surface this harness targets (`@microsoft/mxc-sdk/v1`)

Confirmed from the pinned package's own type declarations:

- `getPlatformSupport() → { isSupported, availableMethods, isolationTier, uiCapabilities }`
- `getAvailableBackends() → AvailableBackend[]`
- `probe(request?) → { tier, needsDaclAugmentation, warnings, probes: ProbeFacts }` (Windows-only,
  synchronous, creates no container)
- `run(ContainerRequest) / spawnWithPty(...)` — the **one-shot** APIs the `processcontainer` backend
  uses (`destroyOnExit`, kill-on-close)
- `ContainerRequest.containment = { type: 'processcontainer', config }`,
  `filesystem: { readwritePaths, readonlyPaths, deniedPaths, clearPolicyOnExit }`,
  directional `network: { egress, ingress: { hostLoopback } , runtimeConfig: { networkProxy } }`

`ProbeFacts` carries the capability facts this lane reports, notably
`baseContainerApiPresent` (PSEC API present), **`baseContainerSupportsDenyPaths`** (the
`PSE_SUPPORT_FS_DENY` capability), `baseContainerSupportsIdentitylessLoopbackProxy`,
`baseContainerSupportsIngressHostLoopbackAllow`, and `isolationSessionAvailable`.

## Evidence discipline

- **External observation only.** Every allow/deny verdict is decided by an out-of-container
  observer — a file digest the harness placed on the host, or a credential-authenticated loopback
  listener's own request log — never by a trusted in-container error string or exit code.
- **Preflight sentinel.** `probe.mts` launches a real `processcontainer` whose child writes a nonce
  to an out-of-container read-write path; the probe counts as "ran inside a container" only when the
  host sees that nonce. An unavailable prerequisite is a typed `{ available: false, reason }` state
  and a **failed** check — never a skip, never an unsupported-platform green.
- **Positive controls.** `isolation.mts` first proves each container CAN read/write its own roots and
  reach its own proxy, so "everything denied because the container did nothing" cannot masquerade as
  isolation.
- **Receipts** (`$RUNNER_TEMP/mxc-spike/*.receipt.json`) bind MXC revision + SDK digest + licence +
  OS build + source SHA to every observation.

## The isolation receipt (`isolation.mts`) — two concurrent containers

Sessions A and B run **concurrently** (two live containers), each with its own read-only /
read-write / deny lists, private HOME and temp, an approved folder, and its own proxy canary:

| check             | proven by (external)                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `iso.read.cross`  | A's exfiltration output never contains B's secret, and vice-versa                                |
| `iso.write.cross` | B's secret-file digests unchanged and no tamper file in B's roots, and vice-versa                |
| `iso.proxy.cross` | the OTHER session's listener logs a refusal (401) and never releases its secret                  |
| `iso.reaping`     | a session-escaping, TERM-ignoring writer's sentinel **stops growing** after the foreground exits |

`iso.proxy.cross` exercises the **Tau-side** proxy-auth requirement, not MXC: MXC shares loopback
bidirectionally between containers, so denial comes from the per-session bearer token, proven by the
other listener's log. The two proxies are distinct credential-authenticated loopback canaries.

When `baseContainerSupportsDenyPaths` is **false**, `deniedPaths` are omitted from the request and
`iso.read.cross` is annotated: the read isolation then reflects the ambient DACL, not an MXC deny
list — a typed limit, not a silent pass.

## Fallback (`fallback.mts` + `fallback.ps1`) — the default Windows backend

PSEC is **not available** on either hosted row (see the probe's `psecBackend`), so the Codex
restricted-token model (`openai/codex` `codex-rs/windows-sandbox-rs`) is the default backend. The
earlier AppContainer capability-SID model (`DeriveCapabilitySidsFromName` SIDs as restricting SIDs)
was wrong: those SIDs are not valid restricting SIDs and `CreateRestrictedToken` returned
`ERROR_INVALID_SID`. It is kept only as the documented rejected alternative in `fallback.ps1`.

What `fallback.ps1` builds, per session:

- a **random `S-1-5-21-…` cap SID** (`cap.rs` `make_random_cap_sid_string`) used as a restricting SID
  of a **`WRITE_RESTRICTED`** token: flags `DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED`
  = `0x0D` (`token.rs:500`), with the default DACL and `SeChangeNotifyPrivilege` set as Codex does
  (`token.rs:56-110`, `518-519`); the token is LUA-filtered, never elevated;
- a **private desktop** plus a window-station ACE for the session SIDs (`desktop.rs`), all revoked at
  teardown (`fallback.grants.revoked`: window-station DACL restored byte-for-byte, desktops closed);
- ALLOW-write ACEs for the cap SID on the session roots and deny-read ACEs on the other session and
  the never-grantable set (`acl.rs`);
- two non-admin **sandbox users** provisioned with elevation; the workload always runs as them.

Every denial counts only when a child **running inside its restricted token** attempts the cross
access, is refused, an external canary confirms nothing leaked or landed, and the **same child**
passed its own-root positive control in the same run. Otherwise the check reads `NOT EXERCISED` and
fails; `summarize.mts` also flags any such vacuous pass as an integrity violation. Orchestrator
impersonation results are recorded as `info` only.

| check                                 | proven by                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fallback.write.ownAllowed.*`         | each pwsh child (same account, different cap SID) writes its own root                                                                                                           |
| `fallback.write.crossDenied.*`        | the same child's write to the other root is refused; no canary lands there                                                                                                      |
| `fallback.read.ownAllowed.*`          | each cmd.exe child, as its own sandbox user, copies its own secret out (exact match)                                                                                            |
| `fallback.read.crossDenied.*`         | the other session's secret never appears in that child's exfil file                                                                                                             |
| `fallback.read.neverGrantable`        | the never-grantable secret never appears in either child's exfil file                                                                                                           |
| `fallback.pwsh.{write,read}.*`        | pwsh re-runs the write/read isolation proofs as the sandbox user in the token (external canaries, own-root controls)                                                            |
| `fallback.s2Pty.inContainer` (S2 PTY) | `token-runner.exe` (PTY mode) owns the ConPTY; pwsh (the D14 Windows shell) runs in the token, driven through it (tty, resize, Ctrl-C, PSJob control, UTF-8, containment probe) |

S2's shell is **pwsh** (the ratified D14 Windows shell), and its PTY master is the **unrestricted
runner** (`token-runner.cs` PTY mode, Codex `conpty/mod.rs` shape), not node-pty: both node-pty and
MSYS Bash fail to CREATE a pipe inside the write-restricted token (ConPTY `EPERM`; Bash "couldn't
create signal pipe", Win32 error 5; run 40041468455). So the runner creates the pseudoconsole and
pipes, spawns pwsh in the token attached via `PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE`, and drives
tty/resize/Ctrl-C/UTF-8 plus a containment probe from the terminal stream. The S2 checks mirror
Linux/macOS: a real tty (`Console.IsInput/OutputRedirected` both false), `ResizePseudoConsole` to
40x100, Ctrl-C (0x03) interrupting a foreground `Start-Sleep` under 10s, and a UTF-8 round-trip.
Because pwsh has no POSIX job table, job control maps to the PSJob cmdlets (`Start-Job`/`Stop-Job`,
State `Running`→`Stopped`), and POSIX fg/bg + Ctrl-Z suspend are recorded honestly as info rows, not
pass/fail. The containment probe writes an own-root canary (a dir whose ACL grants the token's cap)
holding a synthetic nonce and is refused a deny-root (granted only the other cap); the orchestrator
confirms both on disk. The S2 receipt (`fallback-s2-pty.receipt.json`) is attributed to the sandbox
user by both the runner (`identity.runnerUser`) and the pwsh inside the pty (`identity.shellWhoami`);
the UTF-8 bytes pwsh wrote are re-read by the orchestrator. `WRITE_RESTRICTED` gates writes only, so
read isolation rests on distinct sandbox users plus deny-read ACEs.

### Codex token/spawn parity (recorded in the receipt as `fallback.codexParity`)

The earlier stalls were a spawn-shape difference from Codex, not a token-rights difference. Diffed
against `openai/codex` `codex-rs/windows-sandbox-rs` (read as reference, not vendored):

| aspect             | before                                         | now (Codex-shaped)                                                                          |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| spawn API          | `CreateProcessWithTokenW` from the admin       | unrestricted runner (`CreateProcessWithLogonW`) → `CreateProcessAsUserW` from its own logon |
| default DACL       | same (logon SID `GA` + `OWNER RIGHTS` `RC`)    | same                                                                                        |
| restricting SIDs   | cap, logon, Everyone; logon from `LogonUser`   | same set; logon is the runner's own `CreateProcessWithLogonW` logon                         |
| handle inheritance | none                                           | `bInheritHandles=TRUE`, `STARTF_USESTDHANDLES`, `PROC_THREAD_ATTRIBUTE_HANDLE_LIST`         |
| job object         | none                                           | `PROC_THREAD_ATTRIBUTE_JOB_LIST`, `KILL_ON_JOB_CLOSE`, no `JOB_OBJECT_UILIMIT_*`            |
| `lpDesktop`        | explicit `WinSta0\<private desktop>`           | same (unchanged)                                                                            |
| creation flags     | `CREATE_NO_WINDOW\|CREATE_UNICODE_ENVIRONMENT` | `+ EXTENDED_STARTUPINFO_PRESENT` (STARTUPINFOEX)                                            |
| environment        | `LoadUserProfile` + `CreateEnvironmentBlock`   | explicit runner env (seclogon, no profile) + TEMP/TMP                                       |
| error mode         | none                                           | `SetErrorMode(SEM_FAILCRITICALERRORS\|SEM_NOGPFAULTERRORBOX)` around the launch, inherited  |
| startup feedback   | none                                           | `STARTF_FORCEOFFFEEDBACK` on the runner launch                                              |

Observed status: with the Codex-shaped runner, **PowerShell now starts** as the sandbox user inside
the write-restricted token (`fallback.pwsh.startsInToken`, run 40037048316), and the write and read
isolation proofs re-run with pwsh as the in-token workload (external canaries + own-root controls),
alongside the cmd.exe read proof; every grant is revoked. `node.exe` (`os.userInfo()` → `ENOMEM`, no
loaded profile) and MSYS `bash.exe` (signal-pipe Win32 error 5) still cannot create a PTY-master pipe
inside the token, which is why the runner, not node-pty, owns the ConPTY for S2.

Run 40041468455 (both rows): pwsh start, pwsh write isolation and pwsh read isolation pass, and every
grant is revoked. The runner-owned ConPTY works, but **S2 with MSYS Bash is not provable**: Bash
itself creates its Cygwin signal pipe at startup and the write-restricted token is refused (`couldn't
create signal pipe`, Win32 error 5), whoever owns the PTY. Since D14 makes PowerShell the Windows
shell, S2 now drives **pwsh** in the runner-owned ConPTY (the D14 bar): the same tty/resize/Ctrl-C/
UTF-8 checks as Linux/macOS, PSJob-mapped job control with POSIX fg/bg + Ctrl-Z recorded as info, and
an in-PTY containment probe confirmed externally.

Run 40045912771 (both rows, pwsh 7.6.7): pwsh start, tty, resize (`40 100`), PSJob control, UTF-8
round-trip, the in-PTY own-root write and deny-root refusal (`UnauthorizedAccessException`), the
external containment check and grant revocation all pass. **Ctrl-C failed**: `0x03` did not interrupt
the foreground `Start-Sleep -Seconds 30`, with no `^C` in the transcript, and the typed-ahead
marker only ran after the sleep finished (~22s). The likely cause was the "ignore CTRL_C" console
flag, which children inherit. The runner now calls `SetConsoleCtrlHandler(NULL, FALSE)` before
`CreateProcessAsUser`. The pwsh spawn flags are `0x80400` (`CREATE_UNICODE_ENVIRONMENT |
EXTENDED_STARTUPINFO_PRESENT`) with no `CREATE_NEW_PROCESS_GROUP`, which would also disable Ctrl-C.
Both facts are recorded as the `s2.ctrlc.setup` info row.

Run 40046797357 (both rows, with that fix): **Ctrl-C passes**. `0x03` interrupts the foreground
sleep and the prompt returns in about 2.0s (`elapsedMs` 2016 on windows-2025, 2047 on
windows-11-arm). In the transcript the next prompt and `CC_DONE` follow the `Start-Sleep` line
straight away. Every other S2 check still passes, and `fallback.s2Pty.prereq/exit/containment/
inContainer` and the fallback receipt pass on both rows. The jobs stay red only on the
pre-existing MXC probe gate: `mxc.psec.createClose` on both rows, and the absent base-container API
/ isolation session on windows-2025. Those rows fail the same way as in the previous run.

## Running

CI: `workflow_dispatch`, or any PR touching `mxc/**` or the workflow. The job installs the pinned
SDK, provisions, probes, then — gated on the probe — collects either the isolation receipt or the
capability-SID fallback, summarizes to the step summary, and uploads the receipts. The row never
goes green on an absent prerequisite.

Local (Windows, Node ≥ 24): `npm install` in this directory, then
`node provision.mts && node probe.mts && node isolation.mts` (or `node fallback.mts`).

## Empirical result (hosted `windows-2025`, run 39891664815; superseded for PSEC by later runs)

Probe reported `PSEC=false denyPaths=false conpty=true`: the MXC **base-container (PSEC) API is not
present** on the GitHub-hosted Server 2025 runner (ConPTY works). This is a legitimate typed-
unavailable finding (the probe fails closed, not a bug): the two-container `processcontainer`
isolation receipt is **not exercisable on this row** and needs a PSEC-capable Windows build — the
Win11 Eval VM lane, §RQ5 minimum-build / D9. On hosted `windows-2025` the **exercisable** Windows
isolation path is therefore the capability-SID fallback, which is why its receipt matters here.

## Not proven / open

- Microsoft publishes **no formal security-boundary commitment for the process tier**. Container-to-
  container isolation is this receipt, never an assumption.
- Architectural finding for the design note: in the pinned SDK, `processcontainer` is a **one-shot**
  backend (not in `LifecycleContainmentKind`), so a persistent Tau session is modelled as a
  supervisor owning repeated one-shot `processcontainer` execs. The SDK's **`isolation_session`**
  backend, by contrast, mints a **distinct per-instance agent user account + SID**
  (`IsolationSessionProvisionMetadata`) — the distinct security identity §RQ5 noted `processcontainer`
  does not document. The design note weighs this.
