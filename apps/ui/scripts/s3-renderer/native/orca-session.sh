#!/bin/sh
# Real Orca under Xvfb + AT-SPI for the R04 Orca receipts (`run.mts --suite r04orca`). Run inside
# `dbus-run-session`. Usage: orca-session.sh <out-dir> <command...>; exports S3_ORCA_LOG for the command.
set -u
OUT="$1"; shift
mkdir -p "$OUT"
export DISPLAY=:91 NO_AT_BRIDGE=0 ACCESSIBILITY_ENABLED=1 GTK_MODULES=gail:atk-bridge
Xvfb :91 -screen 0 1920x1080x24 >/dev/null 2>&1 &
XPID=$!
sleep 1
/usr/libexec/at-spi-bus-launcher --launch-immediately >/dev/null 2>&1 &
sleep 1
gsettings set org.gnome.desktop.a11y.applications screen-reader-enabled true 2>/dev/null
gsettings set org.gnome.desktop.interface toolkit-accessibility true 2>/dev/null
export S3_ORCA_LOG="$OUT/orca-debug.log"
orca --version >"$OUT/orca-version.txt" 2>&1
orca --replace --debug-file="$S3_ORCA_LOG" >"$OUT/orca-stdout.log" 2>&1 &
OPID=$!
sleep 4
"$@"
STATUS=$?
sleep 2
kill $OPID $XPID 2>/dev/null
exit $STATUS
