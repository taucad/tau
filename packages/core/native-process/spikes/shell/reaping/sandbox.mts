/**
 * macOS descendant-reaping spike — CANDIDATE (c): sandbox-membership enumeration (W2; I7/D26).
 *
 * The baseline probe (probe.mts) and candidates (a)/(b) (candidates.mts) all chase the process TREE and
 * all leave the same hole non-elevated: a descendant that double-forks/daemonizes reparents to launchd
 * BEFORE cancel, so no ppid walk, responsibility read or kqueue track reaches it (empirically, run
 * 39900487555). Candidate (c) abandons the tree. It launches each session's shell inside a per-session
 * Seatbelt profile (session.sb) whose ONLY distinguishing rule is `(allow file-read* (literal MARKER))`
 * over a per-session UUID marker, everything else `deny default`. Every descendant INHERITS the profile
 * and cannot leave it — daemonized, double-forked, setsid or not, however it reparents. Membership is
 * then a property of the SANDBOX, not the tree, read for any pid with `sandbox_check` (no task port):
 *
 *   inOurSession(pid) = sandbox_check(pid,"file-read-data",PATH,MARKER)==allowed
 *                    && sandbox_check(pid,"file-read-data",PATH,CONTROL)==denied
 *
 * The control path (a path at the filesystem root, in no allow rule) is denied by every session's
 * `deny default` but permitted for every UNSANDBOXED pid, so the control half rejects the unsandboxed
 * world; the unique marker half rejects foreign sessions (their profile denies our marker literal).
 *
 * At cancel, tau-sbenum returns the in-session pid set; the driver SIGSTOPs then SIGKILLs it and
 * re-enumerates until empty. `sandbox_check` is SPI, weak-imported in the shim:
 * absent ⇒ verdict `blocked`/`spi-unavailable`, NEVER a false pass. Reaping is decided ONLY by the
 * external sentinel canary (a file the escapee keeps appending to; afterSettle still growing = FAILED).
 *
 * CROSS-SESSION SAFETY (the disqualifying check): every combo also runs a SECOND concurrent session
 * with a DIFFERENT uuid/marker in its OWN sandbox. The cancel is executed exactly as the strategy
 * dictates — it kills precisely what tau-sbenum returns for OUR marker. The second session's pids must
 * not appear in that set and its canary must keep growing through the settle window. A cross-session
 * kill is recorded as a disqualifying failure even if our own gap closes.
 *
 * Standalone driver. It does NOT touch probe.mts, candidates.mts or supervisor.mts; it writes receipts
 * of the SAME shape into the SAME evidence directory (sbmember.<adv>.json), so summarize.mts renders
 * every strategy in one table.
 *
 * Dev-only evidence. Never shipped; never run elevated (no sudo); synthetic canary/marker only.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { arch, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Check } from '../lib.mts';
import { check, sleep, waitFor, writeJson } from '../lib.mts';

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'reaping-spike');
const row = process.env['TAU_SPIKE_ROW'] ?? `${platform()}-${arch()}`;
const workRootRaw = join(process.env['RUNNER_TEMP'] ?? '/tmp', `tau-reaping-sb-${process.pid}`);
mkdirSync(workRootRaw, { recursive: true });
// Seatbelt evaluates the kernel-RESOLVED path, so the profile's marker/WORKDIR literals must be the
// symlink-canonical form (e.g. /tmp -> /private/tmp) or sandbox_check won't match them. realpath the
// work root once; every per-session dir derives from it, and `here` (the checkout) has no symlink.
const workRoot = realpathSync(workRootRaw);

const advScript = join(here, 'adversaries.sh');
const profile = join(here, 'session.sb');
const binDir = process.env['TAU_REAP_BIN'] ?? join(here, 'bin');
const sbenumBin = join(binDir, 'tau-sbenum');

/** A path at the filesystem root that NO session profile allows — denied by every `deny default`
 * sandbox, permitted for every unsandboxed pid. This is the control half of the membership oracle. */
const controlPath = '/.tau-reaping-control-deny';

type Strategy = 'sbmember';
type Adversary = 'setsid' | 'daemonize' | 'double-fork' | 'sigterm-ignore';

