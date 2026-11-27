import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * The merge-queue sweep (`merge-queue-sweep.yml`) cancels the runs of queue groups that no longer exist, so a rebuilt
 * group's old run stops holding runners. A group that merged has no queue branch either, but its required gate
 * passed: only non-gating jobs can still be running there, the shadow rows (FQ-13), and a shadow row cancelled after
 * the merge leaves its flake-ledger count as it was. So the sweep leaves a run whose commit landed on `main` to finish.
 */

type Step = { readonly name?: string; readonly run?: string; readonly env?: Record<string, string> };
type Workflow = { readonly jobs: Record<string, { readonly steps: readonly Step[] }> };

const workflow = load(
  readFileSync(resolve(import.meta.dirname, '../../.github/workflows/merge-queue-sweep.yml'), 'utf8'),
) as Workflow;
const script = workflow.jobs['sweep']?.steps.find((step) => step.run !== undefined)?.run ?? '';

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** One unfinished merge-group run, as the sweep lists it. */
type Run = { readonly id: number; readonly branch: string; readonly sha: string };

/**
 * Run the sweep's script against a fake `gh`: `runs` are the unfinished merge-group runs (listed under every status, as
 * the API may), `live` the queue branches that still exist, `compare` the compare status of each commit against `main`
 * (a missing one fails the call). Returns the run ids cancelled and the output.
 */
const sweep = (input: {
  readonly runs: readonly Run[];
  readonly live: readonly string[];
  readonly compare: Readonly<Record<string, string>>;
}): { cancelled: number[]; stdout: string; status: number | undefined } => {
  const directory = mkdtempSync(join(tmpdir(), 'merge-queue-sweep-'));
  directories.push(directory);
  const cancels = join(directory, 'cancels');
  writeFileSync(cancels, '');
  writeFileSync(join(directory, 'runs'), input.runs.map((run) => `${run.id} ${run.branch} ${run.sha}`).join('\n'));
  writeFileSync(join(directory, 'live'), input.live.join('\n'));
  writeFileSync(
    join(directory, 'compare'),
    Object.entries(input.compare)
      .map(([sha, status]) => `${sha} ${status}`)
      .join('\n'),
  );
  // Answers the four calls the sweep makes; `--jq` output is what the real filters produce from these fixtures.
  writeFileSync(
    join(directory, 'gh'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `dir=${JSON.stringify(directory)}`,
      'args="$*"',
      'case "$args" in',
      String.raw`  *"-X POST"*/cancel*) sed -E 's#.*actions/runs/([0-9]+)/cancel.*#\1#' <<< "$args" >> "$dir/cancels" ;;`,
      String.raw`  *actions/runs\?event=merge_group*) cat "$dir/runs"; echo ;;`,
      '  *matching-refs/heads/gh-readonly-queue*) cat "$dir/live"; echo ;;',
      String.raw`  *compare/*) sha=$(sed -E 's#.*compare/([^.]+)\.\.\..*#\1#' <<< "$args")`,
      `    status=$(awk -v s="$sha" '$1 == s { print $2 }' "$dir/compare")`,
      '    if [ -z "$status" ]; then echo "gh: Not Found (HTTP 404)" >&2; exit 1; fi',
      '    echo "$status" ;;',
      '  *) echo "unexpected gh call: $args" >&2; exit 2 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(join(directory, 'gh'), 0o755);
  const result = spawnSync('bash', ['-e', '-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...Object.fromEntries([
        ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
        ['GH_REPO', 'taucad/tau'],
        ['GITHUB_RUN_ID', '1'],
        ...Object.entries(workflow.jobs['sweep']?.steps.find((step) => step.run !== undefined)?.env ?? {}).filter(
          ([name]) => name !== 'GH_TOKEN' && name !== 'GH_REPO',
        ),
      ]),
    },
  });
  const cancelled = readFileSync(cancels, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map(Number);
  return { cancelled, stdout: `${result.stdout}${result.stderr}`, status: result.status ?? undefined };
};

const branch = (pr: number, sha: string): string => `gh-readonly-queue/main/pr-${pr}-${sha}`;

describe('merge-queue sweep', () => {
  it('should cancel the run of a queue group that was rebuilt or removed', () => {
    const result = sweep({
      runs: [{ id: 10, branch: branch(1, 'aaa'), sha: 'g1' }],
      live: [],
      compare: { g1: 'diverged' },
    });
    expect(result.status).toBe(0);
    expect(result.cancelled).toEqual([10]);
  });

  it('should leave the run of a group that merged to finish its shadow rows, whether main moved on or not', () => {
    const result = sweep({
      runs: [
        { id: 11, branch: branch(2, 'bbb'), sha: 'g2' },
        { id: 12, branch: branch(3, 'ccc'), sha: 'g3' },
      ],
      live: [],
      compare: { g2: 'identical', g3: 'ahead' },
    });
    expect(result.status).toBe(0);
    expect(result.cancelled).toEqual([]);
    expect(result.stdout).toContain('Left run 11');
    expect(result.stdout).toContain('Left run 12');
  });

  it('should cancel a run whose commit it cannot place on main, as before', () => {
    const result = sweep({
      runs: [
        { id: 13, branch: branch(4, 'ddd'), sha: 'unknown' },
        { id: 14, branch: branch(5, 'eee'), sha: 'g5' },
      ],
      live: [],
      compare: { g5: 'behind' },
    });
    expect(result.status).toBe(0);
    expect(result.cancelled).toEqual([13, 14]);
  });

  it('should never touch a live group or its own run, and ask no compare for them', () => {
    const live = branch(6, 'fff');
    const result = sweep({
      runs: [
        { id: 1, branch: branch(7, 'ggg'), sha: 'g7' },
        { id: 15, branch: live, sha: 'g6' },
      ],
      live: [live],
      compare: {},
    });
    expect(result.status).toBe(0);
    expect(result.cancelled).toEqual([]);
  });
});
