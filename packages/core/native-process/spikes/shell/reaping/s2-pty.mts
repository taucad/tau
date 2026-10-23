/**
 * macOS S2 interactive-PTY receipt, run INSIDE the Seatbelt containment (W2; orchestrator S2 rule).
 *
 * The orchestrator's S2 rule for macOS: the PTY must run INSIDE the sandbox, not beside it. This
 * driver allocates a real PTY on the host (node-pty) and runs an interactive Bash inside the SAME
 * per-session deny-default Seatbelt profile the reaping spike owns (session.sb, via `sandbox-exec
 * -f session.sb -D MARKER=… -D WORKDIR=… -D SCRIPTDIR=…`). Every byte of terminal I/O therefore
 * crosses the sandbox boundary, and job control / signals / ioctls are exercised against a process
 * confined by `deny default`. It records five checks with captured evidence into s2.json:
 *
 *   1. isatty      — `test -t 0` AND `test -t 1` are true inside the sandboxed shell.
 *   2. resize      — a programmatic PTY resize (node-pty resize ⇒ TIOCSWINSZ + SIGWINCH) is reflected
 *                    by `stty size`; the receipt shows old→new dims.
 *   3. ctrl-c      — 0x03 interrupts a foreground `sleep 30`: the prompt returns promptly and the
 *                    status is 130 (SIGINT), not a 30 s wait.
 *   4. ctrl-z/fg   — 0x1a suspends a running job (the shell reports it Stopped) and `fg` resumes it to
 *                    completion (its done-marker appears only AFTER fg) — real job control.
 *   5. unicode     — a UTF-8 string (accent + CJK + emoji) round-trips with no mojibake.
 *
 * Fail-closed: if node-pty is absent, the PTY cannot be allocated under the profile, or a check cannot
 * be evaluated (no prompt, shell died, no answer), that check is a typed FAILURE with the captured
 * exit/transcript — never a false pass. Runs as the ordinary non-elevated runner user.
 *
 * Dev-only evidence. Never shipped; never run elevated (no sudo).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { arch, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Check } from '../lib.mts';
import { check, sleep, spikeRequire, writeJson } from '../lib.mts';

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'reaping-spike');
const row = process.env['TAU_SPIKE_ROW'] ?? `${platform()}-${arch()}`;
const workRootRaw = join(process.env['RUNNER_TEMP'] ?? '/tmp', `tau-reaping-s2-${process.pid}`);
mkdirSync(workRootRaw, { recursive: true });
const workRoot = realpathSync(workRootRaw); // Seatbelt matches the resolved path; see session.sb.

const profile = join(here, 'session.sb');
const prompt = 'tau-s2$ ';

const run = (command: string, args: readonly string[]): string => {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
};

const identity = () => ({
  row,
  source: {
    sha: process.env['GITHUB_SHA'] ?? run('git', ['-C', here, 'rev-parse', 'HEAD']),
    ref: process.env['GITHUB_REF'] ?? 'local',
    run: process.env['GITHUB_RUN_ID']
      ? `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}/attempts/${process.env['GITHUB_RUN_ATTEMPT']}`
      : 'local',
  },
  os: {
    platform: platform(),
    arch: arch(),
    build: platform() === 'darwin' ? run('sw_vers', []).replaceAll(/\s+/g, ' ') : release(),
    runnerImage: process.env['ImageOS'] ?? 'unknown',
    imageVersion: process.env['ImageVersion'] ?? 'unknown',
  },
  node: { version: process.version, abi: process.versions.modules },
  helpers: {
    sandboxExec: run('which', ['sandbox-exec']) || 'absent',
    profile: existsSync(profile) ? profile : 'absent',
  },
  elevated: process.getuid?.() === 0,
});

type PtyModule = typeof import('node-pty');
type Terminal = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: (e: { exitCode: number | null; signal: number | null }) => void) => void;
};

const checks: Check[] = [];
const transcript: string[] = [];
let output = '';
let exitState: { exitCode: number | null; signal: number | null } | undefined;
const resizeEvidence: Record<string, string> = {};
let ctrlcEvidence = '';
let jobEvidence: Record<string, unknown> = {};

const main = async (): Promise<void> => {
  if (!existsSync(profile)) {
    checks.push(check('s2.profile-present', 'session.sb profile exists on this host', 'missing', false));
    return;
  }

  let pty: PtyModule;
  try {
    pty = spikeRequire('node-pty') as PtyModule;
  } catch (error) {
    checks.push(
      check(
        's2.pty-module',
        'node-pty is installed for the S2 probe',
        error instanceof Error ? error.message : String(error),
        false,
      ),
    );
    return;
  }

  const uuid = randomUUID();
  const dir = join(workRoot, uuid);
  mkdirSync(dir, { recursive: true });
  const marker = join(dir, `tau-session-${uuid}.marker`);
  writeFileSync(marker, '');

  // node-pty allocates the master PTY in this (unsandboxed) process; the child becomes a session
  // leader with the slave as its controlling terminal and THEN execs sandbox-exec, so the interactive
  // Bash is confined by session.sb while owning a real controlling tty.
  const argv = [
    '-f',
    profile,
    '-D',
    `MARKER=${marker}`,
    '-D',
    `WORKDIR=${dir}`,
    '-D',
    `SCRIPTDIR=${here}`,
    '/bin/bash',
    '--noprofile',
    '--norc',
    '-i',
  ];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: dir,
    TMPDIR: dir,
    PS1: prompt,
    TERM: 'xterm-256color',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  };

  let terminal: Terminal;
  try {
    const t = pty.spawn('/usr/bin/sandbox-exec', argv, { name: 'xterm-256color', cols: 80, rows: 24, cwd: dir, env });
    terminal = {
      write: (d) => t.write(d),
      resize: (c, r) => t.resize(c, r),
      kill: () => t.kill(),
      onData: (l) => t.onData(l),
      onExit: (l) => t.onExit(({ exitCode, signal }) => l({ exitCode, signal: signal ?? null })),
    };
  } catch (error) {
    checks.push(
      check(
        's2.pty-alloc',
        'a PTY can be allocated and an interactive Bash launched under the Seatbelt profile',
        error instanceof Error ? error.message : String(error),
        false,
      ),
    );
    return;
  }

  terminal.onData((data) => {
    output += data;
    transcript.push(data);
  });
  terminal.onExit((state) => (exitState = state));

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

  // The interactive prompt must appear (the sandboxed shell started and owns the tty).
  const ready = await waitOutput(/tau-s2\$ /, 0, 30_000);
  checks.push(
    check(
      's2.pty-alloc',
      'a PTY is allocated and the interactive Bash prompt appears under the Seatbelt profile',
      ready ? 'prompt seen' : `no prompt; exit=${JSON.stringify(exitState)} tail=${output.slice(-200)}`,
      Boolean(ready),
    ),
  );
  if (!ready) {
    terminal.kill();
    return;
  }

  // (1) isatty.
  const tty = await send(
    'echo M1:$(test -t 0 && echo y || echo n):$(test -t 1 && echo y || echo n)\r',
    /M1:([yn]):([yn])/,
  );
  checks.push(
    check(
      's2.isatty',
      'stdin and stdout are terminals inside the sandbox (test -t 0 / -t 1)',
      tty ? `stdin=${tty[1]} stdout=${tty[2]}` : 'no answer',
      tty?.[1] === 'y' && tty[2] === 'y',
    ),
  );

  // (2) programmatic resize reflected by stty size (old → new).
  const before = await send('echo M2:$(stty size 2>&1)\r', /M2:([^\r\n]*)/);
  resizeEvidence['old'] = before?.[1]?.trim() ?? 'no answer';
  terminal.resize(100, 40);
  await sleep(600);
  const after = await send('echo M3:$(stty size 2>&1)\r', /M3:([^\r\n]*)/);
  resizeEvidence['new'] = after?.[1]?.trim() ?? 'no answer';
  checks.push(
    check(
      's2.resize',
      'a programmatic PTY resize (TIOCSWINSZ/SIGWINCH) is reflected by stty size',
      `old=${resizeEvidence['old']} -> new=${resizeEvidence['new']}`,
      resizeEvidence['old'] === '24 80' && resizeEvidence['new'] === '40 100',
    ),
  );

  // (3) Ctrl-C interrupts a foreground sleep 30 (status 130, prompt back promptly).
  terminal.write('sleep 30\r');
  await sleep(1000);
  const t0 = Date.now();
  terminal.write('\u0003');
  const interrupted = await send('echo M4:$?\r', /M4:(\d+)/, 8000);
  const elapsed = Date.now() - t0;
  ctrlcEvidence = interrupted ? `status=${interrupted[1]} elapsedMs=${elapsed}` : `no answer elapsedMs=${elapsed}`;
  checks.push(
    check(
      's2.ctrl-c',
      'Ctrl-C (0x03) interrupts the foreground sleep 30 with status 130 and the prompt returns promptly (not a 30 s wait)',
      ctrlcEvidence,
      interrupted?.[1] === '130' && elapsed < 15_000,
    ),
  );

  // (4) Ctrl-Z suspends a job, fg resumes it to completion (done-marker appears only after fg).
  const jobFrom = output.length;
  terminal.write('sleep 2; echo JOBDONE\r');
  await sleep(700);
  terminal.write('\u001a'); // Ctrl-Z -> SIGTSTP to the foreground job
  const stopped = await waitOutput(/Stopped|Suspended|suspended/, jobFrom, 6000);
  const doneBeforeFg = /JOBDONE/.test(output.slice(jobFrom));
  const jobsListing = await send('jobs\r', /\[\d+\]/, 4000);
  terminal.write('fg\r');
  const doneAfterFg = await waitOutput(/JOBDONE/, jobFrom, 8000);
  jobEvidence = {
    stopped: Boolean(stopped),
    stoppedLine: stopped?.[0] ?? null,
    jobsListing: jobsListing?.[0] ?? null,
    doneBeforeFg,
    doneAfterFg: Boolean(doneAfterFg),
  };
  checks.push(
    check(
      's2.ctrl-z-fg',
      'Ctrl-Z (0x1a) suspends a running job (reported Stopped) and fg resumes it to completion (done-marker only after fg)',
      JSON.stringify(jobEvidence),
      Boolean(stopped) && !doneBeforeFg && Boolean(doneAfterFg),
    ),
  );

  // (5) UTF-8 round-trip: é (C3 A9) + 中 (E4 B8 AD) + 😀 (F0 9F 98 80), written as raw octal bytes.
  const unicode = await send(String.raw`printf 'M5:\303\251\344\270\255\360\237\230\200\n'` + '\r', /M5:(\S+)/);
  checks.push(
    check(
      's2.unicode',
      'UTF-8 é中😀 round-trips through the sandboxed PTY with no mojibake',
      unicode?.[1] ?? 'no answer',
      unicode?.[1]?.startsWith('é中😀') === true,
    ),
  );

  // Close the shell.
  terminal.write('exit\r');
  const end = Date.now() + 5000;
  while (!exitState && Date.now() < end) {
    await sleep(100);
  }
  if (!exitState) {
    terminal.kill();
  }
};

const finish = (): never => {
  const verdict = checks.length > 0 && checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail';
  writeJson(join(evidenceDirectory, row, 's2.json'), {
    spike: 'W2-reaping-s2-pty-in-sandbox',
    identity: identity(),
    verdict,
    checks,
    evidence: { resize: resizeEvidence, ctrlc: ctrlcEvidence, job: jobEvidence, exit: exitState ?? null },
    transcriptTail: transcript.join('').slice(-6000),
  });
  process.stdout.write(`[${row}] s2-pty-in-sandbox: ${verdict}\n`);
  for (const c of checks) {
    process.stdout.write(`  ${c.verdict === 'pass' ? 'PASS' : 'FAIL'} ${c.id}: ${c.observed.slice(0, 160)}\n`);
  }
  process.exit(0);
};

// Driver watchdog (inside the workflow's 6-minute step bound): a stalled PTY becomes a typed failure
// receipt with whatever checks completed, never a job timeout.
setTimeout(() => {
  checks.push(
    check(
      's2.driver-timeout',
      'the S2 PTY driver completes within its 4-minute bound',
      `watchdog fired; completed checks=${checks.length}`,
      false,
    ),
  );
  finish();
}, 4 * 60_000).unref();

try {
  await main();
} catch (error) {
  checks.push(
    check(
      's2.driver',
      'the S2 PTY driver ran to completion',
      error instanceof Error ? error.message : String(error),
      false,
    ),
  );
}
finish();
