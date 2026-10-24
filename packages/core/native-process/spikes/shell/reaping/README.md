# macOS session-escaping descendant reaping spike (W2; blueprint I7/D26)

Resolves the W1 finding: on macOS the spike supervisor cancels a timed-out command by signalling the
POSIX process **group** (`kill(-pid, SIGTERM/SIGKILL)`). A descendant that calls `setsid` leaves the
group and keeps writing, so receipt `s1.descendant-reaped` FAILS on both `macos-26` (arm64) and
`macos-26-intel`. Windows reaps the whole tree with a Job object (kill-on-close); macOS has no PID
namespace and no Job object, so the cancel path needs a different mechanism.

This is a **standalone** probe. It does not modify `supervisor.mts` or any other W1 harness file.
Reaping is orthogonal to the sandbox boundary (the escaped descendant is already inside it), so the
probe uses a minimal launcher that spawns real Bash directly; the strategies here are exactly what
the product would run in the supervisor's `cancel()`.

## What it compares

Three cancel strategies × three adversaries, on each macOS row. Every verdict is decided ONLY by an
**external sentinel canary** — a file the adversary appends to ~5×/s that MUST stop growing within a
settle window after cancel. An error string is never trusted.

Strategies:

- **`group`** — control: the W1 baseline (`kill(-pid, TERM)` then `KILL`). Expected to miss
  group/session escapers; present so the comparison is self-contained.
- **`walk`** — (B) stop-the-world ppid tree walk: `SIGSTOP` the descendant set, re-enumerate the
  ppid tree (`ps -A -o pid=,ppid=`) until the set is stable (closes fork races), then `SIGKILL` all.
- **`asid`** — (A) audit-session sweep: before exec, `tau-setasid` allocates a fresh audit session id
  (`setaudit_addr(AU_ASSIGN_ASID)`), inherited by every descendant and immutable across reparenting;
  on cancel, `tau-asid-enum` lists every pid carrying that asid and kills them. Fails **closed** (a
  documented blocker receipt, never a vacuous pass) when a non-elevated process cannot set or
  enumerate the asid on this host.

Adversaries (`adversaries.sh`):

1. **`setsid`** — writer in its own new session (escapes the process group); its parent stays alive.
2. **`daemonize`** — classic double-fork; the intermediate parent exits, so the writing grandchild
   reparents to launchd (`ppid=1`) within milliseconds, before any cancel can fire.
3. **`sigterm-ignore`** — writer that installs and ignores a `SIGTERM` handler; only `SIGKILL`
   (or the asid sweep) stops it.

## Native helpers (compiled in the workflow; clang ships on the macOS runners)

- `tau-setasid.c` — SET half of (A): `setaudit_addr(AU_ASSIGN_ASID)` then `execvp`. Reports the
  before/after asid and whether the set succeeded (non-elevated `setaudit_addr` returns `EPERM`).
- `tau-asid-enum.c` — ENUMERATE half of (A): `proc_listpids(PROC_ALL_PIDS)` then, per pid,
  `task_for_pid` + `task_info(TASK_AUDIT_TOKEN)` + `audit_token_to_asid`. macOS exposes no public,
  non-privileged libproc flavor keyed by asid and `getaudit_addr(2)` is self-only, so this is the
  only route to another process's asid — and on stock (SIP-on) macOS `task_for_pid` on a process not
  owned as root is denied. The helper **measures**, per run, how many listed pids it could read, and
  reports `feasible=false` with the denial evidence when it can read only itself.

## Follow-up candidates (`candidates.mts`): two more bounded strategies × four adversaries

The baseline above leaves `daemonize` unreaped non-elevated (the open I7 gap). `candidates.mts` is a
standalone driver (it does not touch `probe.mts`) that tests two further strategies against **four**
adversaries — the three above plus **`double-fork`** (double-fork so the grandchild reparents to
`launchd`, but the launching Bash **stays alive**, isolating "reparented but the launch root is still
alive" from `daemonize`, where the root has exited). Receipts share the baseline's shape and land in
the same evidence directory (`resp.<adversary>.json`, `kqtrack.<adversary>.json`,
`preflight-candidates.json`, `matrix-candidates.json`), so the step-summary renders one combined
table.

- **`resp`** — (a) responsibility tracking. The shell is launched through `tau-spawn-disclaim`, which
  sets the private `responsibility_spawnattrs_setdisclaim` spawn attribute together with
  `POSIX_SPAWN_SETEXEC` (so the shell keeps its pid and becomes its **own** responsible process).
  Descendants inherit the shell's responsible pid, and — the thesis — reparenting to `launchd` does
  **not** rewrite it, nor does the responsible process's own death (it is a stored integer, not a
  live link). At cancel, `tau-resp-enum` lists every pid whose responsible pid equals the shell's and
  kills them. Unlike the `asid` route this reads responsibility **without the target's task port**,
  so it may be feasible non-elevated where `task_for_pid` is denied under SIP; the receipt measures
  that per run and fails **closed** (documented blocker) if the SPI does not resolve or cross-process
  attribution is denied.