const run = (command: string, args: readonly string[]): { out: string; code: number | null } => {
  // SIGKILL on timeout: the default SIGTERM stays pending on a STOPPED child, so spawnSync would block
  // forever; SIGKILL ends a stopped process too, so every synchronous call here is truly bounded.
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL' });
  return { out: `${r.stdout ?? ''}${r.stderr ?? ''}`, code: r.status };
};

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

const signal = (pid: number, sig: NodeJS.Signals): boolean => {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
};

/** Processes whose command line still carries the run marker — the external truth about stragglers. */
const strays = (mark: string): Array<{ pid: number; ppid: number; cmd: string }> =>
  run('ps', ['-A', '-ww', '-o', 'pid=,ppid=,command='])
    .out.split('\n')
    .filter((line) => line.includes(mark) && !line.includes('ps -A'))
    .map((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      return m ? { pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3]!.slice(0, 200) } : undefined;
    })
    .filter((x): x is { pid: number; ppid: number; cmd: string } => x !== undefined);

type SbReport = {
  spiPresent?: boolean;
  feasible?: boolean;
  blocker?: string;
  match?: number[];
  listed?: number;
  checked?: number;
  sandboxedObserved?: number;
};

const sbenum = (marker: string): SbReport => {
  const r = run(sbenumBin, [marker, controlPath]);
  try {
    return JSON.parse(r.out.trim().split('\n').pop() ?? '{}') as SbReport;
  } catch {
    return { feasible: false, blocker: `unparseable: ${r.out.slice(0, 200)}` };
  }
};

type Session = {
  mark: string;
  marker: string;
  sentinel: string;
  dir: string;
  pid: number | undefined;
  spawnError?: string;
  /** Diagnostics for a silent sandbox kill: sandbox-exec exits non-zero (profile rejected) or the
   * sandboxed shell is SIGKILLed by a denied operation, both of which leave startedBytes=0. */
  stderr: string;
  stderrPath: string;
  exit?: { code: number | null; signal: NodeJS.Signals | null };
};

/** Launch one session inside its own per-session Seatbelt profile. `makeCommand` turns the session's
 * sentinel path into the argv run under the sandbox (the adversary shell, or the preflight sleeper). */
const launchSession = (kind: Adversary, makeCommand: (sentinel: string) => string[]): Session => {
  const uuid = randomUUID();
  const mark = `tau-reap-sbmember-${kind}-${uuid.slice(0, 8)}`;
  const dir = join(workRoot, uuid);
  mkdirSync(dir, { recursive: true });
  const marker = join(dir, `tau-session-${uuid}.marker`);
  writeFileSync(marker, ''); // the literal the profile uniquely allows (empty; synthetic)
  const sentinel = join(dir, `${mark}.log`);
  rmSync(sentinel, { force: true });

  // Session stderr goes to a FILE, not a pipe: every descendant inherits fds 1/2, so a pipe would be
  // held open by any surviving escapee and keep this driver's event loop alive indefinitely.
  const stderrPath = join(dir, 'sandbox-exec.stderr');
  const stderrFd = openSync(stderrPath, 'a');
  const session: Session = { mark, marker, sentinel, dir, pid: undefined, stderr: '', stderrPath };
  const child = spawn(
    '/usr/bin/sandbox-exec',
    [
      '-f',
      profile,
      '-D',
      `MARKER=${marker}`,
      '-D',
      `WORKDIR=${dir}`,
      '-D',
      `SCRIPTDIR=${here}`,
      ...makeCommand(sentinel),
    ],
    { cwd: dir, detached: true, stdio: ['ignore', 'ignore', stderrFd], env: { ...process.env } },
  );
  closeSync(stderrFd);
  session.pid = child.pid;
  child.on('error', (e) => (session.spawnError = e.message));
  child.on('exit', (code, signal) => (session.exit = { code, signal }));
  child.unref();
  return session;
};

/** Read the session's captured sandbox-exec stderr tail (call before the session dir is removed). */
const readStderr = (session: Session): string => {
  try {
    return readFileSync(session.stderrPath, 'utf8').slice(-600);
  } catch {
    return '';
  }
};

