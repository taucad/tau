#!/usr/bin/env node
// Codex lane supervisor — dispatch, wait on, and report Codex companion jobs so a
// lane behaves like a Claude subagent: one call per lane, one wake per lane, and
// the wake's output file IS the lane's report.
//
//   lane <name> <cwd> "<brief>" [flags]   dispatch one lane, supervise, print its report
//   lane --attach <job-id> [--cwd DIR]    supervise an existing job (skip dispatch)
//   redispatch <job-id> [--cwd DIR]       re-dispatch a dead lane's stored prompt, then supervise
//   wait <lanes-file> [flags]             wave recovery: supervise several known jobs
//   collect <lanes-file>                  re-print reports for known jobs
//
// lanes-file: "<lane-name> <job-id> [cwd]" per line; blank lines and # comments ignored.
//
// Dispatch flags: --review [--scope auto|working-tree|branch] [--base REF] (brief = focus text),
//   --read-only (task without --write), --model M (default: inherit native configuration),
//   --effort E (default: inherit ~/.codex/config.toml), --ledger FILE (append "name id cwd"),
//   --section NAME|ID (Codex sidebar section for the lane's chat; defaults to
//   $CODEX_LANES_SECTION or DEFAULT_SECTION), --no-section to leave it with the project.
//
// Supervision model (parity with Claude subagents — no wall-clock deadline):
//   worker alive + log/state advancing        -> keep waiting, however long it takes
//   worker dead (failed/cancelled/zombie)     -> exit 1 immediately
//   worker alive, no output for --stall-min   -> exit 3, advisory (default 15; nothing is killed)
//   --deadline-min N                          -> OPT-IN time box, off by default; hitting it exits 3
//
// Exit codes: 0 completed · 1 dead · 2 usage · 3 alive (stalled or time-boxed)

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, readFileSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const SELF = fileURLToPath(import.meta.url);
const JOB_ID_RE = /(task|review)-[a-z0-9]+-[a-z0-9]+/;
// Codex sidebar section for lane threads, so they don't bury the project's own
// chats. Override per call with --section <name|id>, or --no-section to opt out.
const DEFAULT_SECTION = process.env.CODEX_LANES_SECTION ?? 'Claude';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveCompanion() {
  const pattern = path.join(os.homedir(), '.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs');
  const hits = globSync(pattern).sort();
  if (!hits.length) throw new Error(`codex-plugin-cc not found at ${pattern}`);
  return hits[hits.length - 1];
}

// Jobs must never be owned by a Claude session: an owned job is torn down —
// worker killed, record erased — by that session's SessionEnd hook.
function strippedEnv() {
  const env = { ...process.env };
  delete env.CODEX_COMPANION_SESSION_ID;
  return env;
}

async function companion(CC, args, cwd, maxBuffer = 64 * 1024 * 1024) {
  return run(process.execPath, [CC, ...args], { cwd, env: strippedEnv(), maxBuffer });
}

// A worker that died mid-turn leaves status "running" behind a dead pid forever.
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null; // unknown, not proof of death
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'EPERM') return true; // alive but not ours
    return err.code === 'ESRCH' ? false : null;
  }
}

export function assertRedispatchable(job) {
  // Companion 1.0.6 clears pid explicitly on settled failure/cancellation.
  // A missing pid on an active or unreadable record still proves nothing.
  if (job?.pid === null && ['failed', 'cancelled'].includes(job.status)) return;
  const unfinished = new Set(['failed', 'cancelled', 'running', 'queued', 'starting']);
  if (!job || !unfinished.has(job.status) || pidAlive(job.pid) !== false) {
    throw new Error(
      'Redispatch refused: require a known-dead unfinished job; completed, live or unknown-liveness jobs retain their owner.',
    );
  }
}