- **`kqtrack`** — (b) continuous tracking during the run. `tau-kqtrack` registers a kqueue
  `EVFILT_PROC` filter with `NOTE_FORK|NOTE_EXIT|NOTE_EXEC|NOTE_TRACK` on the shell from launch;
  `NOTE_TRACK` makes the kernel follow forks and post `NOTE_CHILD` carrying each new pid, backed by a
  periodic ppid re-enumeration. The aim is to learn a double-forked grandchild **before** it
  reparents. The tracker runs the whole window and, on cancel, SIGKILLs every learned pid and reports
  the **measured race window** (learn→reparent deltas, `NOTE_TRACKERR` escapes, and pids recovered
  only by the backfill walk — i.e. forks `NOTE_TRACK` missed at startup).

## Candidate (c) (`sandbox.mts`): sandbox-membership enumeration (targets the sandbox, not the tree)

Candidates (a)/(b) still chase the process **tree** and (empirically, run 39900487555) still miss a
descendant that reparents to `launchd` before cancel. Candidate (c) abandons the tree. `sandbox.mts`
launches each session's shell inside a **per-session Seatbelt profile** (`session.sb`, `deny default`)
whose only distinguishing rule is `(allow file-read* (literal <marker>))` over a per-session UUID
marker. Every descendant **inherits** the profile and cannot leave it — daemonized, double-forked,
setsid or not, however it reparents. Membership becomes a property of the **sandbox**, read for any pid
with `sandbox_check` (no task port, so it is not blocked by SIP the way `task_for_pid` is):

```
inOurSession(pid) = sandbox_check(pid,"file-read-data",PATH,<marker>)  == allowed
                 && sandbox_check(pid,"file-read-data",PATH,<control>) == denied
```

The control path (`/.tau-reaping-control-deny`, at the filesystem root, in no allow rule) is denied by
every session's `deny default` but permitted for every **unsandboxed** pid — so the control half
rejects the unsandboxed world (probe, `launchd`, daemons), and the unique marker half rejects **foreign
sessions** (their profile denies our marker literal). At cancel, `tau-sbenum` returns the in-session pid
set; the driver `SIGSTOP`s then `SIGKILL`s it and re-enumerates until empty. Fails **closed**:
`sandbox_check` is SPI, weak-imported; absent ⇒ verdict `blocked`/`spi-unavailable`,
never a false pass.

Every combo also runs a **second concurrent session** with a different uuid/marker in its own sandbox.
The cancel is executed exactly as the strategy dictates (it kills precisely what `tau-sbenum` returns
for **our** marker), and the receipt records, under `secondSession`, whether that session was
cross-killed and whether its canary kept growing — a cross-session kill is a disqualifying failure even
if our own gap closes. Receipts: `sbmember.<adversary>.json`, `preflight-sandbox.json`,
`matrix-sandbox.json`, rendered in the same combined table.

**Observed (run 40028379646 @a6cdbf24, MAC-A + MAC-X, non-elevated):** candidate (c) did not reap.
Bash under the hand-rolled deny-default `session.sb` exits with `SIGABRT` at launch (no canary bytes),
and the membership predicate does not discriminate: the control path came back denied for every listed
pid, so 222–247 pids outside the session matched the marker half (`oracleOvermatch`). The driver now
signals only pids that are both oracle-matched and mark-verified as ours, so an overmatch fails the
receipt instead of stopping host processes. The **proposed** macOS blueprint (pending an upstream
decision) is the ppid `walk` + process-group `SIGKILL` backstop, with the pre-cancel daemonize residual
disclosed.

## S2 interactive PTY inside Seatbelt (`s2-pty.mts` → `s2.json`)

