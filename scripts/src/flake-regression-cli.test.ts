/* eslint-disable @typescript-eslint/naming-convention -- GitHub REST JSON. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

import { GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { serializeState } from '#ci-flake-ledger-state.js';
import { fileStore } from '#ci-flake-ledger-store.js';
import {
  commitNumber,
  commitSha,
  culpritCommit,
  ordinaryId,
  regressedId,
  runAt,
  seededLedger,
  stubProber,
} from '#fixtures/flake-regression/seeded-history.js';
import type { StubOptions } from '#fixtures/flake-regression/seeded-history.js';
import { issueLabels, reportRows, reproProber, runInvocation } from '#flake-regression-cli.js';
import type { InvocationOptions, ReproDeps } from '#flake-regression-cli.js';
import { bisectMarker, identityMarker } from '#flake-regression.js';
import type { ReproIdentity } from '#flake-regression.js';

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };

/** A client answering from a handler, recording every request; an unanswered path is a 404. */
const fakeGitHub = (
  handler: (method: string, path: string, body?: unknown) => unknown,
): { github: Client; calls: Call[] } => {
  const calls: Call[] = [];
  const answer = (method: string, path: string, body?: unknown): unknown => {
    calls.push({ method, path, ...(body === undefined ? {} : { body }) });
    const value = handler(method, path, body);
    if (value === undefined) {
      throw new GitHubError(`${method} ${path}`, 404);
    }
    return value;
  };
  const github: Client = {
    repository: 'taucad/tau',
    budget: () => 1000,
    get: async <T>(path: string): Promise<T> => answer('GET', path) as T,
    getText: async (path: string): Promise<string> => answer('GET', path) as string,
    getBytes: async (path: string): Promise<Uint8Array<ArrayBuffer>> => answer('GET', path) as Uint8Array<ArrayBuffer>,
    send: async <T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown): Promise<T> =>
      answer(method, path, body) as T,
  };
  return { github, calls };
};

/** The commits API over the synthetic `main`: newest first from `sha`, 100 a page. */
const commitsPage = (path: string): unknown => {
  const match = /\/commits\?sha=([\da-f]{40})&per_page=100&page=(\d+)$/u.exec(path);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  const head = commitNumber(match[1]);
  const page = Number(match[2]);
  const numbers = Array.from({ length: 100 }, (_, index) => head - (page - 1) * 100 - index).filter((n) => n >= 1);
  return numbers.map((n) => ({
    sha: commitSha(n),
    commit: {
      message:
        n === culpritCommit ? 'feat(scripts): Drain the queue in batches (#4321)\n\nBody.' : `chore: Commit ${n}`,
    },
    author: { login: n === culpritCommit ? 'queue-author' : 'someone' },
  }));
};

/** The repository as the seeded history sees it: CI runs per push, `main`'s commits and the issues. */
const repository = (comments: string[] = []) =>
  fakeGitHub((method, path) => {
    if (method === 'GET' && /^\/repos\/taucad\/tau\/actions\/runs\/\d+$/u.test(path)) {
      const id = Number(path.split('/').at(-1));
      return { id, head_sha: commitSha(id), created_at: runAt(id), updated_at: runAt(id), html_url: '' };
    }
    if (method === 'GET' && path.startsWith('/repos/taucad/tau/actions/workflows/ci.yml/runs?branch=main&event=push')) {
      const before = decodeURIComponent(path.split('created=')[1] ?? '').slice(1);
      const runs = Array.from({ length: 340 }, (_, index) => 340 - index)
        .filter((n) => runAt(n) < before)
        .slice(0, 20);
      return { workflow_runs: runs.map((n) => ({ id: n, head_sha: commitSha(n) })) };
    }
    if (method === 'GET' && path.includes('/commits?sha=')) {
      return commitsPage(path);
    }
    if (method === 'GET' && path.startsWith('/repos/taucad/tau/issues?state=open&labels=flake')) {
      return [];
    }
    if (method === 'POST' && path === '/repos/taucad/tau/issues') {
      return { number: 77 };
    }
    if (method === 'GET' && path.startsWith('/repos/taucad/tau/issues/77/comments')) {
      return comments.map((body) => ({ body }));
    }
    if (method === 'POST' && path === '/repos/taucad/tau/issues/77/comments') {
      return {};
    }
    return undefined;
  });

