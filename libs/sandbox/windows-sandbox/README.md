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
- **Token.** The workload runs as `TauSandbox` inside a `WRITE_RESTRICTED` token (`DISABLE_MAX_PRIVILEGE | LUA_TOKEN |
WRITE_RESTRICTED`) whose restricting SIDs are a fresh random per-launch capability SID (`S-1-5-21-…`), the runner's
  logon SID and Everyone. A write succeeds only where an ACE grants that launch's capability SID.
- **Reads.** `TauSandbox` cannot open another account's profile (the default profile DACL). The helper grants it read
  on the launch's readable and writable roots and adds deny ACEs for the denied set inside them. Per path set:
  `readable` grants the account read and execute; `writable` grants the account and the capability SID read, write and
  delete; `readOnly` grants the account read and denies the capability SID every write right, so a read-only path
  inside a writable root stays read-only; `denied` denies `TauSandboxUsers` all access. Directory ACEs are inheritable.
- **Sessions.** One sandbox account means read isolation is per account, not per session, so the provider serializes
  launches and answers a second concurrent one `session-limit` (A23 fallback clause).
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
- **Desktop.** The launcher (not the runner, which as `TauSandbox` may not change `WinSta0`; this is where both the
  spike and Codex create it) gives the shell a private desktop on its window station whose protected DACL admits the
  person and, as participants, `TauSandbox` and the launch's capability SID. It adds one session ACE per SID to the
  window station when the person may change its DACL (best-effort: the ACE only widens access), journals the original
  descriptor, and restores it byte-for-byte at teardown.
- **Runner binary.** `TauSandbox` cannot read the person's profile, where the desktop app installs, so `setup` copies the
  helper to `%ProgramData%\Tau\Sandbox\bin\` (readable by `TauSandboxUsers`, writable only by SYSTEM and
  Administrators) and `launch` starts that copy. `launch` refuses `sandbox-unavailable` when the installed copy differs
  from itself, so an app update asks for `setup` again.
- **Terminal.** The runner, not node-pty, owns the ConPTY (node-pty cannot create its pipes inside the token, spike run
  40041468455). It calls `SetConsoleCtrlHandler(NULL, FALSE)` before spawning and spawns with `0x80400`
  (`CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT`), never `CREATE_NEW_PROCESS_GROUP`, so Ctrl-C reaches the
  foreground pipeline (spike run 40046797357).
- **MXC.** `@microsoft/mxc-sdk` `processcontainer` is preferred where its PSEC probe passes. The probe failed on both
  hosted rows, so it is a later provider branch, not part of this binary.

## Subcommands

| Command                    | Runs as             | Purpose                                                                                                                                                                                         |
| -------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                   | the person          | Print the install record as JSON with `"installed":true`, `{"installed":false}` when absent or unreadable, plus `firewallEnabled` and `rulesPresent` (below). Never elevates.                   |
| `setup`                    | Administrator (UAC) | Create or repair the account, group, password file, firewall rules and WFP filters; write the install record. Idempotent. `--for-user <SID>` names the person whose host may read the password. |
| `revoke`                   | Administrator (UAC) | Remove the firewall rules, the WFP filters, sublayer and provider, the account, the group, the password file and the install record. Idempotent.                                                |
| `launch`                   | the person          | Speak the framed protocol below on stdin/stdout: apply and journal ACLs, start the runner as `TauSandbox`, relay I/O, restore ACLs.                                                             |
| `runner`                   | `TauSandbox`        | Internal. Started by `launch` with `CreateProcessWithLogonW` (no profile). Builds the token, job and stdio, then starts the shell on the launcher's private desktop.                            |
| `restore --journal <path>` | the person          | Restore the descriptors a crashed `launch` journaled, then delete the journal. Idempotent.                                                                                                      |

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

`status` adds two booleans: `firewallEnabled` (Windows Firewall is on for every profile in `CurrentProfileTypes`) and
`rulesPresent` (the four firewall rules exist, are enabled, block, apply to every profile and name the account, and
every WFP filter for the recorded proxy ports exists). Either is `false` when it cannot be read; the reasons go to
stderr. `launch` refuses unless both are `true`.

## Launch protocol

Every frame is `type: u8`, `length: u32` little-endian, then `length` payload bytes. JSON payloads are UTF-8. The host
writes frames to the helper's stdin and reads frames from its stdout; the helper's stderr is a free-text diagnostic log
for the host log only.

Host to helper:

| Type   | Name        | Payload                                                                                                     |
| ------ | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `0x01` | `spec`      | JSON launch spec, first frame, exactly once                                                                 |
| `0x02` | `start`     | empty; the start barrier. The helper starts the shell only after this, so the host can record custody first |
| `0x03` | `input`     | raw bytes for the terminal (`terminal` launches only)                                                       |
| `0x04` | `resize`    | JSON `{ "columns": n, "rows": n }`                                                                          |
| `0x05` | `terminate` | empty; kill the job, then report `exit`                                                                     |

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
  "arguments": ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "…"],
  "workingDirectory": "C:\\…",
  "environment": { "PATH": "…", "TEMP": "…" },
  "stdio": { "kind": "pipes" },
  "filesystem": {
    "readable": [],
    "writable": [],
    "readOnly": [],
    "denied": []
  },
  "journal": "C:\\Users\\…\\AppData\\Roaming\\Tau\\shell-custody\\<executionId>.acl.json"
}
```

