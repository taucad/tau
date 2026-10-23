/**
 * macOS S2 interactive-PTY receipt, run INSIDE real Seatbelt containment (W2; orchestrator S2 rule).
 *
 * The orchestrator's S2 rule for macOS: the PTY must run INSIDE the sandbox, not beside it. This
 * driver uses the SAME sandbox runtime (SRT) Seatbelt path W1 proved runs Bash for S0/S1: it builds
 * the W1 candidate shell grant (`shellProfile`), initializes `SandboxManager` once, and asks it for the
 * wrapped argv of an interactive Bash (`wrapWithSandboxArgv`, which on macOS is a sandbox-exec
 * Seatbelt launch). node-pty allocates a real PTY on the host and spawns that wrapped argv, so the
 * sandboxed Bash owns the controlling terminal and every byte of terminal I/O crosses the boundary
 * (W1's `direct` strategy). The receipt (s2.json) records, each pass/fail with captured evidence:
 *
 *   0. in-seatbelt / contained — the wrapped argv is a sandbox-exec launch, and a synthetic canary file
 *                    OUTSIDE the grant is unreadable from inside the shell (containment is live).
 *   1. isatty      — `test -t 0` AND `test -t 1` are true inside the sandboxed shell.
 *   2. resize      — a programmatic PTY resize (node-pty resize ⇒ TIOCSWINSZ + SIGWINCH) is reflected
 *                    by `stty size`; the receipt shows old→new dims.
 *   3. ctrl-c      — 0x03 interrupts a foreground `sleep 30`: the prompt returns promptly and the
 *                    status is 130 (SIGINT), not a 30 s wait.
 *   4. ctrl-z/fg   — 0x1a suspends a running job (the shell reports it Stopped) and `fg` resumes it to
 *                    completion (its done-marker appears only AFTER fg) — real job control.
 *   5. unicode     — a UTF-8 string (accent + CJK + emoji) round-trips with no mojibake.
 *
 * Also verified: node-pty's prebuilt `spawn-helper` is executable (npm can drop the exec bit, which
 * makes every spawn fail with `posix_spawnp failed.`; the workflow chmods it and this records it).
 *
 * Fail-closed: no node-pty, a non-executable spawn-helper, an SRT init/wrap error, no prompt, or an
 * unevaluable check is a typed FAILURE with the captured exit/transcript — never a false pass. Runs as
 * the ordinary non-elevated runner user. The canary is synthetic; no secret is read or recorded.
 *
 * Dev-only evidence. Never shipped; never run elevated (no sudo).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SandboxManager } from '@anthropic-ai/sandbox-runtime';

import type { Check, ShellGrant } from '../lib.mts';
import { check, fixtureRoot, sandboxRuntime, shellProfile, sleep, spikeRequire, writeJson } from '../lib.mts';

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'reaping-spike');
const row = process.env['TAU_SPIKE_ROW'] ?? `${platform()}-${arch()}`;
const prompt = 'tau-s2$ ';

// The W1 candidate shell grant: project/home/tmp writable, toolchain read-only, the user home and
// shared temp roots denied. `outside` sits under the (denied) fixture root but in no grant.
const root = fixtureRoot();
const project = join(root, 'project');
const home = join(root, 'home');
const temporary = join(root, 'tmp');
const outside = join(root, 'outside');
for (const directory of [project, home, temporary, outside]) {
  mkdirSync(directory, { recursive: true });
}
const canary = join(outside, 'tau-s2-outside-canary.txt');
writeFileSync(canary, 'tau-s2-synthetic-canary\n');
// Detached-descendant containment fixture: a file INSIDE the grant (positive control) and the perl
// double-fork the sandboxed shell runs. The grandchild reparents to launchd, then tries to copy the
// OUTSIDE canary and the INSIDE file into $TMPDIR, recording ppid + errno; the unsandboxed driver
// observes the results externally. Synthetic content only.
const insideFile = join(project, 'tau-s2-inside.txt');
const insideContent = 'tau-s2-inside-ok\n';
writeFileSync(insideFile, insideContent);
const escapeScript = join(project, 'tau-s2-escape.pl');
writeFileSync(
  escapeScript,
  [
    'use POSIX;',
    'my ($canary, $inside, $tmp) = @ARGV;',
    "exit 0 if fork();          # the shell's child returns at once",
    'POSIX::setsid();           # new session',
    'exit 0 if fork();          # intermediate exits -> grandchild reparents to launchd',
    'select(undef, undef, undef, 0.8);',
    'my $pp = getppid();',
    'open(my $r, ">", "$tmp/escape-result") or exit 3;',
    'if (open(my $f, "<", $canary)) {',
    '  local $/; my $d = <$f>;',
    '  open(my $o, ">", "$tmp/escape-copy"); print $o $d; close $o;',
    '  print $r "ppid=$pp outside=read\\n";',
    '} else {',
    '  print $r "ppid=$pp outside=denied errno=" . ($! + 0) . " err=$!\\n";',
    '}',
    'if (open(my $g, "<", $inside)) {',
    '  local $/; my $d = <$g>;',
    '  open(my $o, ">", "$tmp/inside-copy"); print $o $d; close $o;',
    '  print $r "inside=read\\n";',
    '} else {',
    '  print $r "inside=denied errno=" . ($! + 0) . "\\n";',
    '}',
    'close $r;',
    'open(my $done, ">", "$tmp/escape-done"); close $done;',
    '',
  ].join('\n'),
);
let escapeEvidence: Record<string, unknown> = {};
const grant: ShellGrant = { project, home, temporary, toolchain: ['/usr/bin', '/bin'] };

const run = (command: string, args: readonly string[]): string => {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
};

const runtimeVersion = (): string => {
  try {
    return sandboxRuntime().version;
  } catch (error) {
    return `unresolved: ${error instanceof Error ? error.message : String(error)}`;
  }
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
  containment: { runtime: '@anthropic-ai/sandbox-runtime', version: runtimeVersion(), grant, launch: 'direct' },
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
let launchEvidence: Record<string, unknown> = {};

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/** node-pty's prebuilt spawn-helper(s): each must exist and carry an exec bit, or spawn fails. */
const spawnHelperState = (): Array<{ path: string; executable: boolean }> => {
  let directory: string;
  try {
    directory = resolve(dirname(spikeRequire.resolve('node-pty')), '..');
  } catch {
    return [];
  }
  return [
    join(directory, 'build', 'Release', 'spawn-helper'),
    join(directory, 'prebuilds', `darwin-${arch()}`, 'spawn-helper'),
  ]
    .filter((path) => existsSync(path))
    .map((path) => ({ path, executable: (statSync(path).mode & 0o111) !== 0 }));
};

