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

## Native helpers for the candidates

- `tau-spawn-disclaim.c` — SET half of (a): `responsibility_spawnattrs_setdisclaim(+SETEXEC)` then
  re-exec. The SPI is **weak-imported** (missing symbol ⇒ reports `spiPresent=false` and still execs,
  so (a) is a documented blocker, never a vacuous pass).
- `tau-resp-enum.c` — ENUMERATE half of (a): `proc_listpids(PROC_ALL_PIDS)` then, per pid,
  `responsibility_get_pid_responsible_for_pid` (private SPI, weak-imported). Measures how many pids it
  could attribute and reports `feasible=false` with evidence when it can read only itself.
- `tau-kqtrack.c` — (b): the long-lived kqueue tracker; `--selftest` reports whether a kqueue can be
  created at all.

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
