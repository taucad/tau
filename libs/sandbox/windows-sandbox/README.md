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
  on the launch's readable and writable roots and adds deny ACEs for the denied set inside them.
- **Sessions.** One sandbox account means read isolation is per account, not per session, so the provider serializes
  launches and answers a second concurrent one `session-limit` (A23 fallback clause).
- **Descendants.** The runner places the shell in a Job Object with `KILL_ON_JOB_CLOSE`, no `BREAKAWAY_OK` and no
  `SILENT_BREAKAWAY_OK`; the launcher places the runner in its own kill-on-close job. Closing either kills the tree.
  `exit` is reported only once the job reports zero active processes.
- **Network.** `setup` installs Windows Firewall rules scoped to the `TauSandbox` account: block all outbound, and block
  loopback TCP/UDP except the fixed proxy port block recorded in the install record. A launch with nonempty
  `network.domains` is `unsupported: network-isolation` until the per-launch proxy lands (Q4 §7 risk 2).
- **ACL lifecycle.** Before it changes any ACL the launcher writes a journal (path → original SDDL, `SE_DACL_PROTECTED`
  state) and fsyncs it. At exit, and in `restore` after a crash, it writes back exactly those descriptors. It never
  removes an ACE it did not add (I11, E19; Q4 §7 risk 4).
- **Desktop.** The runner gives the shell a private desktop on `WinSta0` and grants the session SIDs only on it; the
  window-station DACL is restored byte-for-byte at teardown.
- **Terminal.** The runner, not node-pty, owns the ConPTY (node-pty cannot create its pipes inside the token, spike run
  40041468455). It calls `SetConsoleCtrlHandler(NULL, FALSE)` before spawning and spawns with `0x80400`
  (`CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT`), never `CREATE_NEW_PROCESS_GROUP`, so Ctrl-C reaches the
  foreground pipeline (spike run 40046797357).
- **MXC.** `@microsoft/mxc-sdk` `processcontainer` is preferred where its PSEC probe passes. The probe failed on both
  hosted rows, so it is a later provider branch, not part of this binary.

## Subcommands

| Command                    | Runs as             | Purpose                                                                                                                                                                            |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                   | the person          | Print the install record as JSON, `{"installed":false}` when absent. Never elevates.                                                                                               |
| `setup`                    | Administrator (UAC) | Create or repair the account, group, password file and firewall rules; write the install record. Idempotent. `--for-user <SID>` names the person whose host may read the password. |
| `revoke`                   | Administrator (UAC) | Remove the firewall rules, the account, the group, the password file and the install record. Idempotent.                                                                           |
| `launch`                   | the person          | Speak the framed protocol below on stdin/stdout: apply and journal ACLs, start the runner as `TauSandbox`, relay I/O, restore ACLs.                                                |
| `runner`                   | `TauSandbox`        | Internal. Started by `launch` with `CreateProcessWithLogonW` (no profile). Builds the token, job, desktop and stdio, then starts the shell.                                        |
| `restore --journal <path>` | the person          | Restore the descriptors a crashed `launch` journaled, then delete the journal. Idempotent.                                                                                         |

Install record: `%ProgramData%\Tau\Sandbox\install.json`, with `password.bin` beside it.

```json
{
  "version": 1,
  "account": "TauSandbox",
  "accountSid": "S-1-5-21-…",
  "group": "TauSandboxUsers",
  "groupSid": "S-1-5-21-…",
  "proxyPorts": [47311, 47312],
  "firewallRules": ["…"],
  "forUser": "S-1-5-21-…"
}
```

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
  "filesystem": { "readable": [], "writable": [], "readOnly": [], "denied": [] },
  "journal": "C:\\Users\\…\\AppData\\Roaming\\Tau\\shell-custody\\<executionId>.acl.json"
}
```

`stdio` is `{ "kind": "terminal", "columns": n, "rows": n }` for the Terminal. `writable` includes the private HOME and
temporary roots. Every path is absolute and already resolved by the host.

## Build

```bash
pnpm nx run sandbox:build:windows-sandbox      # on Windows; cargo build --release --target x86_64-pc-windows-msvc
cargo check --target x86_64-pc-windows-msvc    # anywhere the target is installed
```
