#!/usr/bin/env node
// Wait on and collect Codex lanes. Encodes the polling, zombie detection and
// payload-path handling that are easy to get wrong when retyped inline.
//
//   node lanes.mjs wait    <lanes-file> [--deadline-min 45] [--interval-sec 10]
//   node lanes.mjs collect <lanes-file>
//
// lanes-file: one lane per line — "<lane-name> <job-id> [cwd]"
// Lines that are blank or start with # are ignored. cwd defaults to $PWD.
//
// Exit codes for `wait`: 0 every lane completed, 1 any lane failed, cancelled,
// zombied or still running at the deadline. It always exits.

import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { globSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function resolveCompanion() {
  const pattern = path.join(os.homedir(), '.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs');
  const hits = globSync(pattern).sort();
  if (!hits.length) throw new Error(`codex-plugin-cc not found at ${pattern}`);
  return hits[hits.length - 1];
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

// A worker that died mid-turn leaves status "running" behind a dead pid forever.
function pidAlive(pid) {
  if (!Number.isFinite(pid)) return null; // unknown, not proof of death
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // alive but not ours
  }
}

async function statusOf(CC, lane) {
  const env = { ...process.env };
  delete env.CODEX_COMPANION_SESSION_ID; // jobs must not be owned by this session
  try {
    const { stdout } = await run(process.execPath, [CC, 'status', lane.jobId, '--json'], {
      cwd: lane.cwd,
      env,
      maxBuffer: 32 * 1024 * 1024,
    });
    const job = JSON.parse(stdout).job;
    if (!job) return { state: 'unknown', pid: null };
    if (!TERMINAL.has(job.status) && pidAlive(job.pid) === false) {
      return { state: 'zombie', pid: job.pid, since: job.startedAt ?? job.createdAt };
    }
    return { state: job.status, pid: job.pid ?? null, since: job.startedAt ?? job.createdAt };
  } catch (err) {
    return { state: 'unreadable', pid: null, error: err.message.split('\n')[0] };
  }
}

async function cmdWait(file, opts) {
  const CC = resolveCompanion();
  const lanes = parseLanes(file);
  const deadline = Date.now() + opts.deadlineMin * 60_000;
  const started = Date.now();
  const seen = new Map();
  const el = () => `${Math.round((Date.now() - started) / 1000)}s`;

  console.log(`waiting on ${lanes.length} lane(s), deadline ${opts.deadlineMin}m`);
  for (;;) {
    let pending = 0;
    for (const lane of lanes) {
      if (seen.has(lane.name)) continue;
      const { state, pid, error } = await statusOf(CC, lane);
      if (TERMINAL.has(state) || state === 'zombie') {
        seen.set(lane.name, state);
        const note = state === 'zombie' ? ` (worker pid ${pid} is gone; record stuck at running)` : '';
        console.log(`[${el()}] ${lane.name} -> ${state}${note}`);
      } else {
        if (state === 'unreadable') console.log(`[${el()}] ${lane.name} -> unreadable: ${error}`);
        pending++;
      }
    }
    if (!pending) break;
    if (Date.now() >= deadline) {
      for (const lane of lanes)
        if (!seen.has(lane.name)) {
          seen.set(lane.name, 'timeout');
          console.log(`[${el()}] ${lane.name} -> still running at deadline`);
        }
      break;
    }
    await new Promise((r) => setTimeout(r, opts.intervalSec * 1000));
  }

  console.log('\n--- summary ---');
  for (const lane of lanes) console.log(`${String(seen.get(lane.name) ?? '?').padEnd(10)} ${lane.name}`);
  const bad = [...seen.values()].filter((s) => s !== 'completed');
  console.log(bad.length ? `\n${bad.length} lane(s) need attention` : '\nall lanes completed');
  process.exit(bad.length ? 1 : 0);
}

async function cmdCollect(file) {
  const CC = resolveCompanion();
  const lanes = parseLanes(file);
  const env = { ...process.env };
  delete env.CODEX_COMPANION_SESSION_ID;
  for (const lane of lanes) {
    let payload;
    try {
      const { stdout } = await run(process.execPath, [CC, 'result', lane.jobId, '--json'], {
        cwd: lane.cwd,
        env,
        maxBuffer: 64 * 1024 * 1024,
      });
      payload = JSON.parse(stdout);
    } catch {
      // `result` refuses a job that never reached a terminal state; say why.
      const { state, pid } = await statusOf(CC, lane);
      const why =
        state === 'zombie'
          ? `worker pid ${pid} is gone; no result was ever written`
          : TERMINAL.has(state)
            ? 'result unreadable'
            : `still ${state}; no result yet`;
      console.log(`\n=== ${lane.name} === ${why}`);
      continue;
    }
    const job = payload.job ?? {};
    // A backgrounded review buries its schema-validated payload here, not at .result.
    const review = payload.result ?? payload.storedJob?.result?.result ?? null;
    console.log(`\n=== ${lane.name} (${job.status ?? '?'}) ===`);
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
  }
}

const [, , cmd, file, ...rest] = process.argv;
const opts = {
  deadlineMin: Number(rest[rest.indexOf('--deadline-min') + 1]) || 45,
  intervalSec: Number(rest[rest.indexOf('--interval-sec') + 1]) || 10,
};
if (!cmd || !file || !['wait', 'collect'].includes(cmd)) {
  console.error('usage: lanes.mjs <wait|collect> <lanes-file> [--deadline-min N] [--interval-sec N]');
  process.exit(2);
}
try {
  if (cmd === 'wait') await cmdWait(file, opts);
  else await cmdCollect(file);
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(2);
}