/** The adversary shell run inside a session (the sentinel is this session's canary target). */
const adversaryCommand =
  (kind: Adversary) =>
  (sentinel: string): string[] => ['/bin/bash', advScript, kind, sentinel];

// ── one adversary run ─────────────────────────────────────────────────────────────────────────
const runCombo = async (kind: Adversary): Promise<Record<string, unknown>> => {
  const strategy: Strategy = 'sbmember';
  const helperMissing = !existsSync(sbenumBin) || !existsSync(profile);

  if (helperMissing) {
    const blocker = !existsSync(sbenumBin) ? 'tau-sbenum not built on this host' : 'session.sb profile missing';
    return {
      strategy,
      adversary: kind,
      status: 'blocked',
      verdict: 'fail',
      reaped: false,
      blocked: true,
      blocker,
      canary: { startedBytes: 0, beforeCancel: 0, afterCancel: 0, afterSettle: 0 },
      checks: [],
    };
  }

  // SECOND concurrent session: a different uuid/marker, in its own sandbox, launched first so it is
  // fully running (and has forked a descendant via `setsid`) before our cancel fires.
  const other = launchSession('setsid', adversaryCommand('setsid'));
  const otherStarted = other.pid !== undefined && (await waitFor(() => sizeOf(other.sentinel) > 0, 15_000, 100));

  // OUR session under test.
  const ours = launchSession(kind, adversaryCommand(kind));
  const started = ours.pid !== undefined && (await waitFor(() => sizeOf(ours.sentinel) > 0, 15_000, 100));
  const startedBytes = sizeOf(ours.sentinel);
  await sleep(1500);
  const beforeCancel = sizeOf(ours.sentinel);
  const otherBeforeCancel = sizeOf(other.sentinel);

  // CANCEL via candidate (c): enumerate OUR session's pids by marker and reap, re-enumerating until
  // empty. The second session's marker is NEVER passed, so a correct oracle never returns its pids.
  const first = sbenum(ours.marker);
  const blocked = first.spiPresent === false || first.feasible === false;
  const rounds: Array<{
    matched: number[];
    signalled: number[];
    overmatch: number[];
    stopped: number;
    killed: number;
    crossHits: number[];
  }> = [];
  const killedAll = new Set<number>();
  const otherPidsAtCancel = new Set(strays(other.mark).map((s) => s.pid));
  const overmatchAll = new Set<number>();

  // SAFETY GUARD (fail-closed): the oracle's answer is MEASURED, but only pids that are ALSO
  // independently verified as ours — their command line carries this run's unique mark — are ever
  // signalled. Any oracle match outside that ground truth (unsandboxed or foreign pids) is recorded as
  // an `oracle-overmatch` typed failure and is NEVER signalled, so a wrong predicate can only fail the
  // receipt, never stop or kill unrelated host processes.
  if (!blocked) {
    for (let r = 0; r < 6; r++) {
      const report = r === 0 ? first : sbenum(ours.marker);
      const matched = (report.match ?? []).filter((pid) => pid !== process.pid);
      const oursTruth = new Set(strays(ours.mark).map((s) => s.pid));
      const crossHits = matched.filter((pid) => otherPidsAtCancel.has(pid));
      const overmatch = matched.filter((pid) => !oursTruth.has(pid));
      for (const pid of overmatch) {
        overmatchAll.add(pid);
      }
      const signalled = matched.filter((pid) => oursTruth.has(pid));
      let stopped = 0;
      let killed = 0;
      for (const pid of signalled) {
        if (signal(pid, 'SIGSTOP')) {
          stopped++;
        }
      }
      for (const pid of signalled) {
        if (signal(pid, 'SIGKILL')) {
          killed++;
          killedAll.add(pid);
        }
      }
      rounds.push({
        matched: matched.slice(0, 50),
        signalled,
        overmatch: overmatch.slice(0, 50),
        stopped,
        killed,
        crossHits,
      });
      if (signalled.length === 0) {
        break;
      }
      await sleep(250);
    }
  }
  const oracleOvermatch = overmatchAll.size > 0;

  await sleep(1500);
  const afterCancel = sizeOf(ours.sentinel);
  await sleep(3000);
  const afterSettle = sizeOf(ours.sentinel);
  const otherAfterSettle = sizeOf(other.sentinel);

  // Second-session judgement — measured BEFORE any safety-net cleanup touches it.
  const crossKilled = rounds.some((r) => r.crossHits.length > 0);
  const otherGrew = otherStarted && otherBeforeCancel > 0 && otherAfterSettle > otherBeforeCancel;
  const otherSbRaw = sbenum(other.marker); // second session still enumerable under its OWN marker
  const otherSbAfter = {
    ...otherSbRaw,
    matchCount: (otherSbRaw.match ?? []).length,
    match: (otherSbRaw.match ?? []).slice(0, 20),
  };
  const otherStraysAfter = strays(other.mark);
  const secondSurvived = otherGrew && !crossKilled && otherStraysAfter.length > 0;

  // Cleanup (safety net, AFTER measuring): kill every straggler of BOTH sessions so nothing leaks.
  ours.stderr = readStderr(ours);
  other.stderr = readStderr(other);
  const leftover = strays(ours.mark);
  run('pkill', ['-9', '-f', ours.mark]);
  run('pkill', ['-9', '-f', other.mark]);
  for (const session of [ours, other]) {
    if (session.pid !== undefined) {
      signal(-session.pid, 'SIGKILL');
    }
  }
  rmSync(ours.dir, { recursive: true, force: true });
  rmSync(other.dir, { recursive: true, force: true });

  const grewLive = startedBytes > 0 && beforeCancel >= startedBytes;
  const stopped = afterSettle === afterCancel;
  // Reaped only if the canary stopped AND the oracle returned nothing outside our verified session.
  const reaped = grewLive && stopped && !blocked && !oracleOvermatch;
  // A genuine host limitation (sandbox_check SPI absent) legitimately blocks; a launch that produced
  // no canary while the SPI IS present is a sandbox/profile failure, surfaced here with the exit and
  // stderr of the sandboxed launch rather than hidden behind "blocked".
  const spiAbsent = first.spiPresent === false;
  const launchDetail = {
    ours: { exit: ours.exit, stderr: ours.stderr, spawnError: ours.spawnError ?? null },
    other: { started: otherStarted, exit: other.exit, stderr: other.stderr, spawnError: other.spawnError ?? null },
  };

  const checks: Check[] = [
    check(
      `${strategy}.${kind}.launched`,
      'the sandboxed launcher actually ran the adversary inside the host (external sentinel grew)',
      `started=${started} startedBytes=${startedBytes} oursExit=${JSON.stringify(ours.exit)} oursStderr=${ours.stderr.slice(-200)} spawnError=${ours.spawnError ?? 'none'}`,
      startedBytes > 0 || spiAbsent,
      launchDetail,
    ),
    check(
      `${strategy}.${kind}.reaped`,
      'no descendant keeps writing after cancel (external canary stops growing)',
      `startedBytes=${startedBytes} beforeCancel=${beforeCancel} afterCancel=${afterCancel} afterSettle=${afterSettle} blocked=${blocked} oracleOvermatch=${overmatchAll.size}`,
      reaped,
      { leftover, firstMatchCount: (first.match ?? []).length, rounds },
    ),
    check(
      `${strategy}.${kind}.second-session-survived`,
      'a concurrent session with a different marker is NOT cross-killed and keeps writing after cancel',
      `otherStarted=${otherStarted} otherBeforeCancel=${otherBeforeCancel} otherAfterSettle=${otherAfterSettle} crossKilled=${crossKilled} otherStraysAfter=${otherStraysAfter.length}`,
      secondSurvived || blocked,
      { crossKilled, otherGrew, otherSbAfter, otherStraysAfter },
    ),
  ];

  return {
    strategy,
    adversary: kind,
    status: blocked ? 'blocked' : started ? 'ran' : 'launch-failed',
    canary: { startedBytes, beforeCancel, afterCancel, afterSettle },
    verdict: checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
    reaped,
    blocked,
    blocker: blocked ? (first.blocker ?? 'sandbox membership infeasible') : undefined,
    secondSession: {
      marker: other.marker,
      started: otherStarted,
      beforeCancel: otherBeforeCancel,
      afterSettle: otherAfterSettle,
      survived: secondSurvived,
      crossKilled,
      straysAfter: otherStraysAfter,
      sbAfter: otherSbAfter,
    },
    oracleOvermatch: { count: overmatchAll.size, sample: [...overmatchAll].slice(0, 20) },
    cancelDetail: {
      strategy,
      blocked,
      firstEnum: { ...first, match: (first.match ?? []).slice(0, 50) },
      rounds,
      killed: [...killedAll],
    },
    launchDetail,
    leftover,
    checks,
  };
};

