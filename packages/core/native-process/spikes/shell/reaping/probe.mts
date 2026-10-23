/**
 * macOS session-escaping descendant reaping probe (desktop Bash/Terminal blueprint, W2; I7/D26).
 *
 * The W1 supervisor cancels a timed-out command by signalling the POSIX process GROUP
 * (`kill(-pid, TERM/KILL)`). A descendant that calls setsid escapes the group and keeps running:
 * receipt `s1.descendant-reaped` FAILS on macOS. Windows reaps the whole tree via a Job object
 * (kill-on-close); macOS has no PID namespace and no Job object. This probe prototypes and COMPARES
 * candidate cancel strategies on a real macOS host, each proven against three adversaries, each
 * verified ONLY by an external sentinel canary (a file that must stop growing after cancel) — never
 * by a trusted error string.
 *
 * This is a standalone minimal launcher. It does NOT touch supervisor.mts. Reaping is orthogonal to
 * the sandbox boundary (the escaped descendant is already inside it), so the launcher spawns real
 * Bash directly; the strategies are what the product would do in the supervisor's `cancel()`.
 *
 * Strategies:
 *   group  — control: the W1 baseline, `kill(-pid, TERM)` then `kill(-pid, KILL)`. Expected to miss
 *            session escapers (reproduces the finding in this harness).
 *   walk   — (B) stop-the-world ppid tree walk: SIGSTOP the set, re-enumerate until stable (closes
 *            fork races), then SIGKILL all. Known gap: a descendant already reparented to launchd
 *            (ppid=1) before cancel is invisible to a ppid walk.
 *   asid   — (A) audit-session sweep: a fresh asid is set before exec (tau-setasid) and inherited by
 *            every descendant across reparenting; cancel enumerates and kills every pid carrying it
 *            (tau-asid-enum). Fails closed (documented blocker) if setting or enumerating the asid is
 *            not possible for a non-elevated process on this host.
 *
 * Dev-only evidence. Never shipped; never run elevated (no sudo); synthetic canary only.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { arch, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Check } from '../lib.mts';
import { check, sleep, waitFor, writeJson } from '../lib.mts';

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'reaping-spike');
const row = process.env['TAU_SPIKE_ROW'] ?? `${platform()}-${arch()}`;
const workDir = join(process.env['RUNNER_TEMP'] ?? '/tmp', `tau-reaping-${process.pid}`);
mkdirSync(workDir, { recursive: true });

const advScript = join(here, 'adversaries.sh');
const binDir = process.env['TAU_REAP_BIN'] ?? join(here, 'bin');
const setasidBin = join(binDir, 'tau-setasid');
const enumBin = join(binDir, 'tau-asid-enum');

type Strategy = 'group' | 'walk' | 'asid';
type Adversary = 'setsid' | 'daemonize' | 'sigterm-ignore';

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

// ── out-of-probe observers (ps) ─────────────────────────────────────────────────────────────────
/** Every (pid,ppid) pair on the host. macOS `ps`: -A lists all processes (-e means "environment"). */
const processTable = (): Array<{ pid: number; ppid: number }> =>
  run('ps', ['-A', '-o', 'pid=,ppid='])
    .out.split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((parts) => parts.length >= 2 && Number.isFinite(parts[0]) && parts[0]! > 0)
    .map((parts) => ({ pid: parts[0]!, ppid: parts[1]! }));