const main = async (): Promise<void> => {
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

  const helpers = spawnHelperState();
  checks.push(
    check(
      's2.spawn-helper-exec',
      "node-pty's prebuilt spawn-helper exists and is executable",
      helpers.length > 0
        ? helpers.map((h) => `${h.path.split('node-pty/')[1]}=${h.executable ? 'x' : 'no-x'}`).join(' ')
        : 'not found',
      helpers.length > 0 && helpers.every((h) => h.executable),
    ),
  );

  // SRT: one sandbox per process for one immutable profile (W1 D6), then the wrapped Bash argv.
  const environment = {
    HOME: home,
    TMPDIR: temporary,
    PS1: prompt,
    TERM: 'xterm-256color',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
  };
  let wrapped: { argv: string[] };
  try {
    await SandboxManager.initialize(shellProfile(grant) as Parameters<typeof SandboxManager.initialize>[0]);
    const assignments = Object.entries(environment)
      .map(([key, value]) => `${key}=${quote(value)}`)
      .join(' ');
    const inner = ['/bin/bash', '--noprofile', '--norc', '-i'];
    wrapped = await SandboxManager.wrapWithSandboxArgv(
      `${assignments} exec ${inner.map((part) => quote(part)).join(' ')}`,
      '/bin/sh',
      undefined,
      undefined,
      project,
      { commandId: 's2-srt' },
    );
  } catch (error) {
    checks.push(
      check(
        's2.srt-wrap',
        'the sandbox runtime initializes the W1 shell profile and wraps an interactive Bash',
        error instanceof Error ? error.message : String(error),
        false,
      ),
    );
    return;
  }
  const seatbeltIndex = wrapped.argv.findIndex((part) => basename(part) === 'sandbox-exec');
  launchEvidence = {
    argv0: wrapped.argv[0],
    argc: wrapped.argv.length,
    sandboxExecAt: seatbeltIndex,
    profileFlag: seatbeltIndex >= 0 ? wrapped.argv[seatbeltIndex + 1] : null,
  };
  checks.push(
    check(
      's2.in-seatbelt',
      'the SRT-wrapped launch is a sandbox-exec (Seatbelt) launch of the interactive Bash',
      JSON.stringify(launchEvidence),
      seatbeltIndex >= 0,
    ),
  );

  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', ...environment };
  let terminal: Terminal;
  try {
    const t = pty.spawn(wrapped.argv[0]!, wrapped.argv.slice(1), {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: project,
      env,
    });
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
        'a PTY can be allocated and the SRT-wrapped interactive Bash spawned in it',
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

  // (0) containment is live: the outside canary is unreadable, a granted temp file is writable+readable.
  // Echo-safe like M1..M5: the typed command line contains "M0:$(", never "M0:R"/"M0:D".
  const contained = await send(
    `echo M0:$(cat ${quote(canary)} >/dev/null 2>&1 && echo R || echo D):$( (echo tau > "$TMPDIR/tau-s2-w" && cat "$TMPDIR/tau-s2-w") 2>/dev/null || echo none)\r`,
    /M0:([RD]):(\S+)/,
  );
  const outsideState = contained?.[1] === 'D' ? 'denied' : contained?.[1] === 'R' ? 'readable' : 'no answer';
  checks.push(
    check(
      's2.contained',
      'inside the PTY shell, a canary OUTSIDE the grant is unreadable while a granted temp path is writable',
      `outside=${outsideState} grantedTmp=${contained?.[2] ?? 'no answer'}`,
      outsideState === 'denied' && contained?.[2] === 'tau',
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

  // (6) A detached descendant stays inside the policy. The sandboxed shell runs a double-fork whose
  // grandchild reparents to launchd, then tries to read the OUTSIDE canary (must be refused: no copied
  // bytes, EPERM recorded) and a file INSIDE its grant (positive control: copied byte-for-byte). The
  // unsandboxed driver observes the result files externally; nothing here trusts the child's word
  // alone — the copied bytes (or their absence) are read from disk by this process.
  terminal.write(`perl ${quote(escapeScript)} ${quote(canary)} ${quote(insideFile)} "$TMPDIR"\r`);
  const doneFile = join(temporary, 'escape-done');
  const doneEnd = Date.now() + 12_000;
  while (!existsSync(doneFile) && Date.now() < doneEnd) {
    await sleep(100);
  }
  const readOr = (path: string): string | null => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  };
  const result = readOr(join(temporary, 'escape-result')) ?? '';
  const escapeCopy = readOr(join(temporary, 'escape-copy'));
  const insideCopy = readOr(join(temporary, 'inside-copy'));
  const ppid = /ppid=(\d+)/.exec(result)?.[1];
  const errnoOutside = /outside=denied errno=(\d+)/.exec(result)?.[1];
  escapeEvidence = {
    done: existsSync(doneFile),
    childReport: result.trim(),
    reparentedPpid: ppid ?? null,
    outsideCopiedBytes: escapeCopy === null ? 0 : Buffer.byteLength(escapeCopy),
    outsideErrno: errnoOutside ?? null,
    insideCopyMatches: insideCopy === insideContent,
  };
  checks.push(
    check(
      's2.detached-descendant-contained',
      'a double-forked grandchild reparented to launchd (ppid 1) is refused the outside canary (0 bytes copied, EPERM) yet reads inside its grant',
      JSON.stringify(escapeEvidence),
      existsSync(doneFile) &&
        ppid === '1' &&
        escapeCopy === null &&
        errnoOutside === '1' &&
        insideCopy === insideContent,
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
    evidence: {
      launch: launchEvidence,
      resize: resizeEvidence,
      ctrlc: ctrlcEvidence,
      job: jobEvidence,
      detachedDescendant: escapeEvidence,
      exit: exitState ?? null,
    },
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