// Hash current bytes, including already-dirty and untracked files, without changing
// HEAD or either Git index. Symlinks are recorded, never followed into other repos.
export async function snapshot(cwd) {
  const { stdout } = await run('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
  });
  const files = {};
  for (const local of [...new Set(stdout.split('\0').filter(Boolean))].sort()) {
    const file = path.resolve(cwd, local);
    let stats;
    try {
      stats = lstatSync(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stats.isFile() && !stats.isSymbolicLink()) continue;
    const bytes = stats.isSymbolicLink() ? Buffer.from(readlinkSync(file)) : readFileSync(file);
    files[local] = {
      kind: stats.isSymbolicLink() ? 'symlink' : 'file',
      mode: stats.mode & 0o777,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  return { cwd: path.resolve(cwd), files };
}

export function changedPaths(before, after) {
  if (before.cwd !== after.cwd) throw new Error('Snapshots belong to different checkouts');
  return [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])]
    .sort()
    .filter((file) => JSON.stringify(before.files[file]) !== JSON.stringify(after.files[file]));
}

async function getJob(CC, jobId, cwd) {
  const { stdout } = await companion(CC, ['status', jobId, '--json'], cwd, 32 * 1024 * 1024);
  return JSON.parse(stdout).job ?? null;
}

// terminal state name, 'zombie', or the live status ('running', 'queued', ...)
export function classify(job) {
  if (TERMINAL.has(job.status) && (job.status === 'completed' || job.pid === null)) return job.status;
  const alive = pidAlive(job.pid);
  if (alive === false) return TERMINAL.has(job.status) ? job.status : 'zombie';
  if (TERMINAL.has(job.status)) return alive ? 'running' : 'unknown';
  return job.status ?? 'unknown';
}

// Newest evidence of forward progress: state-record heartbeat or log growth.
function progressStamp(job) {
  let stamp = Date.parse(job.updatedAt ?? '') || 0;
  try {
    if (job.logFile) stamp = Math.max(stamp, statSync(job.logFile).mtimeMs);
  } catch {
    // log not written yet
  }
  return stamp;
}

const fmtMin = (ms) => `${(ms / 60000).toFixed(1)}m`;