// ── identity ─────────────────────────────────────────────────────────────────────────────────
const sourceSha = (): string => process.env['GITHUB_SHA'] ?? run('git', ['-C', here, 'rev-parse', 'HEAD']).out.trim();

const identity = () => ({
  row,
  source: {
    sha: sourceSha(),
    ref: process.env['GITHUB_REF'] ?? 'local',
    run: process.env['GITHUB_RUN_ID']
      ? `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}/attempts/${process.env['GITHUB_RUN_ATTEMPT']}`
      : 'local',
  },
  os: {
    platform: platform(),
    arch: arch(),
    build: platform() === 'darwin' ? run('sw_vers', []).out.replaceAll(/\s+/g, ' ').trim() : release(),
    runnerImage: process.env['ImageOS'] ?? 'unknown',
    imageVersion: process.env['ImageVersion'] ?? 'unknown',
  },
  node: { version: process.version, abi: process.versions.modules },
  helpers: {
    sbenum: existsSync(sbenumBin) ? sbenumBin : 'absent',
    profile: existsSync(profile) ? profile : 'absent',
    sandboxExec: run('which', ['sandbox-exec']).out.trim() || 'absent',
    clang: run('clang', ['--version']).out.split('\n')[0] ?? 'absent',
  },
  elevated: process.getuid?.() === 0,
});