The orchestrator's S2 rule for macOS: the PTY runs **inside** the containment. `s2-pty.mts` uses the
sandbox runtime's Seatbelt path that W1 proved runs Bash for S0/S1. It builds the W1 shell grant
(`shellProfile`), calls `SandboxManager.wrapWithSandboxArgv` for an interactive Bash, and spawns that
wrapped `sandbox-exec` argv under a real node-pty PTY. The workflow installs workspace dependencies as W1
does and restores and verifies the exec bit on node-pty's prebuilt `spawn-helper`. Checks, each
pass/fail with evidence:

- `in-seatbelt` / `contained`: the launch is `sandbox-exec`, and a synthetic canary outside the grant
  is unreadable from the shell while a granted temp path is writable.
- `isatty` (`test -t 0` / `-t 1`), `resize` (programmatic TIOCSWINSZ/SIGWINCH, `stty size` old→new),
  `ctrl-c` (0x03 interrupts `sleep 30`, status 130, prompt back promptly), `ctrl-z-fg` (0x1a stops a
  job, `fg` resumes it to completion), `unicode` (é中😀 round-trip).
- `detached-descendant-contained`: the sandboxed shell double-forks a grandchild that reparents to
  launchd (`ppid 1`). The grandchild tries to copy the outside canary, which must be refused with 0
  bytes copied and `EPERM`. A positive control has the same child copy a file inside its grant
  byte-for-byte. The unsandboxed driver reads the result files from disk.

Fail-closed throughout: a missing module, a non-executable helper, an SRT init/wrap error, no prompt, or
an unanswered probe is a typed failure. A 4-minute watchdog writes `s2.json` with the checks completed
so far.

## Native helpers for the candidates

- `tau-spawn-disclaim.c` — SET half of (a): `responsibility_spawnattrs_setdisclaim(+SETEXEC)` then
  re-exec. The SPI is **weak-imported** (missing symbol ⇒ reports `spiPresent=false` and still execs,
  so (a) is a documented blocker, never a vacuous pass).
- `tau-resp-enum.c` — ENUMERATE half of (a): `proc_listpids(PROC_ALL_PIDS)` then, per pid,
  `responsibility_get_pid_responsible_for_pid` (private SPI, weak-imported). Measures how many pids it
  could attribute and reports `feasible=false` with evidence when it can read only itself.
- `tau-kqtrack.c` — (b): the long-lived kqueue tracker; `--selftest` reports whether a kqueue can be
  created at all.
- `tau-sbenum.c` — (c): `proc_listpids(PROC_ALL_PIDS)` (public libproc) then, per pid, two
  `sandbox_check` queries (marker + control). `sandbox_check` is SPI, weak-imported;
  `--selftest` reports whether it resolved. The driver supplies the per-session `.sb` profile via
  `sandbox-exec -f session.sb -D MARKER=… -D WORKDIR=… -D SCRIPTDIR=…`.

## Known gap this probe characterizes empirically

A ppid walk is rooted at the launch. A descendant that **already daemonized** (reparented to
`ppid=1`) before cancel is not reachable from that root, so `walk` misses it — demonstrated by
adversary 2, whose receipt captures the straggler at `ppid=1` in `cancelDetail.straysAtCancel`.
The contrast with adversary 1 (session escaper whose parent is still alive, which `walk` DOES reap)
answers the W2 question directly: stop-the-world closes session escape and fork races and signal
ignorers, but **not** reparenting that completed before cancel — and it cannot, because a double
fork reparents within milliseconds of launch, long before any timeout.

## Receipts

Per row (`MAC-A`, `MAC-X`): `preflight.json`, one `<strategy>.<adversary>.json` per cell, and
`matrix.json`. Each binds OS/arch/source-sha/run-url and records the canary byte counts
(`startedBytes` → `beforeCancel` → `afterCancel` → `afterSettle`), the kill detail, and any straggler
observed out-of-probe via `ps`. `verdict: pass` means the canary stopped after cancel; `blocked`
(status) means strategy (A) could not run non-elevated here and said so with evidence.

## Running locally

```
TAU_SPIKE_OUT=/tmp/reap TAU_SPIKE_ROW=LOCAL \
  TAU_REAP_BIN=<dir with tau-setasid/tau-asid-enum> \
  node packages/core/native-process/spikes/shell/reaping/probe.mts
```

Dev-only evidence harness. Never shipped; never run elevated (no `sudo`); synthetic canary only.
