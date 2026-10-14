"""Spike S25: drive a client's interactive terminal UI under a pseudo-terminal and keep the raw screen bytes.

Spike code only, standard library only. Usage (environment prepared by run.ts):
    python3 -I scripts/spikes/s25/tui.py <codex|claude> <client-bin> <cwd> <out-file> <seconds> [client args...]
The screen bytes are written to <out-file>; run.ts strips escapes and searches them. Exit code 0.
"""

import fcntl
import os
import pty
import select
import struct
import sys
import termios
import time

client, binary, cwd, out, seconds = sys.argv[1:6]
extra = sys.argv[6:]
prompt = b'Call the progress_probe tool.'

pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    if client == 'codex':
        os.execv(binary, [binary, '--no-alt-screen', *extra, prompt.decode()])
    os.execv(binary, [binary, *extra])

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
screen = b''
deadline = time.time() + float(seconds)
typed_at = time.time() + 6 if client == 'claude' else None
while time.time() < deadline:
    ready, _, _ = select.select([fd], [], [], 0.1)
    if ready:
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            break
        screen += chunk
        # Answer cursor-position queries so the TUI can lay itself out.
        if b'\x1b[6n' in chunk:
            os.write(fd, b'\x1b[1;1R')
    if typed_at is not None and time.time() >= typed_at:
        os.write(fd, prompt)
        time.sleep(1)
        os.write(fd, b'\r')
        typed_at = None

with open(out, 'wb') as handle:
    handle.write(screen)
os.kill(pid, 9)
