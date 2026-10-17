import { describe, expect, it } from 'vitest';

import { consumerParity, consumers, parityReport, resolveOracle } from '#consumer-parity-summary.js';
import type { ActionsReader, Consumer, Oracle, RunFilter, WorkflowJob, WorkflowRun } from '#consumer-parity-summary.js';

const run = (id: number, branch = 'main'): WorkflowRun => ({
  id,
  url: `https://github.com/taucad/tau/actions/runs/${String(id)}`,
  branch,
  sha: `${String(id)}abcdef0123456789`,
  createdAt: '2026-10-17T13:23:00Z',
});

const job = (name: string, conclusion: string | undefined, steps: WorkflowJob['steps'] = []): WorkflowJob => ({
  name,
  conclusion,
  steps,
  url: `https://github.com/taucad/tau/actions/runs/1/job/${String(name.length)}`,
});

/** A reader over fixed runs: `runs` by workflow (each tagged with its branch), `jobs` by run id. */
const reader = (fixture: {
  readonly current: WorkflowRun;
  readonly runs: Readonly<Record<string, readonly WorkflowRun[]>>;
  readonly jobs: Readonly<Record<number, readonly WorkflowJob[]>>;
}): ActionsReader & { readonly asked: Array<RunFilter & { workflow: string }> } => {
  const asked: Array<RunFilter & { workflow: string }> = [];
  return {
    asked,
    currentRun: async () => fixture.current,
    jobs: async (id) => fixture.jobs[id] ?? [],
    runs: async (workflow, filter) => {
      asked.push({ workflow, ...filter });
      return (fixture.runs[workflow] ?? []).filter(
        (candidate) => filter.branch === undefined || candidate.branch === filter.branch,
      );
    },
  };
};

const desktop = 'Packaged desktop end-to-end (darwin-arm64)';
const thisRun: Oracle = {
  kind: 'job',
  workflow: 'e2e-nightly.yml',
  job: desktop,
  match: 'exact',
  scope: 'this-run',
  proves: 'packaged suite',
};

