/* eslint-disable @typescript-eslint/naming-convention -- environment variable names and the Machines API's exit_code */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * The staging restore drill (`storage-restore-drill.yml`) runs the B2 restore
 * (DR1) on `tau-maintenance-staging` from a manual dispatch. These tests hold it
 * to staging, keep dispatch inputs out of shell source, and run its validation
 * and command steps against a stub `flyctl`.
 */

type Step = { name?: string; id?: string; if?: string; run?: string; env?: Record<string, string> };
type Job = {
  environment: { name: string };
  env: Record<string, string>;
  steps: Step[];
};
const root = resolve(import.meta.dirname, '../..');
const workflow = load(readFileSync(join(root, '.github/workflows/storage-restore-drill.yml'), 'utf8')) as {
  on: Record<string, { inputs: Record<string, { type?: string; options?: string[] }> }>;
  concurrency: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<string, Job>;
};
const jobs = Object.values(workflow.jobs);
const job = jobs[0]!;
const step = (name: string): Step => {
  const found = job.steps.find((candidate) => candidate.name === name);
  if (!found?.run) {
    throw new Error(`Missing step: ${name}`);
  }
  return found;
};
const validate = step('Validate the dispatch').run!;
const runCommand = step('Run the restore command').run!;

describe('storage restore drill workflow', () => {
  it('should be dispatched by hand only, one drill at a time', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.concurrency).toEqual({ group: 'storage-restore-drill-staging', 'cancel-in-progress': false });
    expect(jobs).toHaveLength(1);
  });

  it('should reach only the staging maintenance app, with its own token', () => {
    expect(job.environment.name).toBe('staging');
    expect(job.env['FLY_APP']).toBe('tau-maintenance-staging');
    // Parsed, so comments are gone: no input, value or step names production.
    const source = JSON.stringify(workflow);
    expect(source).not.toMatch(/production/iu);
    expect(source.match(/tau-maintenance[\w-]*/gu)?.every((app) => app === 'tau-maintenance-staging')).toBe(true);
    expect(new Set(source.match(/secrets\.\w+/gu))).toEqual(new Set(['secrets.FLY_MAINTENANCE_API_TOKEN']));
    expect(Object.keys(workflow.on['workflow_dispatch']!.inputs)).not.toContain('environment');
  });

  it('should keep every expression out of shell source', () => {
    for (const { run } of job.steps) {
      expect(run ?? '').not.toContain('${{');
    }
  });

  it('should list no secrets and dump no environment', () => {
    for (const { run } of job.steps) {
      expect(run ?? '').not.toMatch(/secrets (list|set)|\benv\b\s*($|\|)|printenv|set -x/mu);
    }
  });

  it('should stop the Machine afterwards only when this run started it', () => {
    const stop = job.steps.at(-1)!;
    expect(stop.if).toBe("always() && steps.machine.outputs.started == 'true'");
    expect(stop.run).toContain('flyctl machine stop "$MACHINE_ID"');
  });

  // Staging owner ids are the auth library's 32-character ids, with no prefix.
  const owner = 'ac6oGRsoG7rNJf0YZ5jWz79teN5yITPm';
  const project = 'proj_Z9y8X7';
  const sha = 'a'.repeat(64);
  const node = 'node /app/dist/maintenance-command.js';

  it.each([
    ['list', { PROJECT_ID: project }, `${node} restore --project ${project} --owner ${owner} --list`],
    [
      'dry-run',
      { PROJECT_ID: project, GENERATION_FLOOR: '12' },
      `${node} restore --project ${project} --owner ${owner} --operator github-octo-cat --dry-run --generation-floor 12`,
    ],
    [
      'restore',
      { PROJECT_ID: project, GENERATION: '3', CONFIRM_SNAPSHOT: sha },
      `${node} restore --project ${project} --owner ${owner} --operator github-octo-cat --generation 3 --confirm-snapshot ${sha}`,
    ],
    ['owner-dry-run', {}, `${node} restore-owner --owner ${owner} --operator github-octo-cat --dry-run`],
    ['owner-restore', {}, `${node} restore-owner --owner ${owner} --operator github-octo-cat`],
  ] as const)('should build the %s command from validated inputs', (mode, extra, command) => {
    const result = runValidation({ MODE: mode, ...extra });
    expect(result.status).toBe(0);
    expect(result.output).toBe(`command=${command}\n`);
  });

  it.each([
    ['a ref other than main', { REF: 'refs/heads/feature' }],
    ['a shell metacharacter in the project', { PROJECT_ID: 'proj_abc;id' }],
    ['a command substitution in the owner', { OWNER_ID: 'user_$(id)' }],
    ['a flag in the owner', { OWNER_ID: '--list' }],
    ['a newline in the owner', { OWNER_ID: `${owner}\nINJECTED=1` }],
    ['a project without its prefix', { PROJECT_ID: 'abc123' }],
    ['a negative generation floor', { MODE: 'dry-run', GENERATION_FLOOR: '-1' }],
    ['a flag smuggled in a generation', { MODE: 'restore', GENERATION: '3 --list' }],
    ['a confirmation without a generation', { MODE: 'restore', CONFIRM_SNAPSHOT: sha }],
    ['an uppercase confirmation', { MODE: 'restore', GENERATION: '3', CONFIRM_SNAPSHOT: 'A'.repeat(64) }],
    ['a generation on list', { MODE: 'list', GENERATION: '3' }],
    ['a project on an owner mode', { MODE: 'owner-restore', PROJECT_ID: project }],
    ['an unknown mode', { MODE: 'restore-store' }],
    ['an unknown transport', { TRANSPORT: 'console' }],
    ['an actor that is not a login', { ACTOR: 'github-actions[bot]' }],
  ] as const)('should refuse %s', (_label, overrides) => {
    const result = runValidation(overrides);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::');
    expect(result.output).toBe('');
  });

  it('should summarize the JSON lines and withhold credential-shaped output over ssh', () => {
    const json = `{"event":"revisions_maintenance.restore","projectId":"${project}","dryRun":true,"plan":{"snapshot":{"key":"tenants/${owner}/repos/${project}/manifests/x"}}}`;
    const result = runStep({
      transport: 'ssh',
      stub: [
        `echo 'would restore ${owner}/${project} from snapshot generation 4 (trusted, sha256 ${sha}): 2 packs'`,
        `echo '${json}'`,
        `echo 'TAU_S3_RESTORE_SECRET_ACCESS_KEY=fixture-secret' >&2`,
        `echo 'postgres://tau:fixture-secret@db/tau'`,
        'exit 0',
      ].join('\n'),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(json);
    expect(result.stdout + result.summary).not.toContain('fixture-secret');
    expect(result.summary).toContain(json);
    expect(result.summary).toContain('would restore');
    expect(result.summary).toContain('2 output line(s) withheld');
    expect(result.calls).toContain(`ssh console --app tau-maintenance-staging --machine m1 --quiet --command ${node}`);
  });

  it('should fail with the remote exit code over exec and name the last line', () => {
    const response = JSON.stringify({ exit_code: 1, stdout: '', stderr: 'Project owner not found\n' });
    const result = runStep({ transport: 'exec', stub: `echo '${response}'` });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::The maintenance command exited 1.');
    expect(result.summary).toContain('exit status 1');
    expect(result.summary).toContain('Project owner not found');
    expect(result.calls).toContain('machine exec m1');
  });

  it.each(['restore', 'owner-restore'])('should refuse a re-run of a real %s', (mode) => {
    const result = runValidation({ MODE: mode, RUN_ATTEMPT: '2' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::A real restore is never re-run');
    expect(result.output).toBe('');
  });

  it('should allow a re-run of a dry run', () => {
    const result = runValidation({ MODE: 'dry-run', RUN_ATTEMPT: '2' });
    expect(result.status).toBe(0);
  });

  function runValidation(overrides: Record<string, string>): {
    status: number | undefined;
    stdout: string;
    output: string;
  } {
    const directory = mkdtempSync(join(tmpdir(), 'tau-restore-drill-'));
    try {
      const output = join(directory, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', validate], {
        encoding: 'utf8',
        env: {
          PATH: process.env['PATH'],
          MODE: 'list',
          OWNER_ID: owner,
          PROJECT_ID: overrides['MODE']?.startsWith('owner-') ? '' : project,
          GENERATION_FLOOR: '',
          GENERATION: '',
          CONFIRM_SNAPSHOT: '',
          TRANSPORT: 'ssh',
          ACTOR: 'octo-cat',
          REF: 'refs/heads/main',
          RUN_ATTEMPT: '1',
          GITHUB_OUTPUT: output,
          ...overrides,
        },
      });
      return { status: result.status ?? undefined, stdout: result.stdout, output: readFileSync(output, 'utf8') };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  function runStep(args: { transport: 'ssh' | 'exec'; stub: string }): {
    status: number | undefined;
    stdout: string;
    summary: string;
    calls: string;
  } {
    const directory = mkdtempSync(join(tmpdir(), 'tau-restore-drill-run-'));
    try {
      const calls = join(directory, 'calls');
      const summary = join(directory, 'summary');
      writeFileSync(calls, '');
      writeFileSync(summary, '');
      writeFileSync(join(directory, 'flyctl'), `#!/bin/bash\necho "$*" >> "$CALLS"\n${args.stub}\n`, { mode: 0o700 });
      const result = spawnSync('bash', ['-c', runCommand], {
        encoding: 'utf8',
        env: {
          PATH: `${directory}:${process.env['PATH'] ?? ''}`,
          CALLS: calls,
          RUNNER_TEMP: directory,
          GITHUB_STEP_SUMMARY: summary,
          FLY_APP: 'tau-maintenance-staging',
          MACHINE_ID: 'm1',
          TRANSPORT: args.transport,
          COMMAND: `${node} restore --project ${project} --owner ${owner} --operator github-octo-cat --dry-run`,
          MODE: 'dry-run',
        },
      });
      return {
        status: result.status ?? undefined,
        stdout: result.stdout,
        summary: readFileSync(summary, 'utf8'),
        calls: readFileSync(calls, 'utf8'),
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