// ── preflight: the shim resolves the SPI, and the profile actually applies and is observable ───────
const preflight = async (): Promise<{ checks: Check[]; detail: Record<string, string> }> => {
  const selftest = existsSync(sbenumBin) ? run(sbenumBin, ['--selftest']) : { out: 'tau-sbenum not built', code: null };

  // Positive control: launch a short-lived sandboxed sleeper under a fresh marker, then tau-sbenum
  // must (a) place it in-session (marker allowed + control denied) and (b) observe a sandboxed pid.
  let applied = { out: 'skipped', code: null as number | null };
  let found = false;
  let observed = 0;
  if (existsSync(sbenumBin) && existsSync(profile)) {
    const uuid = randomUUID();
    const dir = join(workRoot, `pre-${uuid}`);
    mkdirSync(dir, { recursive: true });
    const marker = join(dir, `tau-session-${uuid}.marker`);
    writeFileSync(marker, '');
    // Run bash under the profile (not bare /bin/sleep), so the control exercises the SAME image as the
    // real workload — if bash cannot start under session.sb, the positive control catches it here.
    const sleeper = spawn(
      '/usr/bin/sandbox-exec',
      [
        '-f',
        profile,
        '-D',
        `MARKER=${marker}`,
        '-D',
        `WORKDIR=${dir}`,
        '-D',
        `SCRIPTDIR=${here}`,
        '/bin/bash',
        '-c',
        'exec sleep 8',
      ],
      { cwd: dir, detached: true, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env } },
    );
    let err = '';
    let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    sleeper.stderr?.setEncoding('utf8').on('data', (c: string) => (err += c));
    sleeper.on('exit', (code, sig) => (exit = { code, signal: sig }));
    sleeper.unref();
    await sleep(1500);
    const report = sbenum(marker);
    // In-session means EXACTLY the sandboxed sleeper: its pid must be matched, and the match set must
    // stay tiny — a large set means the predicate is admitting unsandboxed/foreign pids (overmatch).
    const preMatch = report.match ?? [];
    found = sleeper.pid !== undefined && preMatch.includes(sleeper.pid) && preMatch.length <= 3;
    report.match = preMatch.slice(0, 20);
    (report as Record<string, unknown>)['matchCount'] = preMatch.length;
    observed = report.sandboxedObserved ?? 0;
    applied = {
      out: `spawnRc=${sleeper.pid !== undefined} exit=${JSON.stringify(exit ?? null)} err=${err.slice(0, 200)} report=${JSON.stringify(report).slice(0, 260)}`,
      code: 0,
    };
    if (sleeper.pid !== undefined) {
      signal(-sleeper.pid, 'SIGKILL');
    }
    rmSync(dir, { recursive: true, force: true });
  }

  const checks: Check[] = [
    check(
      'preflight.sbenum-spi',
      'tau-sbenum resolves the sandbox_check SPI and can list pids',
      `${selftest.out.replaceAll('\n', ' ').slice(0, 220)}`,
      existsSync(sbenumBin) ? selftest.out.includes('"spiPresent":true') : false,
    ),
    check(
      'preflight.profile-applies',
      'a sandboxed sleeper launched under session.sb is placed in-session by tau-sbenum (marker allowed, control denied) and a sandboxed pid is observed',
      `${applied.out}`,
      found && observed > 0,
    ),
  ];
  return {
    checks,
    detail: { selftest: selftest.out.slice(0, 300), applied: applied.out.slice(0, 500) },
  };
};

