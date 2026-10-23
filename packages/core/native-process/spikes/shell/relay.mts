/**
 * In-sandbox PTY host for the S2 `relay` strategy.
 *
 * Started by the sandbox runtime's wrapper, so it and everything it spawns already run inside the
 * contained boundary. It opens a PTY here, runs `bash --noprofile --norc -i` in it, copies PTY
 * output to stdout, and reads newline-delimited JSON frames from stdin: `{t:'i', d:<base64>}` is
 * input and `{t:'r', c, r}` is a resize. Its exit status is the shell's.
 */
import { createInterface } from 'node:readline';

import { spikeRequire } from './lib.mts';

const pty = spikeRequire('node-pty') as typeof import('node-pty');

const bash = process.argv[2]!;
const terminal = pty.spawn(bash, ['--noprofile', '--norc', '-i'], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
});
terminal.onData((data) => {
  process.stdout.write(data);
});
terminal.onExit(({ exitCode }) => {
  process.stdout.end(() => process.exit(exitCode));
});
for await (const line of createInterface({ input: process.stdin })) {
  const frame = JSON.parse(line) as { t: 'i'; d: string } | { t: 'r'; c: number; r: number };
  if (frame.t === 'i') {
    terminal.write(Buffer.from(frame.d, 'base64').toString('utf8'));
  } else {
    terminal.resize(frame.c, frame.r);
  }
}
