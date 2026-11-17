# tau-windows-sandbox

The Windows half of Tau's contained shell (desktop Bash/Terminal blueprint D14, D15, D20, D26; Q15). One Rust binary,
`tau-windows-sandbox.exe`, that the win32 `ShellProvider` in `../src/shell/windows-shell-provider.ts` drives. It is
promoted from the Q2 spike (`claude/project-thread-8sx5nl`, `packages/core/native-process/spikes/shell/mxc/`, runs
40041468455 and 40046797357) and shaped after Codex's `codex-rs/windows-sandbox-rs`, read as reference and not vendored.

Nothing here is enabled by default. The desktop composes the provider only when `TAU_WINDOWS_SHELL_SANDBOX=1` until
the WIN-X64 conformance row is green on a merged head (Q15 acceptance).

## Model

- **Shell.** PowerShell from fixed paths only (`resolveShellExecutable`, A26): `%ProgramFiles%\PowerShell\7\pwsh.exe`,
  else `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`. The helper re-checks that the executable it is
  handed lies under `%ProgramFiles%` or `%SystemRoot%` and refuses anything else.
- **Identity.** One local, non-admin sandbox account, `TauSandbox`, in the local group `TauSandboxUsers`, created once
  by an elevated `setup` (one UAC prompt, D15 "UAC applies only to trusted setup"). Its password is random, protected
  with machine-scope DPAPI and readable only by the person who ran setup, SYSTEM and Administrators.
- **Token.** The workload runs as `TauSandbox` in an AppContainer (lowbox) token derived from a `WRITE_RESTRICTED`
  token. The runner first mints the restricted token (`DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED`) with three
  restricting SIDs: a fresh random per-launch capability SID (`S-1-5-21-…`), the runner's logon SID and Everyone. It
  then starts the shell with `CreateProcessAsUserW` on that token and `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` for
  a fresh per-launch package SID and exactly one capability, Tau's volume capability (below; no `internetClient`,
  nothing else). Windows derives the lowbox token from the restricted token, makes it Low integrity and keeps the
  restricting SIDs. Every access check on every securable (files, registry, named pipes, sections, ALPC ports, desktops)
  then has three passes, and access needs all three. The first pass is the account and its groups. The second is the
  AppContainer pass, which matches only ACEs for the launch's package SID or for `ALL APPLICATION PACKAGES`. The third,
  for writes only, is the restricted pass, which matches only ACEs for the restricting SIDs. Mandatory integrity applies
  on top: a Low process cannot write to an unlabelled (Medium) object. So an object whose DACL grants only Everyone
  (A22), or uses the default named-pipe DACL (Everyone may read), is closed to the shell. The default DACL of the
  shell's token gives the logon SID and the package all access and `OWNER RIGHTS` read-control only.
