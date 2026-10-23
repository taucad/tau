#!/usr/bin/env python3
# S2 interactive-PTY probe for the Linux stock-VM lane (Spike W2). Run with `python3 -I`.
#
# PURPOSE
# -------
# Phases A/B/C of run-in-guest.sh prove the filesystem + network masks (s0/s1) via the UNMODIFIED
# fs-net-probe.mts harness. They do NOT exercise an interactive terminal. This helper closes the S2
# gap: with the Tau-scoped AppArmor profile loaded (Phase B context, sysctl left untouched), it drives
# a REAL interactive `bash` running inside the SAME profiled bwrap invocation shape the harness uses
# (`--unshare-user --unshare-net --ro-bind / / --proc /proc --dev /dev`) plus `--new-session`
# (blueprint A24 job control), over a guest-allocated PTY, and records a per-check pass/fail receipt.
#
# It is invoked AS THE UNPRIVILEGED USER `tau` (root bypasses the userns restriction, so a root shell
# would be a false pass). The pty is allocated by this driver (tau owns the slave); the shell under
# test is the sandboxed bash, never root.
#
# --new-session calls setsid(2) inside the sandbox, which clears the controlling terminal. bubblewrap
# does NOT re-acquire one (no TIOCSCTTY in bwrap.c), so a tiny in-sandbox shim re-acquires the pty as
# the new session's controlling terminal (exactly what a terminal emulator/login does) before exec'ing
# bash -i. This does not relax the sandbox; it only restores the ctty that --new-session's setsid drops.
#
# FAIL-CLOSED: every check starts as a typed failure and is promoted to pass ONLY on positive evidence.
# If the pty cannot be allocated, or the sandboxed shell never becomes interactive, the whole receipt
# is a typed failure (pty-unavailable / sandbox-unavailable) — never a silent/false pass.
#
# Usage: python3 -I pty-probe.py <bwrap-binary-path> <out-s2.json>
import os, sys, pty, select, termios, fcntl, struct, signal, json, time, re

BWRAP = sys.argv[1]
OUT = sys.argv[2]

SYSCTL_PATH = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns"
# Multibyte sample: Latin-1 accent + em dash + CJK + astral-plane emoji (4-byte UTF-8).
UNICODE_SAMPLE = "café—日本語—🚀"
UNICODE_BYTES = UNICODE_SAMPLE.encode("utf-8")

INIT_ROWS, INIT_COLS = 24, 80
NEW_ROWS, NEW_COLS = 43, 137   # distinctive non-default dims so a stale read can't masquerade as a pass

# In-sandbox shim: re-acquire the controlling terminal that --new-session's setsid() cleared, then
# become an interactive bash with a quiet startup (so marker parsing is clean). Job control (monitor
# mode) is on by default for `bash -i`.
SHIM = (
    "import fcntl,termios,os\n"
    "try:\n"
    "    fcntl.ioctl(0, termios.TIOCSCTTY, 0)\n"
    "except OSError:\n"
    "    pass\n"
    "os.environ['PS1']=''\n"
    # --noediting: no readline, so the driver's termios ECHO-off sticks and no bracketed-paste escapes
    # pollute the captured output. Job control (monitor mode) is unaffected and stays on for `-i`.
    "os.execv('/bin/bash',['bash','--norc','--noprofile','--noediting','-i'])\n"
)

BWRAP_ARGS = [
    BWRAP,
    "--unshare-user", "--unshare-net",
    "--ro-bind", "/", "/",
    "--proc", "/proc",
    "--dev", "/dev",
    "--new-session",
    "--",
    "/usr/bin/python3", "-I", "-c", SHIM,
]

def sysctl_value():
    try:
        with open(SYSCTL_PATH) as f:
            return f.read().strip()
    except OSError:
        return "absent"

def typed_fail(reason):
    return {"pass": False, "detail": reason}

