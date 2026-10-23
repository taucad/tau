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
