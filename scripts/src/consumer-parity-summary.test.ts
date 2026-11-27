import { describe, expect, it } from 'vitest';

import { consumerParity, consumers, parityReport, resolveOracle } from '#consumer-parity-summary.js';
import type { ActionsReader, Consumer, Oracle, RunFilter, WorkflowJob, WorkflowRun } from '#consumer-parity-summary.js';

const run = (
  id: number,
  branch = 'main',
  { event = 'push', sha = `${String(id)}abcdef0123456789` }: { readonly event?: string; readonly sha?: string } = {},
): WorkflowRun => ({
  id,
  url: `https://github.com/taucad/tau/actions/runs/${String(id)}`,
  branch,
  sha,
  event,
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
        (candidate) =>
          (filter.branch === undefined || candidate.branch === filter.branch) &&
          (filter.event === undefined || candidate.event === filter.event) &&
          (filter.sha === undefined || candidate.sha === filter.sha),
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
      runs: { 'e2e-nightly.yml': [run(8, 'main', { event: 'schedule' }), run(7, 'main', { event: 'schedule' })] },
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

  describe('on main, keyed by commit', () => {
    const cli: Oracle = {
      kind: 'job',
      workflow: 'ci.yml',
      job: 'CLI end-to-end (',
      match: 'prefix',
      scope: 'main',
      proves: 'cli',
    };
    const landed = 'aaaa111122223333';
    const queue = (id: number, sha: string): WorkflowRun =>
      run(id, `gh-readonly-queue/main/pr-${String(id)}-${sha}`, { event: 'merge_group', sha });

    it('should read a lane the push skipped from the merge-queue run on the same commit', async () => {
      const fake = reader({
        current: run(9),
        runs: { 'ci.yml': [run(20, 'main', { sha: landed }), queue(31, landed)] },
        jobs: {
          20: [job('CLI end-to-end (1/2)', 'skipped'), job('CLI end-to-end (2/2)', 'skipped')],
          31: [job('CLI end-to-end (1/2)', 'success'), job('CLI end-to-end (2/2)', 'success')],
        },
      });

      const result = await resolveOracle(cli, fake);

      expect(result.status).toBe('pass');
      expect(result.evidence).toContain('run 31');
      expect(result.evidence).toContain('merge-queue run on this commit, reused by push [run 20]');
      expect(fake.asked).toEqual([
        { workflow: 'ci.yml', branch: 'main' },
        { workflow: 'ci.yml', sha: landed, event: 'merge_group' },
      ]);
    });

    it('should never read a queue run of a group that did not land', async () => {
      const fake = reader({
        current: run(9),
        runs: {
          'ci.yml': [queue(40, 'bbbb999988887777'), run(20, 'main', { sha: landed }), queue(31, landed)],
        },
        jobs: {
          40: [job('CLI end-to-end (1/2)', 'failure')],
          20: [job('CLI end-to-end (1/2)', 'skipped')],
          31: [job('CLI end-to-end (1/2)', 'success')],
        },
      });

      const result = await resolveOracle(cli, fake);

      expect(result.status).toBe('pass');
      expect(result.evidence).not.toContain('run 40');
    });

    it('should walk back to the newest commit whose push or queue run ran an affected-only lane', async () => {
      const older = 'cccc444455556666';
      const fake = reader({
        current: run(9),
        runs: {
          'ci.yml': [
            run(21, 'main', { sha: landed }),
            queue(32, landed),
            run(20, 'main', { sha: older }),
            queue(30, older),
          ],
        },
        jobs: {
          21: [job('CLI end-to-end (1/2)', 'skipped')],
          32: [job('CLI end-to-end (1/2)', 'skipped')],
          20: [job('CLI end-to-end (1/2)', 'skipped')],
          30: [job('CLI end-to-end (1/2)', 'failure')],
        },
      });

      const result = await resolveOracle(cli, fake);

      expect(result.status).toBe('fail');
      expect(result.evidence).toContain('run 30');
    });

    it('should prefer the push run on a commit that did not reuse the queue', async () => {
      const fake = reader({
        current: run(9),
        runs: { 'ci.yml': [run(20, 'main', { sha: landed }), queue(31, landed)] },
        jobs: { 20: [job('CLI end-to-end (1/2)', 'failure')], 31: [job('CLI end-to-end (1/2)', 'success')] },
      });

      const result = await resolveOracle(cli, fake);

      expect(result.status).toBe('fail');
      expect(result.evidence).toContain('run 20');
      expect(fake.asked).toEqual([{ workflow: 'ci.yml', branch: 'main' }]);
    });

    it('should name the queue in the evidence when no commit ran the lane', async () => {
      const result = await resolveOracle(
        cli,
        reader({
          current: run(9),
          runs: { 'ci.yml': [run(20)] },
          jobs: { 20: [job('CLI end-to-end (1/2)', 'skipped')] },
        }),
      );

      expect(result.status).toBe('fail');
      expect(result.evidence).toContain('on `main` (nor the merge-queue run on its commit) ran `CLI end-to-end (`');
    });
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
      runs: {
        'preview-packages.yml': [
          run(6, 'main', { event: 'workflow_dispatch' }),
          run(5, 'main', { event: 'workflow_dispatch' }),
        ],
      },
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
    // DS-4: the packaged suite runs only as the staging candidate gate, so its row reads that gate on `main`.
    expect(consumers.find(({ name }) => name === 'Packaged desktop')?.oracles).toEqual([
      expect.objectContaining({
        workflow: 'release-desktop-staging.yml',
        job: 'Packaged desktop gate / Packaged desktop end-to-end (darwin-arm64)',
        scope: 'main',
      }),
    ]);
    expect(consumers.flatMap(({ oracles }) => oracles).filter(({ kind }) => kind === 'missing')).toEqual([]);
  });

  it('should read the merge-queue-only ci.yml lanes by main commit, never from a queue run on any ref', () => {
    // A `main` push reuses the queue verdict and skips these lanes (DC-16), and Q-2 moved the darwin rows into
    // `ci.yml`. They are read on `main` commits, which follow the reuse to the queue run on the same commit (#2296).
    const ciLanes = consumers
      .flatMap(({ oracles }) => oracles)
      .filter((oracle) => oracle.kind === 'job' && oracle.workflow === 'ci.yml');
    expect(ciLanes).toHaveLength(11);
    for (const oracle of ciLanes) {
      expect(oracle).toMatchObject({ scope: 'main' });
      expect(oracle).not.toHaveProperty('event');
    }
    expect(
      consumers
        .flatMap(({ oracles }) => oracles)
        .some((oracle) => oracle.kind === 'job' && oracle.workflow === 'native-darwin.yml'),
    ).toBe(false);
  });
});