receipt = {
    "row": "LNX-VM-PROFILE-S2",
    "phase": "B",
    "context": {
        "run_as": os.environ.get("USER") or "tau",
        "euid": os.geteuid(),
        "bwrap": BWRAP,
        "bwrap_args": BWRAP_ARGS[:-4] + ["/usr/bin/python3", "-I", "-c", "<ctty-shim>; exec bash --noediting -i"],
        "new_session": True,
        "ctty_shim": "python3 TIOCSCTTY (re-acquires controlling tty cleared by --new-session setsid)",
        "apparmor_restrict_unprivileged_userns": sysctl_value(),
        "apparmor_restrict_sysctl_left_untouched": True,  # this driver never writes the sysctl
    },
    "pty": {"initial": f"{INIT_ROWS} {INIT_COLS}", "requested_resize": f"{NEW_ROWS} {NEW_COLS}"},
    "checks": {
        "tty": typed_fail("not-evaluated"),
        "resize": typed_fail("not-evaluated"),
        "sigint": typed_fail("not-evaluated"),
        "jobcontrol": typed_fail("not-evaluated"),
        "unicode": typed_fail("not-evaluated"),
    },
    "verdict": "not-run",
    "all_pass": False,
}

def write_receipt():
    receipt["context"]["apparmor_restrict_unprivileged_userns"] = sysctl_value()
    checks = receipt["checks"]
    receipt["all_pass"] = all(c.get("pass") for c in checks.values())
    if receipt["verdict"] in ("pty-unavailable", "sandbox-unavailable"):
        pass
    elif receipt["all_pass"]:
        receipt["verdict"] = "all-pass"
    else:
        receipt["verdict"] = "partial"
    with open(OUT, "w") as f:
        json.dump(receipt, f, indent=2, ensure_ascii=False)
    print(f"[pty-probe] verdict={receipt['verdict']} all_pass={receipt['all_pass']}", flush=True)

def set_winsize(fd, rows, cols):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

def disable_echo(fd):
    # Turn ECHO off on the pty (driver-controlled). ISIG stays ON so Ctrl-C/Ctrl-Z still signal the
    # foreground job; only input echo is suppressed so captured output is the shell's output alone.
    attr = termios.tcgetattr(fd)
    attr[3] &= ~termios.ECHO  # lflags
    termios.tcsetattr(fd, termios.TCSANOW, attr)

# Line matcher for `stty size` output: a line that is exactly "<rows> <cols>" (anchored so a stray
# escape sequence containing digits can never be mistaken for the dimensions).
SIZE_RE = re.compile(rb"(?m)^(\d+)\s+(\d+)\s*$")

def read_until(master, needle, timeout):
    """Read from master until `needle` (bytes) seen or timeout. Returns (data, found)."""
    deadline = time.monotonic() + timeout
    data = b""
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return data, (needle is not None and needle in data)
        try:
            r, _, _ = select.select([master], [], [], remaining)
        except (OSError, select.error):
            return data, False
        if master not in r:
            continue
        try:
            chunk = os.read(master, 65536)
        except OSError:
            return data, (needle is not None and needle in data)  # child gone (EIO) == EOF
        if not chunk:
            return data, (needle is not None and needle in data)
        data += chunk
        if needle is not None and needle in data:
            return data, True