// ── drive the matrix ───────────────────────────────────────────────────────────────────────────
const adversaries: Adversary[] = ['setsid', 'daemonize', 'double-fork', 'sigterm-ignore'];

// Driver watchdog: if anything still stalls, every adversary without a receipt gets a typed
// `driver-timeout` FAILURE receipt and the driver exits — a hang becomes a failed receipt, never a
// job timeout. 7 minutes sits inside the workflow's 10-minute step bound.
const receipted = new Set<string>();
const watchdog = setTimeout(() => {
  for (const adversary of adversaries) {
    if (receipted.has(adversary)) {
      continue;
    }
    writeJson(join(evidenceDirectory, row, `sbmember.${adversary}.json`), {
      spike: 'W2-reaping',
      strategy: 'sbmember',
      adversary,
      identity: identity(),
      status: 'driver-timeout',
      verdict: 'fail',
      reaped: false,
      blocked: false,
      checks: [
        check(
          `sbmember.${adversary}.driver-timeout`,
          'the candidate (c) driver completes this adversary within its 7-minute bound',
          'driver watchdog fired before this adversary produced a receipt',
          false,
        ),
      ],
    });
  }
  process.stdout.write(`[${row}] sbmember: driver watchdog fired; wrote driver-timeout receipts\n`);
  process.exit(0);
}, 7 * 60_000);
watchdog.unref();

const pre = await preflight();
writeJson(join(evidenceDirectory, row, 'preflight-sandbox.json'), {
  spike: 'W2-reaping-sandbox-preflight',
  identity: identity(),
  checks: pre.checks,
  detail: pre.detail,
  verdict: pre.checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
});

const summary: Record<string, unknown>[] = [];
for (const adversary of adversaries) {
  let result: Record<string, unknown>;
  try {
    result = await runCombo(adversary);
  } catch (error) {
    result = {
      strategy: 'sbmember',
      adversary,
      status: 'error',
      verdict: 'fail',
      error: error instanceof Error ? error.message : String(error),
      checks: [],
    };
  }
  receipted.add(adversary);
  writeJson(join(evidenceDirectory, row, `sbmember.${adversary}.json`), {
    spike: `W2-reaping`,
    strategy: 'sbmember',
    adversary,
    identity: identity(),
    ...result,
  });
  summary.push({
    strategy: 'sbmember',
    adversary,
    verdict: result['verdict'],
    status: result['status'],
    canary: result['canary'],
  });
  process.stdout.write(`[${row}] sbmember × ${adversary}: ${result['verdict']} (${result['status']})\n`);
}

rmSync(workRoot, { recursive: true, force: true });
writeFileSync(
  join(evidenceDirectory, row, 'matrix-sandbox.json'),
  `${JSON.stringify({ row, summary }, undefined, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({ row, summary }, undefined, 2)}\n`);
// Exit explicitly: receipts are written; never let a straggler's inherited handle hold the step open.
process.exit(0);