- **A registered AppContainer per launch.** The launcher derives the package SID from a random name,
  `tau.sandbox.<32 hex digits>`, with `DeriveAppContainerSidFromAppContainerName`, a hash with no side effect, so it can
  grant and journal before anything runs. No two launches, concurrent or later, share a package or any grant to it. The
  runner registers that name with `CreateAppContainerProfile` in `TauSandbox`'s own profile, which `LOGON_WITH_PROFILE`
  loads: the mapping goes in `TauSandbox`'s `HKCU` and the folder under its own `%LOCALAPPDATA%\Packages`. The runner
  refuses at stage `appcontainer` unless the returned SID is the launcher's and the folder lies under the account's own
  `%LOCALAPPDATA%`, so nothing lands in the person's profile. `CreateProcess` needs the registration: for an
  unregistered package it fails with `ERROR_FILE_NOT_FOUND` (WIN-X64 run 44017795494). `CreateProcess` builds the
  package's named-object namespace ( \Sessions\<n>\AppContainerNamedObjects\<package
  SID>`, with its `RPC Control`directory and its`Global`, `Local`and`Session` links) as it does for any
AppContainer, and hands the handles to the kernel, so the namespace lives as long as a token of the package. A name
the shell creates lands in its own directory; a name it opens elsewhere still faces the AppContainer check. Tau does
not lay the namespace out itself: with a hand-built one (`NtCreateLowBoxToken`, after Chromium's lowbox policy)
PowerShell started and then failed its first COM wait with `E_FAIL`(WIN-X64 run 44014261732). That namespace's DACL
is built for unrestricted AppContainer tokens, and a write-restricted token needs one of its restricting SIDs
granted to create an object there. So the runner adds one non-inheritable ACE for its logon SID (query, traverse,
create object, create subdirectory and read-control; never`DELETE`or`WRITE_DAC`) to the directory and to its
`RPC Control`. These are temporary objects of the launch, so nothing is journaled; a failed grant is logged and the
  launch goes on.
- **Registration lifetime.** Before registering, the runner creates the named mutex `Global\<package name>` and holds
  it until it exits, so a live launch is visible to every other runner. The runner deletes the registration with
  `DeleteAppContainerProfile` once the launch's job is empty: after the shell's exit, on any refusal after
  registration, and when the launcher goes away. A runner that crashed leaves a registration with no live mutex. The
  next runner deletes every such `tau.sandbox.*` registration before it registers its own, and logs the sweep. The
  journal header records the name. `restore` runs as the person and cannot change `TauSandbox`'s profile, so it only
  logs that the name stays registered until the next launch or `revoke`. A leftover holds no grant on anything of the
  person's: those ACEs are journaled and restored by the launcher. `revoke` deletes the account's profile, which
  removes every leftover with it.
- **Environment.** For a registered AppContainer, `CreateProcess` rewrites the environment it is given. `LOCALAPPDATA`
  becomes `<LOCALAPPDATA>\Packages\<package name>\AC`, and `TEMP` and `TMP` become `…\AC\Temp` (WIN-X64 run
  44019164917). Those folders sit inside whatever root held the given `LOCALAPPDATA`, often a readable-only one, and
  usually do not exist. The given `TEMP` is a granted, journaled, writable location, and PowerShell needs a writable
  `TEMP`: Windows PowerShell 5.1 probes it for its script policy, and `Add-Type` compiles there. So the launch's
  environment is the contract. While the shell is still suspended, the runner reads its environment back through the
  process parameters (`PEB.ProcessParameters`, then `Environment` and `EnvironmentSize`, the 64-bit layout of every
  Windows since Vista). If any variable differs from the launch's, it writes the launch's own block into new memory
  of the shell's process, points the parameters at it, and reads it back to compare. It logs the names it restored,
  never their values. Any failure refuses the launch at stage `environment`.
- **Volume roots.** A volume root's default DACL grants Users and Authenticated Users but no AppContainer, so
  PowerShell's FileSystem provider cannot resolve `C:\`. `Start-Job` failed with "Cannot find path 'C:\' because it does
  not exist" (WIN-X64 run 44020877855). Per-launch grants cannot fix this, because the person has no `WRITE_DAC` on
  `C:\`, and granting `ALL APPLICATION PACKAGES` would open the root to every app on the machine. So Tau has one durable
  capability, `DeriveCapabilitySidsFromName("tauSandboxVolumeRoot")` (`S-1-15-3-1024-…`, the same SID on every machine),
  and every launch's AppContainer carries exactly that capability. Elevated `setup` grants it one non-inheritable ACE on
  each fixed volume's root folder, this folder only:
  `FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES | READ_CONTROL | SYNCHRONIZE` (`0x1200a1`). Listing is
  included because the provider resolves a path's case by enumerating each parent folder, the root among them, so
  attributes alone would make `Test-Path C:\` true and still fail every path below it. The cost is that the shell sees
  the names of a volume's top-level folders. This is the pattern Chromium's installer uses for its
  `lpacChromeInstallFiles` capability. The DACL is written with `SetKernelObjectSecurity` on the root's handle, which
  never propagates to the volume's contents, and only that one ACE is added or replaced; it is read back to check.
  `setup` must grant it on the system drive and reports any other fixed volume that refuses. The install record keeps
  `volumeCapabilitySid` and `volumeRoots`. `status` reports `volumeRootsGranted`, and `launch` refuses "run setup again"
  unless every recorded root, the system drive's among them, still carries the grant. `revoke` removes every ACE for the
  capability from the recorded and current fixed roots, and nothing else. A volume added after `setup` gets the grant on
  the next `setup`.
- **Admission.** The runner starts the shell suspended. It reads the token the kernel actually assigned to the shell and
  refuses anything but an AppContainer token for this launch's package with exactly the volume capability, the launch's
  capability SID among its restricting SIDs, and Low integrity. Any other token is killed before its first instruction,
  and the runner reports `runner-error` at stage `spawn`. It then adds one ACE for the person to the shell's process
  (`PROCESS_QUERY_LIMITED_INFORMATION`) and to its token (`TOKEN_QUERY`), so the host can confirm all of this from
  outside (conformance W08). It sets the token's default DACL (above), grants the namespace (above) and checks `HKCU`
  (below). Last, it logs a `probe:` line of what the shell's own token can reach, impersonated on a separate thread: the
  namespace path and layout, opening the namespace, the window station and the desktop, and a COM single-threaded
  apartment with `CoWaitForMultipleHandles` on a signalled and an unsignalled event (what .NET does for
  `WaitHandle.WaitOne` on an STA thread). The probe never admits or refuses a launch. Only then does it resume the
  shell. It logs the token through `runner-log`, for example
  `shell token: user=… appContainer=true package=S-1-15-2-… capabilities=[S-1-15-3-1024-…] restricted=[…] integrity=S-1-16-4096`.
  A host sees these lines through the provider's `onHelperDiagnostic` option; the conformance suite prints them and
  keeps them in its receipt.
- **Reads and writes.** `TauSandbox` cannot open another account's profile (the default profile DACL). The helper grants
  on the launch's readable and writable roots and adds deny ACEs for the denied set inside them. Every grant names the
  package SID beside the account: nothing is granted to `ALL APPLICATION PACKAGES`, and nothing to a broad root. Per
  path set: `readable` grants the account and the package read and execute. `writable` grants the account, the
  capability SID and the package read, write and delete, and lowers the root's mandatory label to Low
  (`S:(ML;OICI;NW;;;LW)` on a directory), so the Low-integrity shell may write what the DACL grants. `readOnly` grants
  the account and the package read and denies the capability SID every write right, so a read-only path inside a
  writable root stays read-only. `denied` denies `TauSandboxUsers` all access, which the first pass alone enforces.
  Directory ACEs and the directory label are inheritable. PowerShell 7 and Windows PowerShell 5.1 need nothing else:
  their binaries, `System32` and the .NET runtimes live under `%ProgramFiles%` and `%SystemRoot%`, which already grant
  `ALL APPLICATION PACKAGES` read and execute. The host's environment points `TEMP`, `TMP`, `USERPROFILE`, `APPDATA` and
  `LOCALAPPDATA` into the writable root, so the module analysis cache, the PSReadLine history and .NET's temporary files
  land there. The runner adds nothing to the environment.
- **HKCU.** PowerShell 7 and 5.1 open `HKCU` while their host starts (policy settings, console, regional and, in 5.1,
  execution-policy keys). A missing key is harmless to them, but `ERROR_ACCESS_DENIED` is fatal: "The shell cannot be
  started. A failure occurred during initialization: Requested registry access is not allowed" (WIN-X64 run
  44012660365). Without a loaded profile the account's `HKCU` falls back to `HKU\.DEFAULT`, whose root admits no
  AppContainer. So `setup` creates `TauSandbox`'s own user profile once (`CreateProfile`, from the Default user
  template like any account), and `launch` starts the runner with `LOGON_WITH_PROFILE`. The secondary-logon service
  then loads that hive as `HKU\<account SID>` for the launch and unloads it afterwards. The template's hive grants
  `ALL APPLICATION PACKAGES` read as every account's does, so Tau grants nothing in the registry. The hive holds nothing
  of the person's. The shell cannot write it, because the restricted pass finds none of its restricting SIDs there, so
  no registry state carries over between launches. Before it resumes the shell, the runner impersonates the shell's
  own token, opens the hive root and the keys PowerShell reads, and logs each as `read`, `absent` or `error <code>`
  through `runner-log`. If the root cannot be opened, the runner refuses at stage `registry` with that line, and the
  shell never starts. `launch` refuses "the sandbox account has no profile (run setup again)" when the profile is not
  registered. `revoke` deletes the profile before the account.
- **Native workers.** A launch may run an `.exe` outside `%ProgramFiles%` and `%SystemRoot%` (a Build123d worker's
  Python) only with `executableDigest`, `sha256:` and 64 lowercase hex digits; without it the launch is
  `unsupported: executable`. Before anything changes, `launch` opens the file sharing read only, refuses a reparse
  point or a path whose final name (`GetFinalPathNameByHandleW`) differs from the one given (a link, a junction or an
  8.3 short name anywhere on it: the host passes the long, resolved path), hashes that very handle with SHA-256 (CNG)
  and holds it until the launch ends. While it is open nobody can open the file for writing or deleting, rename it or
  rename a folder above it, so the image `CreateProcessAsUserW` maps by name is the one hashed. A mismatch is
  `unsupported: executable-digest`, naming both digests. Inside the fixed roots the digest is optional and checked when
  given. The executable's folder is the worker's runtime root: a `readable` or `readOnly` path must equal or contain
  it, and no `writable` path may equal, contain or lie inside it; otherwise `unsupported: executable` (a drive root is
  never a runtime root). The `readable` grant gives the account and the package read and execute (`0x1200A9`), which
  is what an image load needs in both access-check passes, so the worker loads its DLLs and `.pyd` modules from the
  runtime root (NW01 loads a DLL it carries there with `LoadLibraryW` and checks the module's path). Nothing
  PowerShell-specific is forced on a worker: its environment is the spec's, plus `SystemRoot` when left out.
  Windows derives an AppContainer's `LOCALAPPDATA`, `TEMP` and `TMP` from the `LOCALAPPDATA` of the block it is
  given and fails `CreateProcess` with `ERROR_ENVVAR_NOT_FOUND` (203) when there is none, so a launch without one is
  created with the sandbox account's own (where its package is registered), and the runner then gives the suspended
  process exactly the spec's environment, as for every launch (NW01 reads the worker's whole environment back).
- **Sessions.** One launch at a time per computer, enforced by the helper itself. Read and write isolation between
  two launches would hold (each has its own package SID, which every grant names, and its own capability SID for the
  restricted pass; the restricting SIDs are that capability, the runner's own logon SID and Everyone, and the volume
  capability is granted by `setup` on volume roots only, so none of these is shared state a launch adds or removes).
  Restore is what is not safe: grants also name the shared account (the first pass needs it) and denials the shared
  group, `SetEntriesInAclW` merges a second launch's account ACE into the first's, the Low label of a writable root is
  shared, and restore writes back whole snapshots, roots and descendants alike, plus the window station's descriptor
  byte for byte. Two live launches over overlapping paths would each journal the other's ACEs, and whichever restored
  last would write the other's grants back after it ended. So `launch` holds the named mutex
  `Global\tau.sandbox.descriptors` from before it journals until its teardown has restored everything, and `restore`
  holds it while it writes a journal back. A second launch is refused at once, before anything changes: `refused`
  with status `sandbox-unavailable`, `requirement: "exclusive-launch"` (what a host matches to wait and retry; the
  TS constant is `windowsExclusiveLaunchRequirement`) and the message "another sandboxed launch is running on this computer, and Windows
  runs one at a time; try again when it ends" (NW02). `restore` then exits 1 with the same failure and `"requirement": "exclusive-launch"` and keeps
  the journal. A launcher that dies abandons the mutex, and the next caller takes it. The provider also serializes its
  own launches and answers a second one `sandbox-unavailable` without running the helper.
- **Descendants.** The runner places the shell in a Job Object with `KILL_ON_JOB_CLOSE`, no `BREAKAWAY_OK` and no
  `SILENT_BREAKAWAY_OK`; the launcher places the runner in its own kill-on-close job. Closing either kills the tree.
  `exit` is reported only once the job reports zero active processes.
- **Network.** `setup` installs two layers, both scoped to the `TauSandbox` account. Windows Firewall rules
  (`LocalUserAuthorizedList` `O:LSD:(A;;CC;;;<account SID>)`, all profiles, read back after writing): block all
  outbound (and inbound) traffic to non-loopback addresses, block loopback UDP, and block loopback TCP except the fixed
  proxy port block recorded in the install record. Firewall rules do not filter loopback or the host's own addresses
  (run 44005787685 reached both with the firewall on) and do nothing for a profile whose firewall is off, so `setup`
  also installs persistent Windows Filtering Platform filters in Tau's own provider and sublayer, matched on the
  account through `FWPM_CONDITION_ALE_USER_ID`: block every `ALE_AUTH_CONNECT` (v4 and v6), every non-loopback
  `ALE_AUTH_RECV_ACCEPT` and every ICMP socket (`ALE_RESOURCE_ASSIGNMENT`), and, at a higher weight in the same
  sublayer, permit loopback TCP to each run of proxy ports (at most 8 runs). `launch` checks, before it changes
  anything, that Windows Firewall is on for every current profile and that every rule and filter is present and
  enabled; otherwise it refuses `sandbox-unavailable` ("Windows Firewall is off for <profiles>, so Tau cannot keep the
  sandbox off the network. Turn it on, then try again.", or "the sandbox network rules are missing or disabled (run
  setup again)"). `setup` never turns the firewall on (machine policy); its output says when it is off. A launch with
  nonempty `network.domains` is `unsupported: network-isolation` until the per-launch proxy lands (Q4 §7 risk 2).
  The AppContainer is a third, independent layer. A package without the `internetClient`, `internetClientServer` or
  `privateNetworkClientServer` capability gets no network access from the Windows Filtering Platform filters that
  Windows maintains for AppContainers. That includes loopback, which needs a per-package loopback exemption that is
  never granted. The account-scoped WFP filters and firewall rules stay as they are (defence in depth). They are what
  will admit the proxy ports once the per-launch proxy lands, which will also need a loopback exemption for the
  package.
- **ACL lifecycle.** Granting through `SetNamedSecurityInfoW` propagates the inheritable ACEs to every descendant and
  sets `SE_DACL_AUTO_INHERITED` on the root and on each descendant it rewrites. So before it changes any ACL the
  launcher journals the full original descriptor (owner, group, DACL and its control flags, as SDDL) of every root and
  of every object under a directory root, walking each tree without following reparse points (a junction or symbolic
  link is journaled as itself and not entered), and fsyncs the journal. At exit, and in `restore` after a crash, it
  writes each root's DACL back with propagation (which also strips the launch's ACEs from objects created during the
  launch), then writes every journaled object's exact DACL and control flags through its handle with
  `SetKernelObjectSecurity`, which does not propagate, and reads each back: the full SDDL must equal the journal's. It
  never removes an ACE it did not add and never writes an owner or group (I11, E19; Q4 §7 risk 4). A granted or denied
  path that is itself a link or junction is refused (`absolute-paths`). The journal must not already exist (a leftover
  belongs to a crashed launch: `restore` it first) and must not lie inside a granted or denied path. Journaling costs
  one handle open per object under the granted paths, the same order of work as the propagation itself.
- **Desktop.** The launcher creates the shell's private desktop on its window station. The runner cannot: as
  `TauSandbox` it may not change `WinSta0`, and both the spike and Codex create the desktop here too. The desktop's
  protected DACL admits the person and, as participants, `TauSandbox`, the launch's capability SID and its package SID.
  The desktop carries a Low label (`S:(ML;;NW;;;LW)`) so the Low-integrity shell can attach to it. The launcher adds one
  session ACE per participant to the window station when the person may change its DACL (best-effort: the ACE only
  widens access), journals the original descriptor, and restores it byte for byte at teardown.
- **Cleanup.** The AppContainer leaves no durable state once its registration is deleted (above). There is no firewall
  or loopback exemption and no permanent kernel object. The account's own profile is account-level state, created by
  `setup` and deleted by `revoke`. The named-object directory and its links are temporary objects that go away with the
  last handle, held by the shell's token, when the launch's job ends. The ACEs for the package SID and the Low labels on
  writable roots are journaled and restored with the rest of the ACL change. A restored root that was replaced during
  the launch must not name the package SID either. Beyond the journal, `restore` has nothing AppContainer-specific it
  can remove.
- **Runner binary.** `TauSandbox` cannot read the person's profile, where the desktop app installs, so `setup` copies the
  helper to `%ProgramData%\Tau\Sandbox\bin\` (readable by `TauSandboxUsers`, writable only by SYSTEM and
  Administrators) and `launch` starts that copy. `launch` refuses `sandbox-unavailable` when the installed copy differs
  from itself, so an app update asks for `setup` again.
- **Terminal and stdio.** The runner, not node-pty, owns the ConPTY (node-pty cannot create its pipes inside the token,
  spike run 40041468455) and the stdio pipes. The runner opens them outside the AppContainer and passes them through the
  explicit handle list or the pseudoconsole attribute, so the shell never opens them by name. It spawns the shell with
  `0x80404` (`CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED`, the last for admission),
  never `CREATE_NEW_PROCESS_GROUP`, so Ctrl-C reaches the foreground pipeline (spike run 40046797357). Every process
  copies its parent's "ignore Ctrl-C" flag, and the launcher's chain (Node, any process-group parent) is not the
  spike's, so both the launcher (before `CreateProcessWithLogonW`) and the runner (before `CreateProcessAsUserW`)
  register a handler that keeps Ctrl-C and Ctrl-Break on their own console from ending them, then clear the flag with
  `SetConsoleCtrlHandler(NULL, FALSE)`. Both log the outcome (the runner through `runner-log`) to the launcher's stderr.
- **MXC.** `@microsoft/mxc-sdk` `processcontainer` is preferred where its PSEC probe passes. The probe failed on both
  hosted rows, so it is a later provider branch, not part of this binary.
- **Limits.**
  - The package is a full AppContainer, not a Low Privilege AppContainer
    (`PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT`). Objects that grant `ALL APPLICATION PACKAGES` stay
    reachable within the account's own rights: system binaries, much of `HKLM`, and named objects or devices that
    Windows opens to every app. LPAC would close that set too, but PowerShell and .NET would then need grants under
    `%ProgramFiles%`, `%SystemRoot%` and `HKLM`, which this helper does not make.
  - The Low label on a writable root lets other Low-integrity processes of the person write there while the launch
    runs, wherever the DACL already grants the person. The restore removes the label.
  - The SACL's own control flags (`S:AI`, `S:P`) on objects under a writable root are not restored, because writing
    them needs `SeSecurityPrivilege`. The label ACE itself is restored, and the owner, group, DACL and DACL control
    flags are restored byte for byte as before.

## Subcommands

| Command                    | Runs as             | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                   | the person          | Print the install record as JSON with `"installed":true`, `{"installed":false}` when absent or unreadable (the reason on stderr), plus `firewallEnabled` and `rulesPresent` (below). `--quick` stops after the record and `profilePresent`, without the volume roots or the network fence: what a host asks at start (`readWindowsSandboxStatus`). Never elevates. Every subcommand first fills in `SystemDrive`, `SystemRoot` and `windir` from the Windows directory where its caller left them out, so the install paths (the ProgramData known folder expands `%SystemDrive%`) never depend on the caller's environment (W09). |
| `setup`                    | Administrator (UAC) | Create or repair the account, its profile, group, password file, firewall rules, WFP filters and volume-root grants; write the install record. Idempotent. `--for-user <SID>` names the person whose host may read the password.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `revoke`                   | Administrator (UAC) | Remove the volume-root grants, the firewall rules, the WFP filters, sublayer and provider, the account's profile, the account, the group, the password file and the install record. Idempotent.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `launch`                   | the person          | Speak the framed protocol below on stdin/stdout: apply and journal ACLs, start the runner as `TauSandbox`, relay I/O, restore ACLs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `runner`                   | `TauSandbox`        | Internal. Started by `launch` with `CreateProcessWithLogonW` (`LOGON_WITH_PROFILE`). Builds the token, job and stdio, then starts the shell on the launcher's private desktop.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `restore --journal <path>` | the person          | Restore the descriptors a crashed `launch` journaled, then delete the journal. Idempotent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Install record: `%ProgramData%\Tau\Sandbox\install.json`, with `password.bin` beside it and the runner copy in `bin\`.
The directory's DACL is protected: SYSTEM and Administrators full control, the `--for-user` person read. `setup` also
takes `--proxy-ports <list or a-b block>` (default `47311,47312`) and prints the record with `firewallEnabled`,
`rulesPresent` and, when the firewall is off for a current profile, a `warning` carrying the refusal message above. The account is a member of
`TauSandboxUsers` only (never Administrators: `setup` checks and refuses) and is hidden from the sign-in screen.

```json
{
  "version": 1,
  "account": "TauSandbox",
  "accountSid": "S-1-5-21-…",
  "group": "TauSandboxUsers",
  "groupSid": "S-1-5-21-…",
  "proxyPorts": [47311, 47312],
  "firewallRules": ["…"],
  "wfpFilters": ["tau_sandbox_wfp_block_connect_v4", "…"],
  "forUser": "S-1-5-21-…",
  "runner": "C:\\ProgramData\\Tau\\Sandbox\\bin\\tau-windows-sandbox.exe"
}
```

`status` adds `profilePresent` when installed (the account's profile is registered) and two booleans: `firewallEnabled`
(Windows Firewall is on for every profile in `CurrentProfileTypes`) and `rulesPresent` (the four firewall rules exist,
are enabled, block, apply to every profile and name the account, and every WFP filter for the recorded proxy ports
exists). Either is `false` when it cannot be read; the reasons go to stderr. `launch` refuses unless both are `true`.

## Launch protocol

Every frame is `type: u8`, `length: u32` little-endian, then `length` payload bytes. JSON payloads are UTF-8. The host
writes frames to the helper's stdin and reads frames from its stdout; the helper's stderr is a free-text diagnostic log
for the host log only.

Host to helper:

| Type   | Name          | Payload                                                                                                     |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `0x01` | `spec`        | JSON launch spec, first frame, exactly once                                                                 |
| `0x02` | `start`       | empty; the start barrier. The helper starts the shell only after this, so the host can record custody first |
| `0x03` | `input`       | raw bytes for the terminal, or for the child's stdin with `pipes` and `"input": true`; ignored otherwise    |
| `0x04` | `resize`      | JSON `{ "columns": n, "rows": n }`                                                                          |
| `0x05` | `terminate`   | empty; kill the job, then report `exit`                                                                     |
| `0x06` | `close-input` | empty; close the child's stdin (EOF), with `pipes` and `"input": true` only; ignored otherwise              |

Closing stdin is the same as `terminate`.

Helper to host:

| Type   | Name             | Payload                                                                                                                                    |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `0x81` | `ready`          | JSON `{ "launcherPid", "runnerPid", "capabilitySid", "journal" }` after ACLs are applied and the runner is suspended at its barrier        |
| `0x82` | `stdout`         | bytes (`pipes`)                                                                                                                            |
| `0x83` | `stderr`         | bytes (`pipes`)                                                                                                                            |
| `0x84` | `output`         | bytes (`terminal`)                                                                                                                         |
| `0x85` | `exit`           | JSON `{ "exitCode": n }` or `{ "signal": "SIGKILL" }`, sent after the job is empty and ACLs are restored                                   |
| `0x86` | `refused`        | JSON `{ "status": "sandbox-unavailable" \| "unsupported", "requirement"?: string, "message": string, "diagnostic"?: string }`; nothing ran |
| `0x87` | `started`        | JSON `{ "shellPid" }` once the shell process exists                                                                                        |
| `0x88` | `cleanup-failed` | JSON `{ "message" }`; the job or ACL restore could not be confirmed. Sent instead of `exit`; the host keeps custody                        |

Launch spec (`0x01`):

```json
{
  "version": 1,
  "executable": "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  "executableDigest": "sha256:<64 lowercase hex>",
  "arguments": ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "…"],
  "workingDirectory": "C:\\…",
  "environment": { "PATH": "…", "TEMP": "…" },
  "stdio": { "kind": "pipes", "input": false },
  "filesystem": {
    "readable": [],
    "writable": [],
    "readOnly": [],
    "denied": []
  },
  "network": null,
  "journal": "C:\\Users\\…\\AppData\\Roaming\\Tau\\shell-custody\\<executionId>.acl.json"
}
```

`stdio` is `{ "kind": "terminal", "columns": n, "rows": n }` for the Terminal. With `pipes` the child's stdin is `NUL`
and `input`, `close-input` and `resize` are ignored, unless `"input": true`: the child then reads a pipe that `input`
frames write (a byte stream; frame boundaries mean nothing) and `close-input` closes, and the child sees EOF. A
dedicated writer feeds it, so a child that never reads cannot stall the relay. Closing the helper's own stdin still
means `terminate`. `executableDigest` and `input` are optional and additive; the spec stays version 1. `writable` includes the private HOME and temporary roots. Every path is absolute
(`X:\…`, no `.`/`..`, UNC, device or stream spelling) and already resolved by the host; a path that does not exist gets
no ACL change. `network` may be omitted, `null` or `{ "domains": [] }`, all meaning no network at all; nonempty
`domains` is refused. `SystemRoot` is
added to the environment when the host leaves it out.

The helper fails closed: an unknown field anywhere in the spec is refused. `unsupported` refusals carry one of these
`requirement` values: `spec` (unreadable spec, unknown field, misplaced journal), `spec-version`, `executable` (not an
`.exe`, a `.cmd`/`.bat`, one outside `%ProgramFiles%` and `%SystemRoot%` without `executableDigest`, a runtime root
that is not readable or is writable, or a file that is missing, a link or open for writing elsewhere),
`executable-digest` (a malformed digest, or one the file does not match), `absolute-paths`, `environment` (a name with
`=` or NUL, or a name given twice in different case), `stdio` (a zero terminal size), `network-isolation`. A `sandbox-unavailable` refusal carries a `requirement` only
when another launch holds the sandbox: `exclusive-launch` ("Sessions"); nothing changed, and the launch may be
retried once that one has ended.

Ordering. `refused` normally comes instead of `ready`. If the runner reported `ready` but the shell then could not be
started (for example `CreateProcessAsUserW` failed), the helper restores the ACLs and sends `refused`
(`sandbox-unavailable`, with the runner's `diagnostic`) after `ready`, never `started`; if that cleanup cannot be
confirmed it sends `cleanup-failed` instead. `started` comes only once the runner has admitted the shell's token,
granted its namespace, checked its `HKCU` and resumed it. The provider waits for `started` (or that `refused`) before
it reports a launch as started, and treats any other frame between `start` and `started` as a protocol violation.
The runner's `runner-log` lines and its `runner-error` (`<stage>: <message>`) are also written to the helper's
stderr at every stage. `exit` carries the shell's own exit code when it ended by itself and
`{ "signal": "SIGKILL" }` when the job was killed (`terminate`, closed stdin, or a runner that died).

## Internal runner channel

`launch` starts `runner --pipe-in <name> --pipe-out <name> --launcher-pid <pid>` suspended, assigns it to its job,
resumes it and talks to it over two one-way named pipes (`\\.\pipe\tau-sandbox-<random>-in`/`-out`) created with
`FILE_FLAG_FIRST_PIPE_INSTANCE`, `PIPE_REJECT_REMOTE_CLIENTS` and a protected DACL naming only the person and
`TauSandbox`. Each side checks the other's PID. The frames are the same codec: `launch` sends `spec` (an internal spec
with the capability SID, the package SID, the person's SID, the desktop name and the `executableDigest`, which the
runner checks for form and roots again; the launcher holds the file), then forwards `start`, `input`, `close-input`,
`resize` and `terminate`; the runner answers `ready` (empty), `started`, `stdout`/`stderr`/`output` and `exit`, or
`0xC1` `runner-error` (`{ "stage", "message" }`), or `0xC2` `runner-log` (a UTF-8 diagnostic line the launcher copies to
its stderr, sent at any time, also before `ready`), which `launch` never forwards to the host.

## ACL journal

JSON lines, streamed on write and on restore so memory stays bounded however large the granted trees are:

```text
{"kind":"header","version":3,"capabilitySid":"S-1-5-21-…","packageSid":"S-1-15-2-…","packageName":"tau.sandbox.…","launcherPid":1234,"windowStation":{"sessionId":1,"name":"WinSta0","descriptor":"<hex self-relative SD>"}}
{"kind":"root","path":"C:\\…\\home","sddl":"O:S-1-5-21-…G:S-1-5-21-…D:(A;OICI;FA;;;SY)…S:(ML;…)","fileId":"<volume serial>:<file index>"}
{"kind":"child","path":"C:\\…\\home\\a.txt","sddl":"O:…G:…D:AI(A;ID;FA;;;SY)…","fileId":"…"}
{"kind":"end","roots":1,"children":1}
```

One `root` line per granted or denied path that exists (in application order), one `child` line per object under a
directory root (a root nested in another is journaled under its own walk only), then `end` with the counts. The whole
journal, `end` included, is fsynced before any ACL changes, so a journal without a valid `end` belongs to a launch
that changed nothing. `fileId` (absent when the attributes were unreadable) tells the journaled object from one put in
its place during the launch; such a replacement is not rewritten (the root's propagating restore already removed what
it inherited), and a replaced root only has to name none of the launch's principals (account, group, capability
SID, package SID). Each `sddl` carries owner, group, DACL and the mandatory label (`S:` part, absent when there is
none), read with `READ_CONTROL`. Version 1 (one JSON document) and version 2 (no package SID, no label) journals are
refused; both only ever existed on unmerged branches behind `TAU_WINDOWS_SHELL_SANDBOX`.

`restore --journal <path>` restores the roots with propagation (children first, the label too where the launch changed
it), then every journaled object and root exactly (the DACL with `WRITE_DAC`, and the label with `WRITE_OWNER` only
where it differs), confirms each by owner, group, DACL with its control flags and label ACE, restores the window station
when it runs in the journaled session, deletes the journal and prints `{"restored":true}`. A missing journal, or one cut
short before its `end` line, is success. On any unconfirmed entry it prints the failures (the first few and a count),
keeps the journal and exits 1. It is idempotent.

## Build

```bash
pnpm nx run sandbox:build:windows-sandbox      # on Windows x64: build, check and stage under out/windows-sandbox/win32-x64
pnpm nx run desktop:prepare-windows-sandbox    # the same, copied into apps/desktop/resources/windows-sandbox/win32-x64
cargo check --target x86_64-pc-windows-msvc    # anywhere the target is installed
pnpm nx run sandbox:test:windows-sandbox       # cargo test: the portable unit tests, on any host
```

`.cargo/config.toml` links the C runtime statically, so the helper starts on a machine without the Visual C++
Redistributable. `scripts/build-windows-sandbox.mts` refuses a build that is not an x64 console executable, imports a
Visual C++ runtime DLL or does not answer `status`, and stages it with a NOTICE for every linked crate and the
toolchain, and a manifest with its sha256. `desktop:package-windows` depends on `prepare-windows-sandbox` and ships
the three files at `resources/windows-sandbox/win32-x64/`; a release archive refuses to assemble without them. The
Windows installer's signing step signs every PE file in the app, this helper included. Main points the services host
at it (`TAU_WINDOWS_SANDBOX_HELPER`) and passes `TAU_WINDOWS_SHELL_SANDBOX=1` through when Tau was started with it;
the Terminal pane then offers the one-time `setup` (one UAC prompt) while the probe answers `provisioning-required`.