def main():
    try:
        master, slave = pty.openpty()
    except OSError as e:
        receipt["verdict"] = "pty-unavailable"
        for k in receipt["checks"]:
            receipt["checks"][k] = typed_fail(f"pty-openpty-failed: {e}")
        write_receipt()
        return 1

    set_winsize(slave, INIT_ROWS, INIT_COLS)
    try:
        disable_echo(slave)
    except OSError:
        pass

    pid = os.fork()
    if pid == 0:
        # Child: wire the slave as stdio and exec the profiled bwrap + ctty-shim + bash -i.
        # Do NOT setsid() here: bwrap --new-session calls setsid() itself, and setsid() fails with
        # EPERM if the caller is already a process group leader. The forked child is never a group
        # leader (its PGID is inherited, never its own pid), so bwrap's setsid() is guaranteed to
        # succeed; the in-sandbox shim then re-acquires this pty as the new session's controlling tty.
        os.close(master)
        os.dup2(slave, 0); os.dup2(slave, 1); os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)
        env = dict(os.environ)
        env["PATH"] = "/usr/bin:/bin"
        env["TERM"] = "xterm-256color"
        env["LC_ALL"] = "C.UTF-8"
        env["LANG"] = "C.UTF-8"
        try:
            os.execvpe(BWRAP_ARGS[0], BWRAP_ARGS, env)
        except OSError:
            os._exit(127)

    # Parent / driver.
    os.close(slave)

    def finish(code=0):
        try:
            os.write(master, b"exit\n")
        except OSError:
            pass
        time.sleep(0.3)
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
        try:
            os.waitpid(pid, 0)
        except OSError:
            pass
        try:
            os.close(master)
        except OSError:
            pass
        write_receipt()
        return code

    # ── Readiness: confirm the sandboxed shell is interactive (echo already off via driver termios).
    try:
        os.write(master, b"export LC_ALL=C.UTF-8 LANG=C.UTF-8; printf '__M_READY__\\n'\n")
    except OSError:
        receipt["verdict"] = "sandbox-unavailable"
        for k in receipt["checks"]:
            receipt["checks"][k] = typed_fail("write-to-pty-failed (shell never started)")
        return finish(1)

    data, ok = read_until(master, b"__M_READY__", 15)
    if not ok:
        receipt["verdict"] = "sandbox-unavailable"
        snip = data.decode("utf-8", "replace")[-500:]
        for k in receipt["checks"]:
            receipt["checks"][k] = typed_fail("sandboxed shell never reached interactive prompt")
        receipt["context"]["startup_raw"] = snip
        return finish(1)

    # ── Check 1: real tty on stdin AND stdout (not a pipe). ─────────────────────────────────────────
    os.write(master, b"test -t 0 && test -t 1 && echo TTY_YES || echo TTY_NO; printf '__M1__\\n'\n")
    data, ok = read_until(master, b"__M1__", 8)
    raw1 = data.decode("utf-8", "replace")
    if ok and "TTY_YES" in raw1:
        receipt["checks"]["tty"] = {"pass": True, "detail": "test -t 0 && test -t 1 both true",
                                     "raw": "TTY_YES"}
    else:
        receipt["checks"]["tty"] = {"pass": False, "detail": "stdin/stdout not a tty or no response",
                                     "raw": raw1[-300:]}

    # ── Check 2: programmatic window resize reflected by `stty size`. ───────────────────────────────
    os.write(master, b"stty size; printf '__M2A__\\n'\n")
    data, ok = read_until(master, b"__M2A__", 8)
    rawA = data.decode("utf-8", "replace")
    m = SIZE_RE.search(data)
    initial = f"{int(m.group(1))} {int(m.group(2))}" if m else "?"
    set_winsize(master, NEW_ROWS, NEW_COLS)  # TIOCSWINSZ -> SIGWINCH to the foreground pgrp
    time.sleep(0.3)
    os.write(master, b"stty size; printf '__M2B__\\n'\n")
    data, ok = read_until(master, b"__M2B__", 8)
    rawB = data.decode("utf-8", "replace")
    m2 = SIZE_RE.search(data)
    resized = f"{int(m2.group(1))} {int(m2.group(2))}" if m2 else "?"
    want = f"{NEW_ROWS} {NEW_COLS}"
    receipt["checks"]["resize"] = {
        "pass": initial == f"{INIT_ROWS} {INIT_COLS}" and resized == want,
        "detail": f"initial `stty size`={initial!r}; after TIOCSWINSZ={resized!r}; requested={want!r}",
        "initial": initial, "resized": resized, "requested": want,
    }

    # ── Check 3: Ctrl-C (0x03) interrupts a foreground `sleep 30` promptly; exit status is SIGINT(130).
    os.write(master, b"sleep 30\n")
    time.sleep(1.2)  # let sleep reach the foreground
    t0 = time.monotonic()
    os.write(master, b"\x03")  # VINTR -> SIGINT to the foreground job's pgrp
    os.write(master, b" echo SIGINT_RC=$?; printf '__M3__\\n'\n")
    data, ok = read_until(master, b"__M3__", 10)
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    raw3 = data.decode("utf-8", "replace")
    mrc = re.search(r"SIGINT_RC=(\d+)", raw3)
    rc = int(mrc.group(1)) if mrc else None
    receipt["checks"]["sigint"] = {
        "pass": rc == 130 and elapsed_ms < 10000,
        "detail": f"exit after Ctrl-C={rc} (SIGINT=130 expected), prompt regained in {elapsed_ms}ms (<<30000ms sleep)",
        "exit_code": rc, "elapsed_ms": elapsed_ms,
        "raw": raw3.strip()[-200:],
    }

    # ── Check 4: Ctrl-Z (0x1a) suspends a foreground job; bg->jobs(Running); fg resumes to completion.
    os.write(master, b"sleep 6\n")
    time.sleep(1.0)
    os.write(master, b"\x1a")  # VSUSP -> SIGTSTP to the foreground job
    data_stop, _ = read_until(master, b"Stopped", 6)
    os.write(master, b"jobs; printf '__M4A__\\n'\n")
    jobs1, _ = read_until(master, b"__M4A__", 6)
    os.write(master, b"bg %1; printf '__M4B__\\n'\n")
    read_until(master, b"__M4B__", 6)
    os.write(master, b"jobs; printf '__M4C__\\n'\n")
    jobs2, _ = read_until(master, b"__M4C__", 6)
    os.write(master, b"fg %1; printf '__M4D__\\n'\n")
    fg_data, fg_ok = read_until(master, b"__M4D__", 14)  # fg blocks until the resumed sleep completes
    j1 = jobs1.decode("utf-8", "replace")
    j2 = jobs2.decode("utf-8", "replace")
    stopped_seen = "Stopped" in (data_stop.decode("utf-8", "replace") + j1)
    running_seen = "Running" in j2
    receipt["checks"]["jobcontrol"] = {
        "pass": stopped_seen and running_seen and fg_ok,
        "detail": f"Ctrl-Z->Stopped={stopped_seen}; bg->jobs Running={running_seen}; fg resumed to completion={fg_ok}",
        "stopped_raw": (data_stop.decode("utf-8", "replace") + j1).strip()[-200:],
        "running_raw": j2.strip()[-200:],
        "fg_completed": fg_ok,
    }

    # ── Check 5: multibyte UTF-8 round-trips with no mojibake/truncation. ────────────────────────────
    os.write(master, b"printf '%s\\n' '" + UNICODE_BYTES + b"'; printf '__M5__\\n'\n")
    data, ok = read_until(master, b"__M5__", 8)
    received_exact = UNICODE_BYTES in data
    # Decode the emitted line for the receipt (strip the marker tail).
    recv_line = data.split(b"__M5__")[0].strip()
    receipt["checks"]["unicode"] = {
        "pass": received_exact,
        "detail": "exact multibyte UTF-8 byte sequence round-tripped" if received_exact
                  else "sample not found verbatim in output (mojibake/truncation)",
        "sent": UNICODE_SAMPLE,
        "received": recv_line.decode("utf-8", "replace"),
        "received_hex": recv_line.hex()[:200],
    }

    return finish(0)

if __name__ == "__main__":
    try:
        rc = main()
    except Exception as e:  # noqa: BLE001 - fail-closed: any driver error is a typed failure
        receipt["verdict"] = receipt["verdict"] if receipt["verdict"] in (
            "pty-unavailable", "sandbox-unavailable") else "driver-error"
        for k, v in receipt["checks"].items():
            if v.get("detail") == "not-evaluated":
                receipt["checks"][k] = typed_fail(f"driver-exception: {type(e).__name__}: {e}")
        try:
            write_receipt()
        except Exception:
            pass
        rc = 1
    sys.exit(rc)
