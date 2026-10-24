#!/bin/bash
# Reaping-spike adversaries. Each kind starts a descendant that writes "tick\n" to an EXTERNAL
# sentinel file ~5x/second and is designed to survive a naive cancel. The sentinel is the only
# trusted observer: the probe decides reaped/not-reaped from whether the sentinel stops growing
# after cancel, never from an error string. The sentinel path embeds a unique marker so the probe
# can `pkill -9 -f <marker>` any straggler after measuring (safety net, outside the verdict).
#
# Usage: adversaries.sh <kind> <sentinel-path>
#   kind = setsid | daemonize | double-fork | sigterm-ignore
#
# This script is spawned as a detached session leader by the probe. On macOS `setsid(1)` is absent,
# so session escape uses perl's POSIX::setsid, which ships on every target row. Dev-only.
set -u

kind="${1:?kind required}"
sentinel="${2:?sentinel path required}"

# One writer iteration body, shared by every kind. Fractional sleep is accepted by BSD/macOS sleep.
writer='while :; do printf "tick\n" >> "'"$sentinel"'"; sleep 0.2; done'

case "$kind" in
  setsid)
    # Session-escaping writer: its own new session (escapes this process group), but its PARENT
    # (this bash) stays alive, so its ppid still chains back here. A ppid tree walk reaches it.
    perl -MPOSIX -e 'POSIX::setsid(); exec("/bin/bash","-c",$ARGV[0])' "$writer" &
    echo STARTED
    sleep 60
    ;;

  daemonize)
    # Classic double-fork daemon: the intermediate parent exits immediately, so the writing
    # grandchild reparents to launchd (ppid=1) within milliseconds — BEFORE any cancel can fire.
    # A ppid walk rooted at this launch sees nothing. This is the known macOS gap.
    perl -e '
      use POSIX;
      my $s = $ARGV[0];
      exit 0 if fork();            # original child returns to bash; bash continues then exits
      POSIX::setsid();             # new session
      exit 0 if fork();            # intermediate parent exits -> grandchild reparents to launchd
      while (1) { open(my $f, ">>", $s) or exit 1; print $f "tick\n"; close($f); select(undef,undef,undef,0.2); }
    ' "$sentinel" &
    echo STARTED
    # Give the double-fork time to complete and the grandchild to reparent, then exit so the walk
    # is rooted at an already-dead launch (the realistic "already daemonized before cancel" state).
    sleep 2
    ;;

  double-fork)
    # Double-fork like `daemonize`, so the writing grandchild reparents to launchd (ppid=1) within
    # milliseconds — BUT the launching bash STAYS ALIVE (sleep 60). This isolates the "reparented but
    # the launch root is still alive at cancel" case from `daemonize` (where the root has exited). A
    # ppid walk rooted at this launch still cannot see the grandchild (ppid=1); candidates (a)
    # responsibility and (b) kqueue tracking are the ones that can, because responsibility survives
    # reparent and NOTE_TRACK learns the child before it detaches.
    perl -e '
      use POSIX;
      my $s = $ARGV[0];
      exit 0 if fork();          # parent perl exits; bash keeps running (sleep 60 below)
      POSIX::setsid();           # new session
      exit 0 if fork();          # intermediate parent exits -> grandchild reparents to launchd
      while (1) { open(my $f, ">>", $s) or exit 1; print $f "tick\n"; close($f); select(undef,undef,undef,0.2); }
    ' "$sentinel" &
    echo STARTED
    # Unlike `daemonize`, keep the launching bash ALIVE at cancel time.
    sleep 60
    ;;

  sigterm-ignore)
    # Writer that installs a SIGTERM handler and ignores it, so a group TERM (or any TERM) is a
    # no-op: only SIGKILL — or the asid sweep — stops it.
    ( trap '' TERM; eval "$writer" ) &
    echo STARTED
    sleep 60
    ;;

  *)
    echo "unknown adversary kind: $kind" >&2
    exit 2
    ;;
esac
