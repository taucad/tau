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
import { existsSync, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 20_000 });
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
};

/** Launch one sandboxed session: shell + adversary inside its own per-session Seatbelt profile. */
const launchSession = (kind: Adversary): Session => {
  const uuid = randomUUID();
  const mark = `tau-reap-sbmember-${kind}-${uuid.slice(0, 8)}`;
  const dir = join(workRoot, uuid);
  mkdirSync(dir, { recursive: true });
  const marker = join(dir, `tau-session-${uuid}.marker`);
  writeFileSync(marker, ''); // the literal the profile uniquely allows (empty; synthetic)
  const sentinel = join(dir, `${mark}.log`);
  rmSync(sentinel, { force: true });

  const child = spawn(
    'sandbox-exec',
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
      advScript,
      kind,
      sentinel,
    ],
    { cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } },
  );
  const session: Session = { mark, marker, sentinel, dir, pid: child.pid };
  child.on('error', (e) => (session.spawnError = e.message));
  child.stdout?.resume();
  child.stderr?.resume();
  child.unref();
  return session;
};

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
  const other = launchSession('setsid');
  const otherStarted = other.pid !== undefined && (await waitFor(() => sizeOf(other.sentinel) > 0, 15_000, 100));

  // OUR session under test.
  const ours = launchSession(kind);
  const started = ours.pid !== undefined && (await waitFor(() => sizeOf(ours.sentinel) > 0, 15_000, 100));
  const startedBytes = sizeOf(ours.sentinel);
  await sleep(1500);
  const beforeCancel = sizeOf(ours.sentinel);
  const otherBeforeCancel = sizeOf(other.sentinel);

  // CANCEL via candidate (c): enumerate OUR session's pids by marker and reap, re-enumerating until
  // empty. The second session's marker is NEVER passed, so a correct oracle never returns its pids.
  const first = sbenum(ours.marker);
  const blocked = first.spiPresent === false || first.feasible === false;
  const rounds: Array<{ matched: number[]; stopped: number; killed: number; crossHits: number[] }> = [];
  const killedAll = new Set<number>();
  const otherPidsAtCancel = new Set(strays(other.mark).map((s) => s.pid));

  if (!blocked) {
    for (let r = 0; r < 6; r++) {
      const report = r === 0 ? first : sbenum(ours.marker);
      const matched = (report.match ?? []).filter((pid) => pid !== process.pid);
      const crossHits = matched.filter((pid) => otherPidsAtCancel.has(pid));
      let stopped = 0;
      let killed = 0;
      for (const pid of matched) {
        if (signal(pid, 'SIGSTOP')) {
          stopped++;
        }
      }
      for (const pid of matched) {
        if (signal(pid, 'SIGKILL')) {
          killed++;
          killedAll.add(pid);
        }
      }
      rounds.push({ matched, stopped, killed, crossHits });
      if (matched.length === 0) {
        break;
      }
      await sleep(250);
    }
  }

  await sleep(1500);
  const afterCancel = sizeOf(ours.sentinel);
  await sleep(3000);
  const afterSettle = sizeOf(ours.sentinel);
  const otherAfterSettle = sizeOf(other.sentinel);

  // Second-session judgement — measured BEFORE any safety-net cleanup touches it.
  const crossKilled = rounds.some((r) => r.crossHits.length > 0);
  const otherGrew = otherStarted && otherBeforeCancel > 0 && otherAfterSettle > otherBeforeCancel;
  const otherSbAfter = sbenum(other.marker); // second session still enumerable under its OWN marker
  const otherStraysAfter = strays(other.mark);
  const secondSurvived = otherGrew && !crossKilled && otherStraysAfter.length > 0;

  // Cleanup (safety net, AFTER measuring): kill every straggler of BOTH sessions so nothing leaks.
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
  const reaped = grewLive && stopped && !blocked;

  const checks: Check[] = [
    check(
      `${strategy}.${kind}.launched`,
      'the sandboxed launcher actually ran the adversary inside the host (external sentinel grew)',
      `started=${started} startedBytes=${startedBytes} spawnError=${ours.spawnError ?? 'none'}`,
      startedBytes > 0 || blocked,
      ours.spawnError ? { spawnError: ours.spawnError } : undefined,
    ),
    check(
      `${strategy}.${kind}.reaped`,
      'no descendant keeps writing after cancel (external canary stops growing)',
      `startedBytes=${startedBytes} beforeCancel=${beforeCancel} afterCancel=${afterCancel} afterSettle=${afterSettle} blocked=${blocked}`,
      reaped,
      { leftover, firstEnum: first, rounds },
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
    cancelDetail: { strategy, blocked, firstEnum: first, rounds, killed: [...killedAll] },
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
    const sleeper = spawn(
      'sandbox-exec',
      ['-f', profile, '-D', `MARKER=${marker}`, '-D', `WORKDIR=${dir}`, '-D', `SCRIPTDIR=${here}`, '/bin/sleep', '8'],
      { cwd: dir, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env } },
    );
    let err = '';
    sleeper.stderr?.setEncoding('utf8').on('data', (c: string) => (err += c));
    sleeper.unref();
    await sleep(1200);
    const report = sbenum(marker);
    found = (report.match ?? []).length > 0;
    observed = report.sandboxedObserved ?? 0;
    applied = {
      out: `spawnRc=${sleeper.pid !== undefined} err=${err.slice(0, 160)} report=${JSON.stringify(report).slice(0, 220)}`,
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
