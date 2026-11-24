import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Owner, Request, VitestReport } from '#timing-budget-report.js';
import { commentBody, marker, readReports, report, specResults, upsertComment } from '#timing-budget-report.js';

const owner = (spec: string, issue: number): Owner => ({ project: 'ui-e2e', root: 'apps/ui-e2e', spec, issue });
const owners = [
  owner('src/project-load-frames.spec.ts', 2288),
  owner('src/revision-latency.spec.ts', 2288),
  owner('src/glass-prism-loader.spec.ts', 2287),
];
const file = (spec: string, statuses: readonly string[], status = 'passed'): VitestReport['testResults'][number] => ({
  name: `/home/runner/work/tau/tau/apps/ui-e2e/${spec}`,
  status,
  startTime: 1000,
  endTime: 1000 + 90_000,
  assertionResults: statuses.map((entry) => ({ status: entry })),
});
const reports: VitestReport[] = [
  { testResults: [file('src/project-load-frames.spec.ts', ['passed', 'failed', 'skipped'], 'failed')] },
  { testResults: [file('src/glass-prism-loader.spec.ts', ['passed', 'passed', 'pending'])] },
];
const run = { url: 'https://github.com/taucad/tau/actions/runs/123', sha: '0123456789abcdef' };

/** A fake GitHub API holding one issue's comments, recording every call. */
const fakeGithub = (comments: Record<number, Array<{ id: number; body: string }>>) => {
  const calls: Array<readonly [string, string, unknown]> = [];
  let next = 1000;
  const request: Request = async (method, path, body) => {
    calls.push([method, path, body]);
    const list = /issues\/(\d+)\/comments\?per_page=100&page=(\d+)$/u.exec(path);
    if (method === 'GET' && list) {
      const page = Number(list[2]);
      return (comments[Number(list[1])] ?? []).slice((page - 1) * 100, page * 100);
    }
    const create = /issues\/(\d+)\/comments$/u.exec(path);
    if (method === 'POST' && create) {
      const created = { id: next++, body: (body as { body: string }).body };
      (comments[Number(create[1])] ??= []).push(created);
      return created;
    }
    const edit = /issues\/comments\/(\d+)$/u.exec(path);
    if (method === 'PATCH' && edit) {
      const existing = Object.values(comments)
        .flat()
        .find(({ id }) => id === Number(edit[1]));
      if (existing) {
        existing.body = (body as { body: string }).body;
      }
      return existing;
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { request, calls, comments };
};

describe('timing-budget report', () => {
  it('should read each spec result from the report that ran it, and mark a spec without one as no result', () => {
    expect(specResults(owners, reports)).toEqual([
      { ...owners[0], outcome: 'failed', passed: 1, failed: 1, skipped: 1, milliseconds: 90_000 },
      { ...owners[1], outcome: 'no result', passed: 0, failed: 0, skipped: 0 },
      { ...owners[2], outcome: 'passed', passed: 2, failed: 0, skipped: 1, milliseconds: 90_000 },
    ]);
  });

  it('should fail a spec whose file failed with no failed test, such as a collection error', () => {
    const [result] = specResults(
      [owners[2]!],
      [{ testResults: [file('src/glass-prism-loader.spec.ts', [], 'failed')] }],
    );
    expect(result?.outcome).toBe('failed');
  });

  it('should not match a spec of the same name under another project root', () => {
    const elsewhere: VitestReport = {
      testResults: [
        { ...file('src/revision-latency.spec.ts', ['passed']), name: '/w/apps/other/src/revision-latency.spec.ts' },
      ],
    };
    expect(specResults([owners[1]!], [elsewhere])[0]?.outcome).toBe('no result');
  });

  it('should read every downloaded report and none from a missing directory', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-timing-budget-reports-'));
    try {
      for (const [index, entry] of reports.entries()) {
        mkdirSync(join(directory, `timing-budget-report-ui-e2e--shard-${index + 1}-of-9`));
        writeFileSync(
          join(directory, `timing-budget-report-ui-e2e--shard-${index + 1}-of-9`, 'report.json'),
          JSON.stringify(entry),
        );
      }
      expect(await readReports(directory)).toEqual(reports);
      expect(await readReports(join(directory, 'missing'))).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('should carry the marker, the run, the commit and only the issue own specs', () => {
    const body = commentBody(specResults(owners.slice(0, 2), reports), run);
    expect(body.startsWith(marker)).toBe(true);
    expect(body).toContain('[123](https://github.com/taucad/tau/actions/runs/123) on `0123456789`');
    expect(body).toContain('2 of 2 specs of this issue are not green.');
    expect(body).toContain('| `apps/ui-e2e/src/project-load-frames.spec.ts` | failed | 1 | 1 | 1 | 1.5 min |');
    expect(body).toContain('| `apps/ui-e2e/src/revision-latency.spec.ts` | no result | 0 | 0 | 0 |  |');
    expect(body).not.toContain('glass-prism-loader');
    expect(commentBody(specResults([owners[2]!], reports), run)).toContain('Every spec of this issue passed.');
  });

  it('should create the comment once and then edit it in place', async () => {
    const github = fakeGithub({ 2288: [{ id: 1, body: 'an unrelated comment' }] });
    expect(
      await upsertComment({ request: github.request, repository: 'taucad/tau', issue: 2288, body: `${marker}\nfirst` }),
    ).toBe('created');
    expect(
      await upsertComment({
        request: github.request,
        repository: 'taucad/tau',
        issue: 2288,
        body: `${marker}\nsecond`,
      }),
    ).toBe('updated');
    expect(github.comments[2288]).toEqual([
      { id: 1, body: 'an unrelated comment' },
      { id: 1000, body: `${marker}\nsecond` },
    ]);
  });

  it('should find the comment past the first page of comments', async () => {
    const many = Array.from({ length: 150 }, (_, index) => ({ id: index + 1, body: index === 120 ? marker : 'x' }));
    const github = fakeGithub({ 2287: many });
    expect(
      await upsertComment({ request: github.request, repository: 'taucad/tau', issue: 2287, body: `${marker}\nnew` }),
    ).toBe('updated');
    expect(github.calls.map(([method, path]) => `${method} ${path}`)).toEqual([
      'GET repos/taucad/tau/issues/2287/comments?per_page=100&page=1',
      'GET repos/taucad/tau/issues/2287/comments?per_page=100&page=2',
      'PATCH repos/taucad/tau/issues/comments/121',
    ]);
  });

  it('should update one comment per owner issue', async () => {
    const github = fakeGithub({});
    const lines: string[] = [];
    await report({
      owners,
      reports,
      run,
      repository: 'taucad/tau',
      request: github.request,
      log: (line) => lines.push(line),
    });
    expect(Object.keys(github.comments)).toEqual(['2287', '2288']);
    expect(github.comments[2287]).toHaveLength(1);
    expect(github.comments[2288]).toHaveLength(1);
    expect(lines).toEqual([
      '#2287: created (src/glass-prism-loader.spec.ts passed)',
      '#2288: created (src/project-load-frames.spec.ts failed, src/revision-latency.spec.ts no result)',
    ]);
  });
});