// Minimal JSON-RPC client over `codex app-server` stdio. The companion CLI has no
// section surface, and thread/section/move is only reachable on the app-server.
async function withAppServer(cwd, fn) {
  const proc = spawn('codex', ['app-server'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: strippedEnv() });
  const rl = readline.createInterface({ input: proc.stdout });
  const pending = new Map();
  let nextId = 1;
  proc.stderr.resume(); // drain, or the pipe fills and the child blocks
  rl.on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // app-server also emits non-JSON banter
    }
    const p = msg.id != null && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  });
  const req = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`app-server timeout: ${method}`));
      }, 20_000);
    });
  try {
    await req('initialize', {
      clientInfo: { title: 'Codex Lanes', name: 'Claude Code', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`);
    return await fn(req);
  } finally {
    proc.kill();
  }
}

// File a lane's thread under a Codex sidebar section. Never fatal: a lane that ran
// is worth more than its sidebar placement.
async function moveThreadToSection(threadId, section, cwd) {
  try {
    await withAppServer(cwd, async (req) => {
      let sectionId = UUID_RE.test(section) ? section : null;
      if (!sectionId) {
        // No section/list method exists; sections are only visible on threads that
        // already carry one, so the target section must have at least one member.
        const list = await req('thread/list', { limit: 100 });
        const wanted = section.toLowerCase();
        for (const t of list.threads ?? list.data ?? []) {
          if (t.section?.name?.toLowerCase() === wanted) {
            sectionId = t.section.id;
            break;
          }
        }
        if (!sectionId) throw new Error(`no section named "${section}" found on any recent thread`);
      }
      await req('thread/section/move', { threadId, sectionId });
      console.log(`filed thread ${threadId} under section "${section}"`);
    });
  } catch (err) {
    console.log(`note: could not file thread under section "${section}": ${err.message.split('\n')[0]}`);
  }
}

function parseLanes(file) {
  if (!existsSync(file)) throw new Error(`lanes file not found: ${file}`);
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const [name, jobId, cwd] = line.split(/\s+/);
      if (!name || !jobId) throw new Error(`malformed lane line: ${line}`);
      return { name, jobId, cwd: cwd || process.cwd() };
    });
}

function parseFlags(args) {
  const VALUE = new Set([
    '--attach',
    '--cwd',
    '--name',
    '--model',
    '--effort',
    '--scope',
    '--base',
    '--ledger',
    '--stall-min',
    '--deadline-min',
    '--interval-sec',
    '--section',
  ]);
  const BOOL = new Set(['--review', '--read-only', '--no-section']);
  const opts = {};
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE.has(a)) {
      opts[a.slice(2)] = args[++i];
      if (opts[a.slice(2)] === undefined) throw new Error(`${a} needs a value`);
    } else if (BOOL.has(a)) {
      opts[a.slice(2)] = true;
    } else if (a.startsWith('--')) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      positionals.push(a);
    }
  }
  return { opts, positionals };
}

function supervisionOpts(opts) {
  return {
    stallMin: Number(opts['stall-min'] ?? 15),
    deadlineMin: opts['deadline-min'] != null ? Number(opts['deadline-min']) : null,
    intervalSec: Number(opts['interval-sec'] ?? 10),
    section: opts['no-section'] ? null : (opts.section ?? DEFAULT_SECTION) || null,
  };
}

async function dispatch(CC, { name, cwd, brief, review, readOnly, model, effort, scope, base }) {
  const args = review
    ? ['adversarial-review', '--background', ...(scope ? ['--scope', scope] : []), ...(base ? ['--base', base] : [])]
    : ['task', '--background', ...(readOnly ? [] : ['--write'])];
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  args.push(brief);
  const { stdout } = await companion(CC, args, cwd);
  const jobId = stdout.match(JOB_ID_RE)?.[0];
  if (!jobId) throw new Error(`dispatch printed no job id. stdout:\n${stdout}`);
  console.log(`dispatched ${jobId} (${name}) in ${cwd}`);
  return jobId;
}

// The lane's report: task summary, or review verdict + findings. Returns the job.
async function printResult(CC, lane) {
  const { stdout } = await companion(CC, ['result', lane.jobId, '--json'], lane.cwd);
  const payload = JSON.parse(stdout);
  const job = payload.job ?? {};
  // A backgrounded review buries its schema-validated payload here, not at .result.
  const review = payload.result ?? payload.storedJob?.result?.result ?? null;
  console.log(`\n=== ${lane.name} report (${job.status ?? '?'}) ===`);
  if (review?.findings) {
    console.log(`verdict: ${review.verdict}  findings: ${review.findings.length}`);
    for (const f of review.findings) {
      console.log(`  [${f.severity}] ${f.file}:${f.line_start}-${f.line_end} conf=${f.confidence} :: ${f.title}`);
    }
  } else if (job.summary) {
    console.log(job.summary);
  } else {
    console.log('(no summary)');
  }
  return job;
}

// Best-effort: what effort did Codex actually run at? (config-inherited when
// dispatched without --effort, so the transcript is the only truth.)
function observedEffort(threadId) {
  try {
    if (!threadId) return 'unknown';
    const hits = globSync(path.join(os.homedir(), `.codex/sessions/*/*/*/rollout-*${threadId}*.jsonl`));
    if (!hits.length) return 'unknown';
    const head = readFileSync(hits[0], 'utf8').slice(0, 65536);
    return head.match(/"reasoning_effort"\s*:\s*"([a-z]+)"/)?.[1] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function printAliveExit(CC, lane, { reason, quietMs, job }) {
  console.log(
    `\n--- ${reason} — worker ${job.pid ?? 'unknown'} alive or liveness unconfirmed, phase ${job.phase ?? '?'}; nothing was killed`,
  );
  if (job.logFile) console.log(`--- Peek:    tail -40 '${job.logFile}'`);
  console.log(
    `--- Re-arm:  node '${SELF}' lane --attach ${lane.jobId} --cwd '${lane.cwd}' --name ${lane.name} --stall-min 30`,
  );
  console.log(`--- Abandon: env -u CODEX_COMPANION_SESSION_ID node '${CC}' cancel ${lane.jobId}`);
  console.log(`--- Do NOT re-dispatch: the worker is still running inside this lane's path budget.`);
}

function printDeadExit(CC, lane, state, job) {
  const detail = state === 'zombie' ? `worker pid ${job?.pid} is gone; record stuck at '${job?.status}'` : state;
  console.log(`\n--- DEAD: ${detail}`);
  if (job?.logFile) console.log(`--- Log:         tail -60 '${job.logFile}'`);
  console.log(`--- Re-dispatch: node '${SELF}' redispatch ${lane.jobId} --cwd '${lane.cwd}' --name ${lane.name}`);
}

// Supervise one job until terminal/dead, or until it goes quiet (advisory exit 3).
async function superviseLane(CC, lane, sup) {
  const started = Date.now();
  const deadline = sup.deadlineMin != null ? started + sup.deadlineMin * 60000 : Infinity;
  const el = () => fmtMin(Date.now() - started);
  let lastPhase;
  let strikes = 0;
  let ticks = 0;
  let filed = false;

  for (;;) {
    let job;
    try {
      job = await getJob(CC, lane.jobId, lane.cwd);
    } catch (err) {
      job = null;
      console.log(`[${el()}] ${lane.name} unreadable: ${err.message.split('\n')[0]}`);
    }
    if (!job) {
      // With no deadline, an unresolvable job must not spin forever.
      if (++strikes >= 6) {
        console.log(
          `\n--- UNKNOWN: job ${lane.jobId} unreadable ${strikes} times — inspect identity/cwd and liveness; do not redispatch`,
        );
        return 3;
      }
      await new Promise((r) => setTimeout(r, sup.intervalSec * 1000));
      continue;
    }
    strikes = 0;
    // The thread id only exists once Codex has started the thread; file it then, so
    // the chat lands in the right sidebar section while the lane is still running.
    if (!filed && sup.section && job.threadId) {
      filed = true;
      await moveThreadToSection(job.threadId, sup.section, lane.cwd);
    }
    const state = classify(job);

    if (state === 'completed') {
      const full = await printResult(CC, lane).catch(() => job);
      console.log(`observed reasoning_effort=${observedEffort(full.threadId)}`);
      console.log(`\n--- COMPLETED in ${el()} (${lane.name}, ${lane.jobId})`);
      return 0;
    }
    if (TERMINAL.has(state) || state === 'zombie') {
      await printResult(CC, lane).catch(() => {});
      printDeadExit(CC, lane, state, job);
      return 1;
    }

    if (job.phase !== lastPhase) {
      console.log(`[${el()}] ${lane.name} phase: ${lastPhase ?? 'start'} -> ${job.phase ?? '?'}`);
      lastPhase = job.phase;
    }
    const quietMs = Date.now() - Math.max(progressStamp(job), started);
    if (quietMs >= sup.stallMin * 60000) {
      printAliveExit(CC, lane, { reason: `STALLED: no output for ${fmtMin(quietMs)}`, quietMs, job });
      return 3;
    }
    if (Date.now() >= deadline) {
      printAliveExit(CC, lane, { reason: `TIME BOX: still running at ${sup.deadlineMin}m`, quietMs, job });
      return 3;
    }
    if (++ticks % 30 === 0) {
      console.log(`[${el()}] ${lane.name} ${state}, phase ${job.phase ?? '?'}, last output ${fmtMin(quietMs)} ago`);
    }
    await new Promise((r) => setTimeout(r, sup.intervalSec * 1000));
  }
}

async function cmdLane(rest) {
  const CC = resolveCompanion();
  const { opts, positionals } = parseFlags(rest);
  const sup = supervisionOpts(opts);
  let lane;
  if (opts.attach) {
    lane = { name: opts.name ?? opts.attach, jobId: opts.attach, cwd: path.resolve(opts.cwd ?? process.cwd()) };
    console.log(`attached to ${lane.jobId} (${lane.name}) in ${lane.cwd}`);
  } else {
    const [name, cwd, ...briefParts] = positionals;
    const brief = briefParts.join(' ');
    if (!name || !cwd || !brief) throw new UsageError('lane needs: <name> <cwd> "<brief>" (or --attach <job-id>)');
    const jobId = await dispatch(CC, {
      name,
      cwd: path.resolve(cwd),
      brief,
      review: opts.review,
      readOnly: opts['read-only'],
      model: opts.model,
      effort: opts.effort,
      scope: opts.scope,
      base: opts.base,
    });
    lane = { name, jobId, cwd: path.resolve(cwd) };
    if (opts.ledger) appendFileSync(opts.ledger, `${name} ${jobId} ${lane.cwd}\n`);
  }
  process.exit(await superviseLane(CC, lane, sup));
}

export async function cmdRedispatch(rest, CC = resolveCompanion()) {
  const { opts, positionals } = parseFlags(rest);
  const [oldId] = positionals;
  if (!oldId) throw new UsageError('redispatch needs a job id');
  if (oldId.startsWith('review-')) throw new UsageError('redispatch supports task jobs; re-run reviews directly');
  const probeCwd = path.resolve(opts.cwd ?? process.cwd());
  const old = await getJob(CC, oldId, probeCwd);
  assertRedispatchable(old);
  const req = old?.request;
  if (!req?.prompt) throw new Error(`job ${oldId} has no stored prompt (probed from ${probeCwd})`);
  const name = opts.name ?? `${oldId}-redo`;
  const cwd = path.resolve(opts.cwd ?? req.cwd ?? process.cwd());
  console.log(
    `redispatching ${oldId}: model=${opts.model ?? req.model ?? '(config)'} effort=${opts.effort ?? req.effort ?? '(config)'} write=${!!req.write}`,
  );
  const jobId = await dispatch(CC, {
    name,
    cwd,
    brief: req.prompt,
    readOnly: !req.write,
    model: opts.model ?? req.model,
    effort: opts.effort ?? req.effort,
  });
  if (opts.ledger) appendFileSync(opts.ledger, `${name} ${jobId} ${cwd}\n`);
  process.exit(await superviseLane(CC, { name, jobId, cwd }, supervisionOpts(opts)));
}

// Wave recovery: supervise several known jobs at once. Terminal/dead states latch;
// "stalled" is recomputed every tick so a lane that resumes progress un-stalls.
async function cmdWait(file, rest) {
  const CC = resolveCompanion();
  const { opts } = parseFlags(rest);
  const sup = supervisionOpts(opts);
  const lanes = parseLanes(file);
  const started = Date.now();
  const deadline = sup.deadlineMin != null ? started + sup.deadlineMin * 60000 : Infinity;
  const el = () => fmtMin(Date.now() - started);
  const seen = new Map(); // latched terminal/dead states
  const meta = new Map(lanes.map((l) => [l.name, { lastPhase: undefined, strikes: 0 }]));

  console.log(
    `waiting on ${lanes.length} lane(s); stall threshold ${sup.stallMin}m${sup.deadlineMin != null ? `, time box ${sup.deadlineMin}m` : ', no deadline'}`,
  );
  for (;;) {
    const alive = [];
    let pendingUnreadable = 0;
    for (const lane of lanes) {
      if (seen.has(lane.name)) continue;
      const m = meta.get(lane.name);
      let job;
      try {
        job = await getJob(CC, lane.jobId, lane.cwd);
      } catch {
        job = null;
      }
      if (!job) {
        if (++m.strikes >= 6) {
          seen.set(lane.name, 'unreadable');
          console.log(`[${el()}] ${lane.name} -> unreadable (giving up after ${m.strikes} attempts)`);
        } else {
          pendingUnreadable++;
        }
        continue;
      }
      m.strikes = 0;
      const state = classify(job);
      if (state === 'completed') {
        seen.set(lane.name, state);
        console.log(`[${el()}] ${lane.name} -> completed`);
        await printResult(CC, lane).catch(() => {});
      } else if (TERMINAL.has(state) || state === 'zombie') {
        seen.set(lane.name, state);
        const note = state === 'zombie' ? ` (worker pid ${job.pid} is gone; record stuck at running)` : '';
        console.log(`[${el()}] ${lane.name} -> ${state}${note}`);
        printDeadExit(CC, lane, state, job);
      } else {
        if (job.phase !== m.lastPhase) {
          console.log(`[${el()}] ${lane.name} phase: ${m.lastPhase ?? 'start'} -> ${job.phase ?? '?'}`);
          m.lastPhase = job.phase;
        }
        const quietMs = Date.now() - Math.max(progressStamp(job), started);
        alive.push({ lane, job, quietMs, stalled: quietMs >= sup.stallMin * 60000 });
      }
    }
    const blocking = alive.filter((a) => !a.stalled);
    if (!blocking.length && !pendingUnreadable && Date.now() < deadline) {
      if (!alive.length) break; // every lane latched terminal/dead
      // all remaining lanes are quiet: wake the orchestrator instead of sitting on them
      for (const a of alive) {
        seen.set(a.lane.name, 'stalled');
        printAliveExit(CC, a.lane, {
          reason: `STALLED: no output for ${fmtMin(a.quietMs)}`,
          quietMs: a.quietMs,
          job: a.job,
        });
      }
      break;
    }
    if (Date.now() >= deadline) {
      for (const a of alive) {
        seen.set(a.lane.name, a.stalled ? 'stalled' : 'time-boxed');
        printAliveExit(CC, a.lane, {
          reason: `TIME BOX: still running at ${sup.deadlineMin}m`,
          quietMs: a.quietMs,
          job: a.job,
        });
      }
      for (const lane of lanes) if (!seen.has(lane.name)) seen.set(lane.name, 'unreadable');
      break;
    }
    await new Promise((r) => setTimeout(r, sup.intervalSec * 1000));
  }

  console.log('\n--- summary ---');
  for (const lane of lanes) console.log(`${String(seen.get(lane.name) ?? '?').padEnd(11)} ${lane.name}`);
  const states = [...seen.values()];
  const dead = states.filter((s) => ['failed', 'cancelled', 'zombie'].includes(s)).length;
  const aliveQuiet = states.filter((s) => ['stalled', 'time-boxed', 'unreadable'].includes(s)).length;
  if (dead) console.log(`\n${dead} lane(s) dead — see Re-dispatch lines above`);
  else if (aliveQuiet)
    console.log(`\n${aliveQuiet} lane(s) quiet or liveness unknown — inspect and re-arm; do NOT re-dispatch`);
  else console.log('\nall lanes completed');
  process.exit(dead ? 1 : aliveQuiet ? 3 : 0);
}

async function cmdCollect(file) {
  const CC = resolveCompanion();
  for (const lane of parseLanes(file)) {
    try {
      const job = await printResult(CC, lane);
      if (job.status === 'completed') console.log(`observed reasoning_effort=${observedEffort(job.threadId)}`);
    } catch {
      // `result` refuses a job that never reached a terminal state; say why.
      let why = 'result unreadable';
      try {
        const job = await getJob(CC, lane.jobId, lane.cwd);
        const state = job ? classify(job) : 'unknown';
        why =
          state === 'zombie'
            ? `worker pid ${job.pid} is gone; no result was ever written`
            : TERMINAL.has(state)
              ? 'result unreadable'
              : `still ${state}; no result yet`;
      } catch {
        // keep default
      }
      console.log(`\n=== ${lane.name} === ${why}`);
    }
  }
}

class UsageError extends Error {}

const USAGE = [
  'usage: lanes.mjs lane <name> <cwd> "<brief>" [--review] [--read-only] [--model M] [--effort E] [--scope S] [--base R] [--ledger FILE]',
  `       lanes.mjs lane ... [--section NAME|ID] [--no-section]   (default section: ${DEFAULT_SECTION})`,
  '       lanes.mjs lane --attach <job-id> [--cwd DIR] [--name NAME]',
  '       lanes.mjs redispatch <job-id> [--cwd DIR] [--name NAME]',
  '       lanes.mjs wait <lanes-file>',
  '       lanes.mjs collect <lanes-file>',
  '       lanes.mjs snapshot <cwd> <output.json>    (refuses to overwrite evidence)',
  '       lanes.mjs changes <before.json> <after.json>',
  '       supervision flags: [--stall-min 15] [--deadline-min N] [--interval-sec 10]',
].join('\n');

const [, , cmd, ...rest] = process.argv;
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (cmd === 'lane') await cmdLane(rest);
    else if (cmd === 'redispatch') await cmdRedispatch(rest);
    else if (cmd === 'wait' && rest[0]) await cmdWait(rest[0], rest.slice(1));
    else if (cmd === 'collect' && rest[0]) await cmdCollect(rest[0]);
    else if (cmd === 'snapshot' && rest.length === 2)
      writeFileSync(rest[1], `${JSON.stringify(await snapshot(path.resolve(rest[0])), null, 2)}\n`, { flag: 'wx' });
    else if (cmd === 'changes' && rest.length === 2)
      console.log(
        JSON.stringify(
          changedPaths(JSON.parse(readFileSync(rest[0], 'utf8')), JSON.parse(readFileSync(rest[1], 'utf8'))),
          null,
          2,
        ),
      );
    else throw new UsageError(USAGE);
  } catch (err) {
    console.error(err instanceof UsageError ? err.message : `error: ${err.message}`);
    process.exit(2);
  }
}