describe('resolveOracle', () => {
  it('should judge a nightly job from this run when it ran here', async () => {
    const result = await resolveOracle(
      thisRun,
      reader({ current: run(9), runs: {}, jobs: { 9: [job(desktop, 'success')] } }),
    );

    expect(result.status).toBe('pass');
    expect(result.evidence).toContain('this run');
    expect(result.evidence).toContain('run 9');
  });

  it('should fall back to the latest nightly on main that ran the job when this run skipped it', async () => {
    const fake = reader({
      current: run(9, 'claude/branch'),
      runs: { 'e2e-nightly.yml': [run(8), run(7)] },
      jobs: { 9: [job(desktop, 'skipped')], 8: [job(desktop, 'skipped')], 7: [job(desktop, 'failure')] },
    });

    const result = await resolveOracle(thisRun, fake);

    expect(result.status).toBe('fail');
    expect(result.evidence).toContain('run 7');
    expect(result.evidence).toContain('skipped in this run');
    expect(fake.asked).toEqual([{ workflow: 'e2e-nightly.yml', branch: 'main' }]);
  });

  it('should fail a matrix oracle when any one of its jobs failed', async () => {
    const shards: Oracle = {
      kind: 'job',
      workflow: 'ci.yml',
      job: 'Affected (test-',
      match: 'prefix',
      scope: 'main',
      proves: 'tests',
    };
    const result = await resolveOracle(
      shards,
      reader({
        current: run(9),
        runs: { 'ci.yml': [run(5)] },
        jobs: {
          5: [
            job('Affected (test-1)', 'success'),
            job('Affected (test-2)', 'failure'),
            job('Affected (lint)', 'failure'),
          ],
        },
      }),
    );

    expect(result.status).toBe('fail');
    expect(result.evidence).toContain('Affected (test-2)');
    expect(result.evidence).not.toContain('Affected (lint)');
  });

  it('should read a path-filtered workflow on any ref', async () => {
    const image: Oracle = {
      kind: 'job',
      workflow: 'host-image.yml',
      job: 'Host image',
      match: 'exact',
      scope: 'any',
      proves: 'image',
    };
    const fake = reader({
      current: run(9),
      runs: { 'host-image.yml': [run(4, 'dependabot/x')] },
      jobs: { 4: [job('Host image', 'success')] },
    });

    const result = await resolveOracle(image, fake);

    expect(result.status).toBe('pass');
    expect(result.evidence).toContain('`dependabot/x`');
    expect(fake.asked).toEqual([{ workflow: 'host-image.yml' }]);
  });

  it('should ask only for runs of the trigger an oracle names', async () => {
    const previews: Oracle = {
      kind: 'job',
      workflow: 'preview-packages.yml',
      job: 'Install the previews (',
      match: 'prefix',
      scope: 'main',
      event: 'workflow_dispatch',
      proves: 'previews',
    };
    const fake = reader({ current: run(9), runs: {}, jobs: {} });

    const result = await resolveOracle(previews, fake);

    expect(fake.asked).toEqual([{ workflow: 'preview-packages.yml', branch: 'main', event: 'workflow_dispatch' }]);
    expect(result.evidence).toContain('no completed workflow_dispatch run');
  });

  it('should judge one step of a job, and look past runs whose job lacks it', async () => {
    const doctor: Oracle = {
      kind: 'job',
      workflow: 'preview-packages.yml',
      job: 'Install the previews (',
      match: 'prefix',
      step: 'Smoke the preview agent plugin with doctor',
      scope: 'main',
      event: 'workflow_dispatch',
      proves: 'doctor',
    };
    const install = { name: 'Install every preview by URL and export a GLB', conclusion: 'failure' };
    const smoke = (conclusion: string) => ({ name: 'Smoke the preview agent plugin with doctor', conclusion });
    const fake = reader({
      current: run(9),
      runs: { 'preview-packages.yml': [run(6), run(5)] },
      jobs: {
        6: [job('Install the previews (ubuntu-latest)', 'failure', [install])],
        5: [
          job('Install the previews (ubuntu-latest)', 'failure', [install, smoke('success')]),
          job('Install the previews (macos-26)', 'failure', [install, smoke('success')]),
        ],
      },
    });

    const result = await resolveOracle(doctor, fake);

    expect(result.status).toBe('pass');
    expect(result.evidence).toContain('Install the previews (macos-26) › Smoke the preview agent plugin with doctor');
    expect(result.evidence).toContain('run 5');
  });

  it('should judge a step that ran on one leg of a matrix by that leg alone', async () => {
    const doctor: Oracle = {
      kind: 'job',
      workflow: 'preview-packages.yml',
      job: 'Install the previews (',
      match: 'prefix',
      step: 'Smoke',
      scope: 'any',
      proves: 'doctor',
    };
    const fake = reader({
      current: run(9),
      runs: { 'preview-packages.yml': [run(6), run(5)] },
      jobs: {
        6: [
          job('Install the previews (ubuntu-latest)', 'success', [{ name: 'Smoke', conclusion: 'skipped' }]),
          job('Install the previews (macos-26)', 'success', [{ name: 'Smoke', conclusion: 'success' }]),
        ],
        5: [job('Install the previews (macos-26)', 'failure', [{ name: 'Smoke', conclusion: 'failure' }])],
      },
    });

    const result = await resolveOracle(doctor, fake);

    expect(result.status).toBe('pass');
    expect(result.evidence).toContain('run 6');
    expect(result.evidence).not.toContain('ubuntu-latest');
  });

  it('should mark a path-filtered result older than seven days stale without failing it', async () => {
    const image: Oracle = {
      kind: 'job',
      workflow: 'host-image.yml',
      job: 'Host image',
      match: 'exact',
      scope: 'any',
      proves: 'image',
    };
    const fake = reader({
      current: run(9),
      runs: { 'host-image.yml': [run(4, 'dependabot/x')] },
      jobs: { 4: [job('Host image', 'success')] },
    });

    const fresh = await resolveOracle(image, fake, new Date('2026-10-24T13:00:00Z'));
    const stale = await resolveOracle(image, fake, new Date('2026-10-25T13:24:00Z'));

    expect(fresh.evidence).not.toContain('stale');
    expect(stale).toMatchObject({ status: 'pass' });
    expect(stale.evidence).toContain('stale (8 days old)');
  });

  it('should fail when no run in the lookback ran the job', async () => {
    const result = await resolveOracle(
      { ...thisRun, scope: 'main' },
      reader({ current: run(9), runs: { 'e2e-nightly.yml': [run(3)] }, jobs: { 3: [] } }),
    );

    expect(result.status).toBe('fail');
    expect(result.evidence).toContain('no completed run');
  });

  it('should fail an oracle no workflow runs', async () => {
    const result = await resolveOracle(
      { kind: 'missing', proves: 'doctor --smoke' },
      reader({ current: run(9), runs: {}, jobs: {} }),
    );

    expect(result).toMatchObject({ status: 'fail', evidence: 'no oracle: no workflow runs it' });
  });
});

describe('consumerParity', () => {
  it('should pass a consumer only when every oracle passed, and print one row per consumer', async () => {
    const table: readonly Consumer[] = [
      { name: 'Packaged desktop', oracles: [thisRun] },
      { name: 'Agent plugins', oracles: [thisRun, { kind: 'missing', proves: 'doctor --smoke' }] },
    ];
    const results = await consumerParity(
      reader({ current: run(9), runs: {}, jobs: { 9: [job(desktop, 'success')] } }),
      {
        details: new Map([['Packaged desktop', '33 passed (33)']]),
        table,
      },
    );

    expect(results.map(({ consumer, status }) => [consumer.name, status])).toEqual([
      ['Packaged desktop', 'pass'],
      ['Agent plugins', 'fail'],
    ]);
    const report = parityReport(results);
    expect(report).toContain('1 of 2 consumers pass.');
    expect(report).toContain('| **Packaged desktop** | **pass** | packaged suite | pass: ');
    expect(report).toContain('; 33 passed (33) |');
    expect(report).toContain('| **Agent plugins** | **fail** |');
    expect(report).toContain('|  |  | doctor --smoke | fail: no oracle: no workflow runs it |');
  });

  it('should list every consumer charter W22 names', () => {
    expect(consumers.map(({ name }) => name)).toEqual([
      'Browser / UI',
      'Packaged desktop',
      'MCP under Claude Code',
      'MCP under Codex',
      'CLI binary',
      'Daemon (`tau serve`)',
      'Docker host image',
      'Agent plugins',
      'Client-hosted static host',
    ]);
    expect(consumers.every(({ oracles }) => oracles.length > 0)).toBe(true);
    expect(consumers.flatMap(({ oracles }) => oracles).filter(({ kind }) => kind === 'missing')).toEqual([]);
  });
});
