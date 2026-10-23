/**
 * S2: does a real PTY reach Bash through the same sandbox boundary?
 *
 * Runs in the process that would own the PTY in the product (plain Node here; the Electron utility
 * process harness loads the same module). Reads `{ profile, bash, cwd, strategy }` as JSON on stdin,
 * initializes the pinned runtime once, and drives an interactive Bash through one of two launch
 * strategies, printing one JSON object of checks:
 *
 * - `direct`: node-pty opens the PTY on the host and spawns the runtime's wrapper inside it, so the
 *   sandboxed Bash inherits the PTY end the wrapper passes through.
 * - `relay`: the runtime's wrapper starts `relay.mts` inside the sandbox; the relay opens the PTY
 *   there and carries input/resize frames over the wrapper's pipes.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

import { SandboxManager } from '@anthropic-ai/sandbox-runtime';

import type { Check } from './lib.mts';
import { check, isWindows, shellPath, sleep, spikeDirectory, spikeRequire } from './lib.mts';

type Terminal = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  pause: () => void;
  resume: () => void;
  kill: () => void;
  onData: (listener: (data: string) => void) => void;
  exited: Promise<{ exitCode: number | null; signal: number | string | null }>;
};

type PtyJob = {
  profile: Parameters<typeof SandboxManager.initialize>[0];
  bash: string;
  cwd: string;
  strategy: 'direct' | 'relay';
  home: string;
  temporary: string;
};

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;
const prompt = 'tau-spike$ ';

const job = JSON.parse(await text(process.stdin)) as PtyJob;
const environment = {
  HOME: job.home,
  TMPDIR: job.temporary,
  TMP: job.temporary,
  TEMP: job.temporary,
  PS1: prompt,
  TERM: 'xterm-256color',
};

/** The wrapped vector for `inner`, an argv run inside the sandbox. */
const wrap = async (inner: readonly string[]): Promise<{ argv: string[]; env: NodeJS.ProcessEnv }> => {
  if (isWindows) {
    const [exe, ...args] = inner;
    const wrapped = await SandboxManager.wrapWithSandboxArgv(
      args.at(-1)!,
      { exe: exe!, args: args.slice(0, -1) },
      undefined,
      undefined,
      job.cwd,
      { commandId: `pty-${job.strategy}` },
    );
    const separator = wrapped.argv.indexOf('--');
    wrapped.argv.splice(
      separator,
      0,
      ...Object.entries(environment).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    );
    return wrapped;
  }
  const assignments = Object.entries(environment)
    .map(([key, value]) => `${key}=${quote(value)}`)
    .join(' ');
  const wrapped = await SandboxManager.wrapWithSandboxArgv(
    `${assignments} exec ${inner.map((part) => quote(part)).join(' ')}`,
    '/bin/sh',
    undefined,
    undefined,
    job.cwd,
    { commandId: `pty-${job.strategy}` },
  );
  return { argv: wrapped.argv, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', ...environment } };
};

/** On Windows the runtime's inner shell is this Bash itself, so `-c` re-execs it interactively. */
const interactiveBash = isWindows
  ? [job.bash, '--noprofile', '--norc', '-c', `exec ${quote(shellPath(job.bash))} --noprofile --norc -i`]
  : [job.bash, '--noprofile', '--norc', '-i'];

const direct = async (): Promise<Terminal> => {
  const pty = spikeRequire('node-pty') as typeof import('node-pty');
  const { argv, env } = await wrap(interactiveBash);
  const terminal = pty.spawn(argv[0]!, argv.slice(1), {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: job.cwd,
    env,
  });
  return {
    write: (data) => terminal.write(data),
    resize: (cols, rows) => terminal.resize(cols, rows),
    pause: () => terminal.pause(),
    resume: () => terminal.resume(),
    kill: () => terminal.kill(),
    onData: (listener) => terminal.onData(listener),
    exited: new Promise((resolveExit) =>
      terminal.onExit(({ exitCode, signal }) => resolveExit({ exitCode, signal: signal ?? null })),
    ),
  };
};

const relay = async (): Promise<Terminal> => {
  const relayScript = join(spikeDirectory, 'relay.mts');
  const inner = isWindows
    ? [
        job.bash,
        '--noprofile',
        '--norc',
        '-c',
        `exec ${quote(shellPath(process.execPath))} ${quote(shellPath(relayScript))} ${quote(shellPath(job.bash))}`,
      ]
    : [process.execPath, relayScript, job.bash];
  const { argv, env } = await wrap(inner);
  const child = spawn(argv[0]!, argv.slice(1), {
    cwd: job.cwd,
    env,
    shell: false,
    detached: !isWindows,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const frame = (value: unknown): void => {
    child.stdin.write(`${JSON.stringify(value)}\n`);
  };
  let errors = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (errors = (errors + chunk).slice(-4000)));
  return {
    write: (data) => frame({ t: 'i', d: Buffer.from(data, 'utf8').toString('base64') }),
    resize: (cols, rows) => frame({ t: 'r', c: cols, r: rows }),
    pause: () => child.stdout.pause(),
    resume: () => child.stdout.resume(),
    kill: () => child.kill('SIGKILL'),
    onData: (listener) => child.stdout.setEncoding('utf8').on('data', listener),
    exited: new Promise((resolveExit) =>
      child.once('exit', (exitCode, signal) => {
        if (errors) {
          process.stderr.write(`relay stderr: ${errors}\n`);
        }
        resolveExit({ exitCode, signal });
      }),
    ),
  };
};

const checks: Check[] = [];
const transcript: string[] = [];
let output = '';
let exitState: { exitCode: number | null; signal: number | string | null } | undefined;

try {
  await SandboxManager.initialize(job.profile);
  const terminal = job.strategy === 'direct' ? await direct() : await relay();
  terminal.onData((data) => {
    output += data;
    transcript.push(data);
  });
  void terminal.exited.then((state) => (exitState = state));

  const waitOutput = async (pattern: RegExp, from: number, timeoutMs: number): Promise<RegExpExecArray | undefined> => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const match = pattern.exec(output.slice(from));
      if (match) {
        return match;
      }
      if (exitState) {
        break;
      }
      await sleep(50);
    }
    return pattern.exec(output.slice(from)) ?? undefined;
  };
  const send = async (line: string, pattern: RegExp, timeoutMs = 10_000): Promise<RegExpExecArray | undefined> => {
    const from = output.length;
    terminal.write(line);
    return waitOutput(pattern, from, timeoutMs);
  };

  const ready = await waitOutput(new RegExp(prompt.replace('$', String.raw`\$`)), 0, 30_000);
  checks.push(
    check(
      's2.prompt',
      'interactive Bash prompt appears',
      ready ? 'prompt seen' : `no prompt; exit=${JSON.stringify(exitState)}`,
      Boolean(ready),
    ),
  );

  const tty = await send(
    'echo M1:$(test -t 0 && echo y || echo n):$(test -t 1 && echo y || echo n)\r',
    /M1:([yn]):([yn])/,
  );
  checks.push(
    check(
      's2.isatty',
      'stdin and stdout are terminals (test -t)',
      tty ? `stdin=${tty[1]} stdout=${tty[2]}` : 'no answer',
      tty?.[1] === 'y' && tty[2] === 'y',
    ),
  );

  const size = await send('echo M2:$(stty size 2>&1)\r', /M2:([^\r\n]*)/);
  checks.push(
    check('s2.stty-size', 'stty size reports 24 80', size?.[1] ?? 'no answer', size?.[1]?.trim() === '24 80'),
  );

  terminal.resize(100, 40);
  await sleep(500);
  const resized = await send('echo M3:$(stty size 2>&1)\r', /M3:([^\r\n]*)/);
  checks.push(
    check(
      's2.resize',
      'stty size reports 40 100 after resize',
      resized?.[1] ?? 'no answer',
      resized?.[1]?.trim() === '40 100',
    ),
  );

  terminal.write('sleep 30\r');
  await sleep(1000);
  const interruptedAt = Date.now();
  terminal.write('\u0003');
  const interrupted = await send('echo M4:$?\r', /M4:(\d+)/, 8000);
  checks.push(
    check(
      's2.ctrl-c',
      'Ctrl-C interrupts the foreground command (status 130) and the shell survives',
      interrupted ? `status=${interrupted[1]} after ${Date.now() - interruptedAt}ms` : 'no answer',
      interrupted?.[1] === '130',
    ),
  );

  const unicode = await send(String.raw`printf 'M5:\303\251\344\270\255\360\237\230\200\n'` + '\r', /M5:(\S+)/);
  checks.push(
    check(
      's2.unicode',
      'UTF-8 é中😀 round-trips',
      unicode?.[1] ?? 'no answer',
      unicode?.[1]?.startsWith('é中😀') === true,
    ),
  );

  const total = 2_000_000;
  const before = output.length;
  terminal.write(`head -c ${total} /dev/zero | tr '\\0' Q; echo; echo M6:done\r`);
  await waitOutput(/Q{1000}/, before, 15_000);
  terminal.pause();
  await sleep(1500);
  terminal.resume();
  const flood = await waitOutput(/M6:done/, before, 60_000);
  const received = (output.slice(before).match(/Q/g) ?? []).length;
  checks.push(
    check(
      's2.backpressure',
      `all ${total} bytes arrive after a 1.5 s consumer pause (echoed command adds one)`,
      `received=${received} finished=${Boolean(flood)}`,
      Boolean(flood) && received >= total && received <= total + 2,
    ),
  );

  terminal.write('\u0004');
  const exitDeadline = Date.now() + 10_000;
  while (!exitState && Date.now() < exitDeadline) {
    await sleep(100);
  }
  checks.push(
    check(
      's2.ctrl-d',
      'Ctrl-D at an idle prompt ends the shell with status 0',
      JSON.stringify(exitState ?? 'still running'),
      exitState?.exitCode === 0,
    ),
  );
  if (!exitState) {
    terminal.kill();
  }
} catch (error) {
  checks.push(
    check(
      's2.launch',
      'PTY strategy launches inside the sandbox',
      error instanceof Error ? error.message : String(error),
      false,
    ),
  );
}

process.stdout.write(
  `${JSON.stringify({ strategy: job.strategy, checks, transcriptTail: transcript.join('').slice(-6000) })}\n`,
);
await SandboxManager.reset();
process.exit(0);