/** The `body` field of a request body. */
const bodyOf = (call: Call | undefined): string => (call?.body as { body?: string } | undefined)?.body ?? '';

let directory: string | undefined;
afterEach(() => {
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

/** The seeded ledger written to a state file, as `--state-file` reads it. */
const seededStore = () => {
  directory = mkdtempSync(join(tmpdir(), 'flake-regression-'));
  const path = join(directory, 'ledger.json');
  writeFileSync(path, serializeState(seededLedger()));
  return fileStore(path);
};

const invoke = async (options: Partial<InvocationOptions>, setup: { comments?: string[]; stub?: StubOptions } = {}) => {
  const { github, calls } = repository(setup.comments);
  const stub = stubProber(setup.stub ?? { culprit: culpritCommit, rates: { 'cpu:stress': 0.3, 'repeat:alone': 0.05 } });
  const identities: ReproIdentity[] = [];
  const result = await runInvocation(
    { modes: 'repeat,cpu,parallel', dryRun: false, ...options },
    {
      github,
      store: seededStore(),
      roots: new Map([['scripts', 'scripts']]),
      prober: (identity) => {
        identities.push(identity);
        return stub.prober;
      },
      now: () => new Date('2026-11-20T00:00:00.000Z'),
      log: () => undefined,
    },
  );
  return { result, calls, requests: stub.requests, identities };
};

describe('flake regression invocation', () => {
  it('should attribute the seeded regression in the ledger history to its commit and name it on the issue', async () => {
    const { result, calls, requests, identities } = await invoke({});

    expect(result.candidates.map((candidate) => candidate.id)).toEqual([regressedId]);
    expect(result.bisected?.result).toMatchObject({
      outcome: 'culprit',
      culprit: commitSha(culpritCommit),
      mode: 'cpu:stress',
    });
    expect(identities).toEqual([
      {
        project: 'scripts',
        target: 'test',
        file: 'scripts/src/victim.test.ts',
        test: 'victim should settle the queue',
      },
    ]);
    // First flaky: the onset run's commit; last stable: the push before it, which already flakes, so the bisect backs off.
    expect(requests[0]?.sha).toBe(commitSha(323));
    expect(requests[1]?.sha).toBe(commitSha(322));

    const sends = calls.filter((call) => call.method !== 'GET');
    expect(sends.map((call) => call.path)).toEqual([
      '/repos/taucad/tau/issues',
      '/repos/taucad/tau/issues/77/comments',
      '/repos/taucad/tau/issues/77/comments',
    ]);
    expect(sends[0]?.body).toMatchObject({ title: `Flaky regression: ${regressedId}`, labels: [...issueLabels] });
    expect(bodyOf(sends[0])).toContain(identityMarker(regressedId));
    expect(bodyOf(sends[1])).toContain(bisectMarker(323, 'started', '2026-11-20T00:00:00.000Z'));
    const named = bodyOf(sends[2]);
    expect(named).toContain(bisectMarker(323, 'done', '2026-11-20T00:00:00.000Z'));
    expect(named).toContain(`culprit [${commitSha(culpritCommit).slice(0, 12)}]`);
    expect(named).toContain('`feat(scripts): Drain the queue in batches (#4321)` (#4321) by `queue-author`');
    expect(result.markdown).toContain(`culprit ${commitSha(culpritCommit)}`);
  });

  it('should not bisect an onset again once its bisect is done or still running', async () => {
    for (const status of ['done', 'started'] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one invocation per status
      const { result, calls, requests } = await invoke(
        {},
        { comments: [bisectMarker(323, status, '2026-11-19T22:00:00.000Z')] },
      );
      expect(result.bisected).toBeUndefined();
      expect(requests).toEqual([]);
      expect(calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
        '/repos/taucad/tau/issues',
      ]);
      expect(result.markdown).toContain('No candidate waits for a bisect.');
    }
  });

  it('should flag an existing issue of the identity instead of opening one', async () => {
    const { github, calls } = fakeGitHub((method, path) => {
      if (path.startsWith('/repos/taucad/tau/issues?state=open&labels=flake')) {
        return [
          { number: 5, pull_request: {}, body: identityMarker(regressedId) },
          { number: 12, body: `${identityMarker(regressedId)}\nQuarantine issue` },
        ];
      }
      if (method === 'POST' && path === '/repos/taucad/tau/issues/12/labels') {
        return [];
      }
      if (path.startsWith('/repos/taucad/tau/issues/12/comments')) {
        return [{ body: bisectMarker(323, 'done', '2026-11-19T00:00:00.000Z') }];
      }
      return undefined;
    });
    const result = await runInvocation(
      { modes: 'repeat', dryRun: false },
      {
        github,
        store: seededStore(),
        roots: new Map(),
        prober: () => stubProber({ culprit: 1, rates: {} }).prober,
        now: () => new Date('2026-11-20T00:00:00.000Z'),
        log: () => undefined,
      },
    );
    expect(result.issues.get(regressedId)).toBe(12);
    expect(calls.filter((call) => call.method === 'POST')).toEqual([
      { method: 'POST', path: '/repos/taucad/tau/issues/12/labels', body: { labels: [...issueLabels] } },
    ]);
  });

  it('should only report on a dry run', async () => {
    const { result, calls, requests } = await invoke({ dryRun: true });
    expect(result.candidates).toHaveLength(1);
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
    expect(result.markdown).toContain('Dry run');
    expect(result.markdown).toContain('322 stable executions');
  });

  it('should bisect an identity the operator names, between the commits the operator gives', async () => {
    const { result, requests } = await invoke(
      { id: ordinaryId, good: commitSha(200), bad: commitSha(300) },
      { stub: { culprit: 250, rates: { 'repeat:alone': 0.5 } } },
    );
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([ordinaryId]);
    expect(result.bisected?.result).toMatchObject({ outcome: 'culprit', culprit: commitSha(250) });
    expect(requests[0]?.sha).toBe(commitSha(300));
    expect(requests[1]?.sha).toBe(commitSha(200));
    await expect(invoke({ id: 'scripts › src/none.test.ts > none' })).rejects.toThrow('no identity');
  });

  it('should report a test it cannot dispatch, and an empty ledger, without probing', async () => {
    const { github } = repository();
    const result = await runInvocation(
      { modes: 'repeat', dryRun: false },
      {
        github,
        store: seededStore(),
        roots: new Map(),
        prober: () => {
          throw new Error('no probe expected');
        },
        now: () => new Date('2026-11-20T00:00:00.000Z'),
        log: () => undefined,
      },
    );
    expect(result.bisected?.result).toMatchObject({ outcome: 'inconclusive', probes: [] });
    const empty = await runInvocation(
      { modes: 'repeat', dryRun: false },
      {
        github,
        store: { read: async () => undefined, write: async () => '' },
        roots: new Map(),
        prober: () => stubProber({ culprit: 1, rates: {} }).prober,
        now: () => new Date(),
      },
    );
    expect(empty.markdown).toContain('No ledger state yet.');
  });
});

describe('the flake-repro prober', () => {
  const identity: ReproIdentity = { project: 'scripts', target: 'test', file: 'scripts/src/a.test.ts', test: 'a b' };
  const report = {
    rows: [
      { mode: 'repeat', variant: 'alone', outcomes: { passed: 18, failed: 2, missing: 0 } },
      { mode: 'cpu', variant: 'pinned', outcomes: {}, unavailable: 'no taskset' },
      { mode: 7, variant: 'bad' },
    ],
  };

  const deps = (runs: Array<Record<string, unknown>>, options: { refused?: boolean; artifact?: boolean } = {}) => {
    const dispatched: Array<Record<string, string>> = [];
    let polls = 0;
    const { github, calls } = fakeGitHub((method, path) => {
      if (/\/actions\/runs\/\d+$/u.test(path)) {
        const run = runs[Math.min(polls, runs.length - 1)];
        polls += 1;
        return run;
      }
      if (path.endsWith('/jobs')) {
        return { jobs: [{ steps: [{ name: 'Admit the run', conclusion: options.refused ? 'failure' : 'success' }] }] };
      }
      if (path.includes('/artifacts?')) {
        return { artifacts: options.artifact === false ? [] : [{ id: 3, name: 'flake-repro-41' }] };
      }
      if (path.endsWith('/artifacts/3/zip')) {
        return new Uint8Array([1]);
      }
      if (path.includes('/actions/workflows/flake-repro.yml/runs?')) {
        return { workflow_runs: [{ id: 41, display_title: `Flake repro scripts:test repeat @ ${commitSha(9)}` }] };
      }
      return undefined;
    });
    const sleeps: number[] = [];
    const value: ReproDeps = {
      github,
      identity,
      dispatch: async (inputs) => {
        dispatched.push(inputs);
        return dispatched.length === 1 ? undefined : 41;
      },
      readReport: async () => report,
      sleep: async (minutes) => {
        sleeps.push(minutes);
      },
      now: () => new Date('2026-11-20T00:00:00.000Z'),
    };
    return { value, dispatched, sleeps, calls };
  };
  const run = (status: string, conclusion: string | undefined) => ({
    id: 41,
    status,
    conclusion,
    created_at: '2026-11-20T00:00:00.000Z',
    run_started_at: '2026-11-20T00:01:00.000Z',
    updated_at: '2026-11-20T00:31:00.000Z',
    html_url: '',
  });

  it('should dispatch flake-repro.yml at the commit, wait for the run and read its report', async () => {
    const { value, dispatched, sleeps } = deps([run('in_progress', undefined), run('completed', 'success')]);
    const result = await reproProber(value)({ sha: commitSha(9), modes: 'repeat,cpu', attempts: 30, minutes: 120 });
    expect(dispatched).toEqual([
      {
        ref: commitSha(9),
        project: 'scripts',
        target: 'test',
        file: 'scripts/src/a.test.ts',
        test: 'a b',
        modes: 'repeat,cpu',
        attempts: '30',
        seed: '1',
        minutes: '120',
      },
    ]);
    expect(result).toEqual({
      sha: commitSha(9),
      minutes: 30,
      run: { id: 41, url: 'https://github.com/taucad/tau/actions/runs/41' },
      rows: [
        { key: 'repeat:alone', outcomes: { passed: 18, failed: 2, missing: 0 } },
        { key: 'cpu:pinned', outcomes: {}, unavailable: 'no taskset' },
      ],
    });
    expect(sleeps).toContain(1);
  });

  it('should wait for a slot and dispatch again when the gate refuses, within a bound', async () => {
    const refused = deps([run('completed', 'failure')], { refused: true });
    const result = await reproProber(refused.value)({ sha: commitSha(9), modes: 'repeat', attempts: 30, minutes: 60 });
    expect(refused.dispatched).toHaveLength(7);
    expect(result.error).toBe('the repro gate refused 7 dispatches');
    expect(result.rows).toEqual([]);
  });

  it('should report a run without a report, or one that never finished, as no verdict', async () => {
    const missing = deps([run('completed', 'failure')], { artifact: false });
    expect(
      await reproProber(missing.value)({ sha: commitSha(9), modes: 'repeat', attempts: 30, minutes: 60 }),
    ).toMatchObject({
      rows: [],
      error: 'no report (failure)',
    });
    const stuck = deps([run('queued', undefined)]);
    let clock = Date.parse('2026-11-20T00:00:00.000Z');
    stuck.value = {
      ...stuck.value,
      now: () => {
        clock += 3_600_000;
        return new Date(clock);
      },
    };
    expect(
      await reproProber(stuck.value)({ sha: commitSha(9), modes: 'repeat', attempts: 30, minutes: 60 }),
    ).toMatchObject({
      rows: [],
      error: 'the run did not finish in time',
    });
  });

  it('should read only well-formed rows of a report', () => {
    expect(reportRows(undefined)).toEqual([]);
    expect(reportRows({ rows: 'no' })).toEqual([]);
    expect(
      reportRows({ rows: [{ mode: 'repeat', variant: 'alone', outcomes: { passed: 2, failed: -1, error: 1.5 } }] }),
    ).toEqual([{ key: 'repeat:alone', outcomes: { passed: 2 } }]);
  });
});

describe('flake regression CLI', () => {
  it('should refuse a malformed commit or a missing token with exit code 2', () => {
    const cli = resolve(import.meta.dirname, 'flake-regression-cli.ts');
    const environment = { ...process.env, GITHUB_TOKEN: 'x' };
    const malformed = spawnSync(process.execPath, [cli, '--good', 'main'], { encoding: 'utf8', env: environment });
    expect(malformed.status).toBe(2);
    expect(malformed.stderr).toContain('Usage:');
    const { GITHUB_TOKEN: _token, ...withoutToken } = process.env;
    const tokenless = spawnSync(process.execPath, [cli], { encoding: 'utf8', env: withoutToken });
    expect(tokenless.status).toBe(2);
  });
});