`stdio` is `{ "kind": "terminal", "columns": n, "rows": n }` for the Terminal; with `pipes` the shell's stdin is `NUL`
and `input`/`resize` are ignored. `writable` includes the private HOME and temporary roots. Every path is absolute
(`X:\…`, no `.`/`..`, UNC, device or stream spelling) and already resolved by the host; a path that does not exist gets
no ACL change. An optional `"network": { "domains": [] }` is accepted; nonempty `domains` is refused. `SystemRoot` is
added to the environment when the host leaves it out.

The helper fails closed: an unknown field anywhere in the spec is refused. `unsupported` refusals carry one of these
`requirement` values: `spec` (unreadable spec, unknown field, misplaced journal), `spec-version`, `executable` (not an
`.exe` under `%ProgramFiles%` or `%SystemRoot%`, or a `.cmd`/`.bat`), `absolute-paths`, `environment` (a name with
`=` or NUL, or a name given twice in different case), `stdio` (a zero terminal size), `network-isolation`.

Ordering. `refused` normally comes instead of `ready`. If the runner reported `ready` but the shell then could not be
started (for example `CreateProcessAsUserW` failed), the helper restores the ACLs and sends `refused`
(`sandbox-unavailable`, with the runner's `diagnostic`) after `ready`, never `started`; if that cleanup cannot be
confirmed it sends `cleanup-failed` instead. `exit` carries the shell's own exit code when it ended by itself and
`{ "signal": "SIGKILL" }` when the job was killed (`terminate`, closed stdin, or a runner that died).

## Internal runner channel

`launch` starts `runner --pipe-in <name> --pipe-out <name> --launcher-pid <pid>` suspended, assigns it to its job,
resumes it and talks to it over two one-way named pipes (`\\.\pipe\tau-sandbox-<random>-in`/`-out`) created with
`FILE_FLAG_FIRST_PIPE_INSTANCE`, `PIPE_REJECT_REMOTE_CLIENTS` and a protected DACL naming only the person and
`TauSandbox`. Each side checks the other's PID. The frames are the same codec: `launch` sends `spec` (an internal spec
with the capability SID and desktop name), then forwards `start`, `input`, `resize` and `terminate`; the runner answers
`ready` (empty), `started`, `stdout`/`stderr`/`output` and `exit`, or `0xC1` `runner-error` (`{ "stage", "message" }`),
which `launch` never forwards to the host.

## ACL journal

JSON lines, streamed on write and on restore so memory stays bounded however large the granted trees are:

```text
{"kind":"header","version":2,"capabilitySid":"S-1-5-21-…","launcherPid":1234,"windowStation":{"sessionId":1,"name":"WinSta0","descriptor":"<hex self-relative SD>"}}
{"kind":"root","path":"C:\\…\\home","sddl":"O:S-1-5-21-…G:S-1-5-21-…D:(A;OICI;FA;;;SY)…","fileId":"<volume serial>:<file index>"}
{"kind":"child","path":"C:\\…\\home\\a.txt","sddl":"O:…G:…D:AI(A;ID;FA;;;SY)…","fileId":"…"}
{"kind":"end","roots":1,"children":1}
```

One `root` line per granted or denied path that exists (in application order), one `child` line per object under a
directory root (a root nested in another is journaled under its own walk only), then `end` with the counts. The whole
journal, `end` included, is fsynced before any ACL changes, so a journal without a valid `end` belongs to a launch
that changed nothing. `fileId` (absent when the attributes were unreadable) tells the journaled object from one put in
its place during the launch; such a replacement is not rewritten (the root's propagating restore already removed what
it inherited), and a replaced root only has to name none of the launch's principals. Version 1 journals (one JSON
document) are refused.

`restore --journal <path>` restores the roots with propagation (children first), then every journaled object and root
exactly, confirms each by full SDDL, restores the window station when it runs in the journaled session, deletes the
journal and prints `{"restored":true}`. A missing journal, or one cut short before its `end` line, is success. On any
unconfirmed entry it prints the failures (the first few and a count), keeps the journal and exits 1. It is idempotent.

## Build

```bash
pnpm nx run sandbox:build:windows-sandbox      # on Windows; cargo build --release --target x86_64-pc-windows-msvc
cargo check --target x86_64-pc-windows-msvc    # anywhere the target is installed
pnpm nx run sandbox:test:windows-sandbox       # cargo test: the portable unit tests, on any host
```