/** The ppid-tree closure rooted at `root` (inclusive). Catches session escapers whose parent lives. */
const descendantSet = (root: number): Set<number> => {
  const table = processTable();
  const childrenOf = new Map<number, number[]>();
  for (const { pid, ppid } of table) {
    (childrenOf.get(ppid) ?? childrenOf.set(ppid, []).get(ppid)!).push(pid);
  }
  const set = new Set<number>([root]);
  const queue = [root];
  while (queue.length > 0) {
    for (const child of childrenOf.get(queue.shift()!) ?? []) {
      if (!set.has(child)) {
        set.add(child);
        queue.push(child);
      }
    }
  }
  return set;
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

const signal = (pid: number, sig: NodeJS.Signals): boolean => {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
};

// ── strategies ───────────────────────────────────────────────────────────────────────────────
const cancelGroup = (launchedPid: number): unknown => {
  const term = signal(-launchedPid, 'SIGTERM');
  return { strategy: 'group', termGroup: term, killGroup: delayedKill(launchedPid) };
};
const delayedKill = (launchedPid: number): boolean => {
  // match the supervisor's 1s TERM→KILL escalation (synchronously enough for the receipt)
  const r = spawnSync('sh', ['-c', `sleep 1; kill -KILL -${launchedPid} 2>/dev/null; echo done`], {
    encoding: 'utf8',
    timeout: 5000,
  });
  return r.status === 0;
};

const cancelWalk = (launchedPid: number, mark: string): unknown => {
  const rounds: Array<{ size: number; stopped: number }> = [];
  let set = descendantSet(launchedPid);
  for (let i = 0; i < 6; i++) {
    let stopped = 0;
    for (const pid of set) {
      if (signal(pid, 'SIGSTOP')) {
        stopped++;
      }
    }
    rounds.push({ size: set.size, stopped });
    const next = descendantSet(launchedPid);
    const grew = [...next].some((pid) => !set.has(pid));
    set = new Set([...set, ...next]);
    if (!grew) {
      break;
    }
  }
  let killed = 0;
  for (const pid of set) {
    if (signal(pid, 'SIGKILL')) {
      killed++;
    }
  }
  return { strategy: 'walk', rounds, finalSet: [...set], killed, straysAtCancel: strays(mark) };
};

const cancelAsid = (asidInfo: { setOk: boolean; afterAsid: number } | undefined, mark: string): unknown => {
  if (!existsSync(setasidBin) || !existsSync(enumBin)) {
    return { strategy: 'asid', blocked: true, blocker: 'native helpers not built on this host' };
  }
  if (!asidInfo) {
    return { strategy: 'asid', blocked: true, blocker: 'tau-setasid produced no asid report (did not exec?)' };
  }
  if (!asidInfo.setOk) {
    return {
      strategy: 'asid',
      blocked: true,
      blocker:
        'setaudit_addr could not allocate a fresh asid without privilege (EPERM); refusing to sweep the shared ' +
        'login-session asid, which would signal unrelated processes',
      asidInfo,
    };
  }
  const enum_ = run(enumBin, [String(asidInfo.afterAsid)]);
  let report: { feasible?: boolean; blocker?: string; match?: number[]; readable?: number; listed?: number } = {};
  try {
    report = JSON.parse(enum_.out.trim().split('\n').pop() ?? '{}');
  } catch {
    return { strategy: 'asid', blocked: true, blocker: `enumerator output unparseable: ${enum_.out.slice(0, 300)}` };
  }
  if (!report.feasible) {
    return { strategy: 'asid', blocked: true, blocker: report.blocker ?? 'asid enumeration infeasible', report };
  }
  let killed = 0;
  for (const pid of report.match ?? []) {
    if (pid !== process.pid && signal(pid, 'SIGKILL')) {
      killed++;
    }
  }
  return {
    strategy: 'asid',
    blocked: false,
    enumerated: report.match ?? [],
    killed,
    report,
    straysAtCancel: strays(mark),
  };
};

// ── one strategy × adversary run ─────────────────────────────────────────────────────────────
const launchVector = (strategy: Strategy, kind: Adversary, sentinel: string): { bin: string; args: string[] } =>
  strategy === 'asid'
    ? { bin: setasidBin, args: ['/bin/bash', advScript, kind, sentinel] }
    : { bin: '/bin/bash', args: [advScript, kind, sentinel] };

const runCombo = async (strategy: Strategy, kind: Adversary): Promise<Record<string, unknown>> => {
  const mark = `tau-reap-${strategy}-${kind}-${randomBytes(4).toString('hex')}`;
  const sentinel = join(workDir, `${mark}.log`);
  rmSync(sentinel, { force: true });

  const { bin, args } = launchVector(strategy, kind, sentinel);
  const launchBlocked = strategy === 'asid' && !existsSync(setasidBin);
  let stderr = '';
  let stdout = '';
  let launchedPid: number | undefined;
  let spawnError: string | undefined;

  if (!launchBlocked) {
    const child = spawn(bin, args, {
      cwd: workDir,
      detached: true, // new session + process group: `child.pid` is the group leader for `kill(-pid)`
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    launchedPid = child.pid;
    child.on('error', (e) => (spawnError = e.message));
    child.stdout?.setEncoding('utf8').on('data', (c: string) => (stdout += c));
    child.stderr?.setEncoding('utf8').on('data', (c: string) => (stderr += c));
    child.unref();
  }

  // Preflight: the launcher must actually have run the adversary on this host (sentinel grows).
  const started = launchedPid !== undefined && (await waitFor(() => sizeOf(sentinel) > 0, 15_000, 100));
  const startedBytes = sizeOf(sentinel);
  await sleep(1500);
  const beforeCancel = sizeOf(sentinel);

  // asid report from the exec wrapper's stderr (strategy A only).
  let asidInfo: { setOk: boolean; afterAsid: number } | undefined;
  if (strategy === 'asid') {
    const line = stderr.split('\n').find((l) => l.includes('"helper":"tau-setasid"'));
    if (line) {
      try {
        const parsed = JSON.parse(line) as { setOk: boolean; afterAsid: number };
        asidInfo = { setOk: parsed.setOk, afterAsid: parsed.afterAsid };
      } catch {
        /* reported in detail below */
      }
    }
  }

  // CANCEL via the strategy under test.
  let cancelDetail: unknown;
  if (launchedPid === undefined) {
    cancelDetail = { blocked: true, blocker: 'launcher not started (native helper missing)' };
  } else if (strategy === 'group') {
    cancelDetail = cancelGroup(launchedPid);
  } else if (strategy === 'walk') {
    cancelDetail = cancelWalk(launchedPid, mark);
  } else {
    cancelDetail = cancelAsid(asidInfo, mark);
  }

  await sleep(1500);
  const afterCancel = sizeOf(sentinel);
  await sleep(3000);
  const afterSettle = sizeOf(sentinel);

  // Cleanup (safety net, AFTER measuring): kill any straggler so nothing leaks on the runner.
  const leftover = strays(mark);
  run('pkill', ['-9', '-f', mark]);
  if (launchedPid !== undefined) {
    signal(-launchedPid, 'SIGKILL');
  }

  const blocked = (cancelDetail as { blocked?: boolean }).blocked === true;
  const grewLive = startedBytes > 0 && beforeCancel >= startedBytes;
  const stopped = afterSettle === afterCancel;
  const reaped = grewLive && stopped && !blocked;

  const checks: Check[] = [
    check(
      `${strategy}.${kind}.launched`,
      'the launcher actually ran the adversary inside the host (external sentinel grew)',
      `started=${started} startedBytes=${startedBytes} stdout=${stdout.trim().slice(0, 40)}`,
      startedBytes > 0 || blocked,
      spawnError ? { spawnError } : undefined,
    ),
    check(
      `${strategy}.${kind}.reaped`,
      'no descendant keeps writing after cancel (external canary stops growing)',
      `startedBytes=${startedBytes} beforeCancel=${beforeCancel} afterCancel=${afterCancel} afterSettle=${afterSettle} blocked=${blocked}`,
      reaped,
      { leftover, cancelDetail },
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
    blocker: blocked ? (cancelDetail as { blocker?: string }).blocker : undefined,
    cancelDetail,
    leftover,
    stderrTail: stderr.slice(-2000),
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
    setasid: existsSync(setasidBin) ? setasidBin : 'absent',
    asidEnum: existsSync(enumBin) ? enumBin : 'absent',
    clang: run('clang', ['--version']).out.split('\n')[0] ?? 'absent',
  },
  elevated: process.getuid?.() === 0,
});

// ── preflight: both the plain launcher and the asid exec wrapper actually execute ──────────────
const preflight = (): Record<string, unknown> => {
  const plain = run('/bin/bash', [advScript, '--selftest-noop', 'noop']);
  const setasid = existsSync(setasidBin)
    ? run(setasidBin, ['/bin/echo', '__TAU_SETASID_OK__'])
    : { out: 'tau-setasid not built', code: null };
  const enumSelf = existsSync(enumBin) ? run(enumBin, ['-1']) : { out: 'tau-asid-enum not built', code: null };
  const checks: Check[] = [
    check(
      'preflight.setasid-execs',
      'tau-setasid sets/reports an asid and execs the target (prints the asid JSON + child output)',
      `${setasid.out.replaceAll('\n', ' ').slice(0, 200)}`,
      existsSync(setasidBin) ? setasid.out.includes('__TAU_SETASID_OK__') : false,
    ),
    check(
      'preflight.enum-runs',
      'tau-asid-enum runs and reports whether cross-process asid read is feasible',
      `${enumSelf.out.replaceAll('\n', ' ').slice(0, 300)}`,
      existsSync(enumBin) ? enumSelf.out.includes('"helper":"tau-asid-enum"') : false,
    ),
  ];
  return {
    checks,
    detail: {
      plain: plain.out.slice(0, 200),
      setasid: setasid.out.slice(0, 400),
      enumSelf: enumSelf.out.slice(0, 500),
    },
  };
};

// ── drive the matrix ───────────────────────────────────────────────────────────────────────────
const strategies: Strategy[] = ['group', 'walk', 'asid'];
const adversaries: Adversary[] = ['setsid', 'daemonize', 'sigterm-ignore'];

const pre = preflight();
writeJson(join(evidenceDirectory, row, 'preflight.json'), {
  spike: 'W2-reaping-preflight',
  identity: identity(),
  checks: pre.checks,
  detail: pre.detail,
  verdict: pre.checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
});

const summary: Record<string, unknown>[] = [];
for (const strategy of strategies) {
  for (const adversary of adversaries) {
    let result: Record<string, unknown>;
    try {
      result = await runCombo(strategy, adversary);
    } catch (error) {
      result = {
        strategy,
        adversary,
        status: 'error',
        verdict: 'fail',
        error: error instanceof Error ? error.message : String(error),
        checks: [],
      };
    }
    writeJson(join(evidenceDirectory, row, `${strategy}.${adversary}.json`), {
      spike: `W2-reaping`,
      strategy,
      adversary,
      identity: identity(),
      ...result,
    });
    summary.push({
      strategy,
      adversary,
      verdict: result['verdict'],
      status: result['status'],
      canary: result['canary'],
    });
    process.stdout.write(`[${row}] ${strategy} × ${adversary}: ${result['verdict']} (${result['status']})\n`);
  }
}

rmSync(workDir, { recursive: true, force: true });
writeFileSync(join(evidenceDirectory, row, 'matrix.json'), `${JSON.stringify({ row, summary }, undefined, 2)}\n`);
process.stdout.write(`${JSON.stringify({ row, summary }, undefined, 2)}\n`);
