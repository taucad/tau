/* eslint-disable @typescript-eslint/naming-convention -- Responses are GitHub REST JSON. */
import { describe, expect, it } from 'vitest';

import type { Client } from '#ci-github-client.js';
import { readLandings, readOwnerIssues, readUsage } from '#ci-flake-metrics-cli.js';

/** A read-only client that answers each path from `routes` (the first prefix that matches) and records the calls. */
const fakeClient = (routes: ReadonlyArray<[string, unknown]>): Client & { calls: string[] } => {
  const calls: string[] = [];
  return {
    repository: 'taucad/tau',
    calls,
    async get<T>(path: string): Promise<T> {
      calls.push(path);
      const route = routes.find(([prefix]) => path.startsWith(prefix));
      if (!route) {
        throw new Error(`unexpected ${path}`);
      }
      return route[1] as T;
    },
    getText: async () => '',
    getBytes: async () => new Uint8Array(),
    send: async () => {
      throw new Error('read only');
    },
    budget: () => 100,
  };
};

const window = { from: '2026-11-19T00:00:00Z', to: '2026-11-26T00:00:00Z' };

describe('flake quarantine metrics readers (FQ-11)', () => {
  it('should read the released and operator issues of the last 30 days with their automation comments only', async () => {
    const github = fakeClient([
      [
        '/repos/taucad/tau/issues?state=all&labels=flake%3Areleased&since=2026-10-27T00:00:00.000Z',
        [
          {
            number: 7,
            labels: [{ name: 'flake' }, { name: 'flake:released' }],
          },
          { number: 9, labels: ['flake:released'], pull_request: {} },
        ],
      ],
      [
        '/repos/taucad/tau/issues?state=all&labels=flake%3Aneeds-operator',
        [
          {
            number: 7,
            labels: [{ name: 'flake' }, { name: 'flake:released' }],
          },
          { number: 3, labels: [{}] },
        ],
      ],
      [
        '/repos/taucad/tau/issues/7/comments',
        [
          { body: 'bot', user: { type: 'Bot' } },
          { body: 'person', user: { type: 'User' } },
        ],
      ],
      ['/repos/taucad/tau/issues/3/comments', []],
    ]);
    expect(await readOwnerIssues(github, '2026-11-26')).toEqual([
      { number: 3, labels: [], comments: [] },
      { number: 7, labels: ['flake', 'flake:released'], comments: ['bot'] },
    ]);
  });

  it('should read the pull requests merged in the window and their first enqueue, stopping at the window', async () => {
    const github = fakeClient([
      [
        '/repos/taucad/tau/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=1',
        [
          {
            number: 3,
            merged_at: '2026-11-25T00:00:00Z',
            updated_at: '2026-11-25T00:00:00Z',
          },
          // Closed without merging.
          { number: 2, merged_at: null, updated_at: '2026-11-24T00:00:00Z' },
          {
            number: 4,
            merged_at: '2026-11-21T00:00:00Z',
            updated_at: '2026-11-22T00:00:00Z',
          },
          // Merged before the window.
          {
            number: 1,
            merged_at: '2026-11-10T00:00:00Z',
            updated_at: '2026-11-10T00:00:00Z',
          },
          ...Array.from({ length: 96 }, (_, index) => ({
            number: 100 + index,
            merged_at: null,
            updated_at: '2026-11-01T00:00:00Z',
          })),
        ],
      ],
      [
        '/repos/taucad/tau/issues/3/events',
        [
          { event: 'added_to_merge_queue', created_at: '2026-11-24T23:00:00Z' },
          { event: 'added_to_merge_queue', created_at: '2026-11-24T22:00:00Z' },
          { event: 'labeled', created_at: '2026-11-24T21:00:00Z' },
        ],
      ],
      ['/repos/taucad/tau/issues/4/events', []],
    ]);
    expect(await readLandings(github, window)).toEqual([
      {
        number: 3,
        mergedAt: '2026-11-25T00:00:00Z',
        firstEnqueuedAt: '2026-11-24T22:00:00Z',
      },
      {
        number: 4,
        mergedAt: '2026-11-21T00:00:00Z',
        firstEnqueuedAt: undefined,
      },
    ]);
    // One page: it held a pull request updated before the window.
    expect(github.calls.filter((call) => call.includes('/pulls?'))).toHaveLength(1);
  });

  it('should sum the runner minutes of every stress and agent run in the window', async () => {
    const job = (started: string, completed: string): Record<string, unknown> => ({
      id: 1,
      name: 'repro',
      status: 'completed',
      conclusion: 'success',
      created_at: started,
      started_at: started,
      completed_at: completed,
    });
    const github = fakeClient([
      [
        '/repos/taucad/tau/actions/workflows/flake-repro.yml/runs?created=2026-11-19T00:00:00Z..2026-11-26T00:00:00Z&per_page=100',
        { total_count: 1, workflow_runs: [{ id: 11 }] },
      ],
      [
        '/repos/taucad/tau/actions/workflows/flake-regression.yml/runs?created=',
        { total_count: 1, workflow_runs: [{ id: 12 }] },
      ],
      [
        '/repos/taucad/tau/actions/runs/11/jobs',
        {
          jobs: [
            job('2026-11-20T10:00:00Z', '2026-11-20T10:30:00Z'),
            job('2026-11-20T10:00:00Z', '2026-11-20T10:15:00Z'),
          ],
        },
      ],
      ['/repos/taucad/tau/actions/runs/12/jobs', { jobs: [job('2026-11-21T10:00:00Z', '2026-11-21T10:05:00Z')] }],
    ]);
    expect(await readUsage(github, window)).toEqual({
      runs: 2,
      runnerMinutes: 50,
    });
  });
});
