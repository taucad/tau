/**
 * macOS descendant-reaping spike — TWO further bounded candidates (W2; I7/D26).
 *
 * The prior reaping probe (probe.mts) established, on real macOS CI, that no non-elevated strategy
 * reaps all adversaries: `group` reaps only sigterm-ignore; a stop-the-world ppid `walk` reaps setsid
 * and sigterm-ignore but FAILS daemonize (a double-forked grandchild reparents to launchd BEFORE
 * cancel, so a ppid walk rooted at the launch can't see it); the audit-session `asid` sweep is
 * infeasible non-elevated (setaudit_addr EPERM, task_for_pid KERN_FAILURE under SIP). The daemonize
 * survivor is the open gap failing I7. This driver implements and empirically tests two more
 * candidates against ALL FOUR adversaries, each verified ONLY by the external sentinel canary — never
 * an error string — exactly like probe.mts.
 *
 * CANDIDATE (a) `resp` — responsibility tracking. The shell is launched through tau-spawn-disclaim,
 *   which sets the private `responsibility_spawnattrs_setdisclaim` spawn attribute (+SETEXEC, so the
 *   shell keeps its pid and is its OWN responsible process). Descendants inherit the shell's
 *   responsible pid, and — the thesis — reparenting to launchd does NOT change it. At cancel,
 *   tau-resp-enum lists every pid whose responsible pid == the shell and kills them. Unlike asid this
 *   reads responsibility without the target's task port, so it may be feasible non-elevated where
 *   task_for_pid is denied; the receipt measures that per run and fails CLOSED (documented blocker)
 *   if the SPI does not resolve or cross-process attribution is denied.
 *
 * CANDIDATE (b) `kqtrack` — continuous tracking during the run. tau-kqtrack registers a kqueue
 *   EVFILT_PROC filter with NOTE_FORK|NOTE_EXIT|NOTE_EXEC|NOTE_TRACK on the shell from launch; the
 *   kernel follows forks and posts NOTE_CHILD carrying each new pid, backed by periodic ppid
 *   re-enumeration. The aim is to learn a double-forked grandchild BEFORE it reparents. The tracker
 *   runs for the whole window and, on cancel, SIGKILLs every learned pid and reports the measured
 *   race window (learn→reparent deltas, NOTE_TRACKERR escapes, backfill-only recoveries).
 *
 * This is a standalone driver. It does NOT touch probe.mts or supervisor.mts; it writes receipts of
 * the SAME shape into the SAME evidence directory (resp.<adv>.json / kqtrack.<adv>.json), so
 * summarize.mts renders all strategies in one table.
 *
 * Dev-only evidence. Never shipped; never run elevated (no sudo); synthetic canary only.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { arch, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Check } from '../lib.mts';
import { check, sleep, waitFor, writeJson } from '../lib.mts';

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'reaping-spike');
const row = process.env['TAU_SPIKE_ROW'] ?? `${platform()}-${arch()}`;
const workDir = join(process.env['RUNNER_TEMP'] ?? '/tmp', `tau-reaping-cand-${process.pid}`);
mkdirSync(workDir, { recursive: true });

const advScript = join(here, 'adversaries.sh');
const binDir = process.env['TAU_REAP_BIN'] ?? join(here, 'bin');
const disclaimBin = join(binDir, 'tau-spawn-disclaim');
const respEnumBin = join(binDir, 'tau-resp-enum');
const kqtrackBin = join(binDir, 'tau-kqtrack');

type Strategy = 'resp' | 'kqtrack';
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

// ── candidate (a): responsibility enumeration + kill ───────────────────────────────────────────
const cancelResp = (
  shellPid: number,
  disclaim: { spiPresent?: boolean; disclaimRc?: number } | undefined,
  mark: string,
): Record<string, unknown> => {
  if (!existsSync(disclaimBin) || !existsSync(respEnumBin)) {
    return { strategy: 'resp', blocked: true, blocker: 'native helpers not built on this host' };
  }
  if (!disclaim) {
    return { strategy: 'resp', blocked: true, blocker: 'tau-spawn-disclaim produced no report (did not exec?)' };
  }
  if (disclaim.spiPresent === false) {
    return {
      strategy: 'resp',
      blocked: true,
      blocker:
        'responsibility_spawnattrs_setdisclaim SPI did not resolve on this host; shell is not its own responsible process',
      disclaim,
    };
  }
  const enum_ = run(respEnumBin, [String(shellPid)]);
  let report: {
    feasible?: boolean;
    blocker?: string;
    match?: number[];
    readable?: number;
    denied?: number;
    firstDeniedErrno?: number;
    self?: { pid: number; responsible: number };
  } = {};
  try {
    report = JSON.parse(enum_.out.trim().split('\n').pop() ?? '{}');
  } catch {
    return { strategy: 'resp', blocked: true, blocker: `enumerator output unparseable: ${enum_.out.slice(0, 300)}` };
  }
  if (!report.feasible) {
    return {
      strategy: 'resp',
      blocked: true,
      blocker: report.blocker ?? 'responsibility enumeration infeasible',
      report,
      disclaim,
    };
  }
  let killed = 0;
  for (const pid of report.match ?? []) {
    if (pid !== process.pid && signal(pid, 'SIGKILL')) {
      killed++;
    }
  }
  return {
    strategy: 'resp',
    blocked: false,
    enumerated: report.match ?? [],
    killed,
    report,
    disclaim,
    straysAtCancel: strays(mark),
  };
};

// ── one strategy × adversary run ────────────────────────────────────────────────────────────────
const runCombo = async (strategy: Strategy, kind: Adversary): Promise<Record<string, unknown>> => {
  const mark = `tau-reap-${strategy}-${kind}-${randomBytes(4).toString('hex')}`;
  const sentinel = join(workDir, `${mark}.log`);
  rmSync(sentinel, { force: true });

  const helperMissing =
    strategy === 'resp' ? !existsSync(disclaimBin) || !existsSync(respEnumBin) : !existsSync(kqtrackBin);

  // Launch vector. resp re-execs the shell through the disclaim wrapper (pid preserved); kqtrack
  // launches plain Bash and starts the tracker alongside it.
  const launch =
    strategy === 'resp'
      ? { bin: disclaimBin, args: ['/bin/bash', advScript, kind, sentinel] }
      : { bin: '/bin/bash', args: [advScript, kind, sentinel] };

  let stderr = '';
  let stdout = '';
  let shellPid: number | undefined;
  let spawnError: string | undefined;

  // Candidate (b) tracker handle.
  let tracker: ReturnType<typeof spawn> | undefined;
  let trackerOut = '';
  let trackerErr = '';

  if (!helperMissing) {
    const child = spawn(launch.bin, launch.args, {
      cwd: workDir,
      detached: true, // new session + process group
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    shellPid = child.pid;
    child.on('error', (e) => (spawnError = e.message));
    child.stdout?.setEncoding('utf8').on('data', (c: string) => (stdout += c));
    child.stderr?.setEncoding('utf8').on('data', (c: string) => (stderr += c));
    child.unref();

    // Candidate (b): start the continuous tracker IMMEDIATELY, before the sleeps, so it registers on
    // the shell as early as possible. Any fork that beats registration is recovered by the tracker's
    // own backfill walk and reported as a startup miss (measured, not hidden).
    if (strategy === 'kqtrack' && shellPid !== undefined) {
      tracker = spawn(kqtrackBin, [String(shellPid)], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } });
      tracker.stdout?.setEncoding('utf8').on('data', (c: string) => (trackerOut += c));
      tracker.stderr?.setEncoding('utf8').on('data', (c: string) => (trackerErr += c));
    }
  }

  // Preflight: the launcher must actually have run the adversary on this host (sentinel grows).
  const started = shellPid !== undefined && (await waitFor(() => sizeOf(sentinel) > 0, 15_000, 100));
  const startedBytes = sizeOf(sentinel);
  await sleep(1500);
  const beforeCancel = sizeOf(sentinel);

  // resp report from the disclaim wrapper's stderr.
  let disclaim: { spiPresent?: boolean; disclaimRc?: number } | undefined;
  if (strategy === 'resp') {
    const line = stderr
      .split('\n')
      .find((l) => l.includes('"helper":"tau-spawn-disclaim"') && l.includes('"spiPresent"'));
    if (line) {
      try {
        disclaim = JSON.parse(line) as { spiPresent?: boolean; disclaimRc?: number };
      } catch {
        /* reported in detail below */
      }
    }
  }

  // CANCEL via the candidate under test.
  let cancelDetail: Record<string, unknown>;
  if (shellPid === undefined) {
    cancelDetail = { blocked: true, blocker: 'launcher not started (native helper missing)' };
  } else if (strategy === 'resp') {
    cancelDetail = cancelResp(shellPid, disclaim, mark);
  } else if (tracker) {
    // Tell the tracker to reap now, then collect its report.
    const straysBefore = strays(mark);
    try {
      tracker.stdin?.write('REAP\n');
      tracker.stdin?.end();
    } catch {
      signal(tracker.pid ?? -1, 'SIGTERM');
    }
    const trackerExited = await waitFor(
      () => trackerOut.includes('"helper":"tau-kqtrack"') && trackerOut.includes(']}'),
      8000,
      100,
    );
    let trackerReport: Record<string, unknown> = {};
    try {
      trackerReport = JSON.parse(trackerOut.trim().split('\n').pop() ?? '{}');
    } catch {
      trackerReport = { parseError: trackerOut.slice(-300) };
    }
    const blocked = trackerReport['feasible'] === false;
    cancelDetail = {
      strategy: 'kqtrack',
      blocked,
      blocker: blocked ? ((trackerReport['blocker'] as string | undefined) ?? 'kqueue tracking infeasible') : undefined,
      trackerExited,
      trackerReport,
      trackerErrTail: trackerErr.slice(-400),
      straysAtCancel: straysBefore,
    };
  } else {
    cancelDetail = { blocked: true, blocker: 'tracker not started (tau-kqtrack missing)' };
  }

  await sleep(1500);
  const afterCancel = sizeOf(sentinel);
  await sleep(3000);
  const afterSettle = sizeOf(sentinel);

  // Cleanup (safety net, AFTER measuring): kill any straggler so nothing leaks on the runner.
  const leftover = strays(mark);
  run('pkill', ['-9', '-f', mark]);
  if (shellPid !== undefined) {
    signal(-shellPid, 'SIGKILL');
  }
  if (tracker) {
    signal(tracker.pid ?? -1, 'SIGKILL');
  }

  const blocked = cancelDetail['blocked'] === true;
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
    blocker: blocked ? (cancelDetail['blocker'] as string | undefined) : undefined,
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
    spawnDisclaim: existsSync(disclaimBin) ? disclaimBin : 'absent',
    respEnum: existsSync(respEnumBin) ? respEnumBin : 'absent',
    kqtrack: existsSync(kqtrackBin) ? kqtrackBin : 'absent',
    clang: run('clang', ['--version']).out.split('\n')[0] ?? 'absent',
  },
  elevated: process.getuid?.() === 0,
});

// ── preflight: the shims run and report; does disclaim make the shell its own responsible process? ─
const preflight = (): { checks: Check[]; detail: Record<string, string> } => {
  // Run tau-resp-enum --self both plainly and under the disclaim wrapper. Under the wrapper,
  // isOwnResponsible should flip to true if the disclaim attribute took effect.
  const plainSelf = existsSync(respEnumBin)
    ? run(respEnumBin, ['--self'])
    : { out: 'tau-resp-enum not built', code: null };
  const disclaimedSelf =
    existsSync(disclaimBin) && existsSync(respEnumBin)
      ? run(disclaimBin, [respEnumBin, '--self'])
      : { out: 'helpers not built', code: null };
  const kqSelf = existsSync(kqtrackBin)
    ? run(kqtrackBin, ['--selftest'])
    : { out: 'tau-kqtrack not built', code: null };
  const checks: Check[] = [
    check(
      'preflight.resp-enum-runs',
      'tau-resp-enum reports its own responsible pid and whether the responsibility SPI resolved',
      `${plainSelf.out.replaceAll('\n', ' ').slice(0, 300)}`,
      existsSync(respEnumBin) ? plainSelf.out.includes('"helper":"tau-resp-enum"') : false,
    ),
    check(
      'preflight.disclaim-execs',
      'tau-spawn-disclaim sets the responsibility-disclaim attribute and re-execs the target in place',
      `${disclaimedSelf.out.replaceAll('\n', ' ').slice(0, 300)}`,
      existsSync(disclaimBin) ? disclaimedSelf.out.includes('"helper":"tau-resp-enum"') : false,
    ),
    check(
      'preflight.kqtrack-feasible',
      'tau-kqtrack can create a kqueue EVFILT_PROC tracker on this host',
      `${kqSelf.out.replaceAll('\n', ' ').slice(0, 200)}`,
      existsSync(kqtrackBin) ? kqSelf.out.includes('"feasible":true') : false,
    ),
  ];
  return {
    checks,
    detail: {
      plainSelf: plainSelf.out.slice(0, 400),
      disclaimedSelf: disclaimedSelf.out.slice(0, 400),
      kqSelf: kqSelf.out.slice(0, 300),
    },
  };
};

// ── drive the matrix ───────────────────────────────────────────────────────────────────────────
const strategies: Strategy[] = ['resp', 'kqtrack'];
const adversaries: Adversary[] = ['setsid', 'daemonize', 'double-fork', 'sigterm-ignore'];

const pre = preflight();
writeJson(join(evidenceDirectory, row, 'preflight-candidates.json'), {
  spike: 'W2-reaping-candidates-preflight',
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
writeFileSync(
  join(evidenceDirectory, row, 'matrix-candidates.json'),
  `${JSON.stringify({ row, summary }, undefined, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({ row, summary }, undefined, 2)}\n`);
