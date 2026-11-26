/* eslint-disable @typescript-eslint/naming-convention -- Runs and requests are GitHub REST JSON. */
import { describe, expect, it } from 'vitest';

import type { QuarantineEntry } from '@taucad/vitest-ci/quarantine';

import { emptyState, ingestRun, serializeState, parseState } from '#ci-flake-ledger-state.js';
import type { IngestRun, LedgerState, OutcomeRow } from '#ci-flake-ledger-state.js';
import type { Workspace } from '#ci-flake-quarantine-entry-cli.js';
import {
  applyRemovals,
  closeReleased,
  ensureOwnerNotes,
  readLinkedFixes,
  readPendingRemovals,
  reconcileRemovals,
} from '#ci-flake-quarantine-release-cli.js';
import {
  countQuarantineRun,
  isRecentRelease,
  lastLanded,
  lastRemoval,
  linkedFix,
  planRemovals,
  quarantinedTests,
  releaseComment,
  releaseVerdict,
  removalFiles,
  removalMarker,
  removeFromQuarantine,
  retainQuarantineTracks,
} from '#ci-flake-quarantine-release.js';
import type {
  LinkedFix,
  PendingRemoval,
  PlannedRemoval,
  QuarantinedTest,
  RemovalPlan,
} from '#ci-flake-quarantine-release.js';
import { GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';

const hour = 60 * 60 * 1000;
const path = 'packages/host/quarantine.json';
const testName = 'src/store.test.ts > store > should keep the order';
const id = `host › ${testName}`;

const workspaceOf = (entries: readonly unknown[], extra: Partial<Workspace> = {}): Workspace => ({
  projects: new Map([
    ['host', { name: 'host', root: 'packages/host', tags: [] }],
    ['api', { name: 'api', root: 'apps/api', tags: [] }],
  ]),
  quarantines: [{ path, text: `${JSON.stringify({ entries }, undefined, 2)}\n` }],
  ...extra,
});

const entryOf = (overrides: Partial<QuarantineEntry> = {}): QuarantineEntry => ({
  test: testName,
  owner: 'rifont',
  issue: 12,
  class: 'race',
  created: '2026-11-20',
  expires: '2026-12-04',
  evidence: '2 flake events (retry 2) in its last 40 executions; runs 1, 2',
  ...overrides,
});

const runOf = (runId: number, at: string): IngestRun => ({
  id: runId,
  event: 'merge_group',
  head_branch: `gh-readonly-queue/main/pr-${runId}-base`,
  head_sha: `sha-${runId}`,
  status: 'completed',
  conclusion: 'success',
  created_at: at,
  updated_at: at,
  html_url: `https://github.com/taucad/tau/actions/runs/${runId}`,
  run_attempt: 1,
});

const rowOf = (runId: number, overrides: Partial<OutcomeRow> = {}): OutcomeRow => ({
  kind: 'test',
  id,
  project: 'host',
  target: 'test',
  targetKey: 'test',
  file: 'src/store.test.ts',
  variant: { os: 'linux', arch: 'x64' },
  state: 'passed',
  retryCount: 0,
  flaky: false,
  durationMs: 12,
  errors: [],
  hash: `hash-${runId}`,
  run: runId,
  attempt: 1,
  job: 'affected-test-1',
  ...overrides,
});

/**
 * A history of `count` queue runs, one every `everyHours` from `from`, each with the rows `rows` gives it, counted as
 * the ingestion counts them: the quarantine tracks first, then the ledger, which records the run as ingested.
 */
const history = (
  state: LedgerState,
  tests: readonly QuarantinedTest[],
  options: {
    count: number;
    from: string;
    everyHours?: number;
    firstRun?: number;
    rows?: (runId: number, index: number) => OutcomeRow[];
    shadowTargets?: ReadonlySet<string>;
  },
): void => {
  const first = options.firstRun ?? 1000;
  for (let index = 0; index < options.count; index += 1) {
    const runId = first + index;
    const at = new Date(Date.parse(options.from) + index * (options.everyHours ?? 0.5) * hour).toISOString();
    const run = runOf(runId, at);
    const rows = options.rows?.(runId, index) ?? [rowOf(runId)];
    countQuarantineRun(state, { run, rows, tests, shadowTargets: options.shadowTargets });
    ingestRun(state, { run, rows, artifacts: 1, rejected: 0 });
  }
};

const testsOf = (entries: readonly QuarantineEntry[], today = '2026-11-22'): QuarantinedTest[] =>
  quarantinedTests(workspaceOf(entries), today);

/** A fix merged a day after the entry was made. */
const fix: LinkedFix = { pull: 4242, mergedAt: '2026-11-21T00:00:00Z' };

const planOf = (
  state: LedgerState,
  tests: readonly QuarantinedTest[],
  options: { fix?: LinkedFix; today?: string; pending?: PendingRemoval[] } = {},
): RemovalPlan =>
  planRemovals({
    tests,
    tracks: state.quarantineTracks ?? {},
    fixes: new Map(tests.map((test) => [test.key, options.fix])),
    pending: options.pending ?? [],
    today: options.today ?? '2026-11-24',
  });

describe('the fixture histories (FQ-9 acceptance)', () => {
  it('should release a test at 100 straight gating passes after a linked fix', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    // 100 runs, one every 30 minutes from an hour after the fix merged: 49.5 hours.
    history(state, tests, { count: 100, from: '2026-11-21T01:00:00Z' });

    const plan = planOf(state, tests, { fix });

    expect(plan.releases.map((removal) => removal.key)).toEqual([tests[0]?.key]);
    expect(plan.releases[0]?.verdict).toMatchObject({ met: true, kind: 'fix', passes: 100, bar: 100 });
  });

  it('should not release the same 100 straight passes without a fix, and release at 300', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 100, from: '2026-11-21T01:00:00Z' });

    const atHundred = planOf(state, tests);
    expect(atHundred.releases).toEqual([]);
    expect(atHundred.waiting[0]?.verdict).toMatchObject({ met: false, kind: 'no-fix', passes: 100, bar: 300 });

    history(state, tests, { count: 200, from: '2026-11-23T02:00:00Z', firstRun: 2000 });
    const atThreeHundred = planOf(state, tests, { today: '2026-11-27' });
    expect(atThreeHundred.releases[0]?.verdict).toMatchObject({ met: true, kind: 'no-fix', passes: 300 });
  });

  it('should remove an unreleased entry at day 14, and not at day 13', () => {
    const tests = testsOf([entryOf()], '2026-12-03');
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 40, from: '2026-11-21T01:00:00Z' });

    expect(planOf(state, tests, { today: '2026-12-03' }).expiries).toEqual([]);
    const dayFourteen = planOf(state, testsOf([entryOf()], '2026-12-04'), { today: '2026-12-04' });
    expect(dayFourteen.expiries.map((removal) => removal.entry.expires)).toEqual(['2026-12-04']);
    expect(dayFourteen.releases).toEqual([]);
  });
});

describe('counting the release bar', () => {
  it('should count only the passes of runs created after the fix merged', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 60, from: '2026-11-20T00:30:00Z', everyHours: 0.25 });
    history(state, tests, { count: 99, from: '2026-11-21T01:00:00Z', firstRun: 2000 });

    expect(planOf(state, tests, { fix }).releases).toEqual([]);
    expect(releaseVerdict(state.quarantineTracks?.[tests[0]?.key ?? ''], fix)).toMatchObject({ passes: 99 });

    history(state, tests, { count: 1, from: '2026-11-23T03:00:00Z', firstRun: 3000 });
    expect(planOf(state, tests, { fix }).releases).toHaveLength(1);
  });

  it('should not release 100 passes that span less than two days', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 100, from: '2026-11-21T01:00:00Z', everyHours: 0.25 });

    expect(planOf(state, tests, { fix }).waiting[0]?.verdict).toMatchObject({ met: false, passes: 100 });
  });

  it('should start the count again at a failure and at a pass on the recorded retry', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, {
      count: 120,
      from: '2026-11-21T01:00:00Z',
      rows: (runId, index) =>
        index === 30
          ? [rowOf(runId, { state: 'failed', errors: ['timed out'] })]
          : index === 50
            ? [rowOf(runId, { flaky: true, retryCount: 1 })]
            : [rowOf(runId)],
    });

    const track = state.quarantineTracks?.[tests[0]?.key ?? ''];
    expect(track).toMatchObject({ executions: 120, failures: 2, streak: 69, lastFailure: { run: 1050 } });
    expect(planOf(state, tests, { fix }).releases).toEqual([]);
  });

  it('should exclude shadow rows, marked or registered, and rows a cache replay restored', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, {
      count: 10,
      from: '2026-11-21T01:00:00Z',
      shadowTargets: new Set(['host:test:e2e:journey']),
      rows: (runId) => [
        rowOf(runId, { shadow: true, state: 'failed', job: 'shadow' }),
        rowOf(runId, { targetKey: 'test:e2e:journey', target: 'test:e2e:journey', state: 'failed' }),
        rowOf(runId, { run: runId - 500, state: 'failed' }),
        rowOf(runId),
      ],
    });

    expect(state.quarantineTracks?.[tests[0]?.key ?? '']).toMatchObject({ executions: 10, failures: 0, streak: 10 });
  });

  it('should count only the variant an entry is narrowed to', () => {
    const tests = testsOf([entryOf({ variant: { browser: 'firefox' } })]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, {
      count: 5,
      from: '2026-11-21T01:00:00Z',
      rows: (runId) => [
        rowOf(runId, { variant: { os: 'linux', arch: 'x64', browser: 'chromium' }, state: 'failed' }),
        rowOf(runId, { variant: { os: 'linux', arch: 'x64', browser: 'firefox' } }),
      ],
    });

    expect(state.quarantineTracks?.[tests[0]?.key ?? '']).toMatchObject({ executions: 5, failures: 0, streak: 5 });
  });

  it('should keep the tracks in the serialized state and drop the track of an entry that left main', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 3, from: '2026-11-21T01:00:00Z' });

    expect(parseState(serializeState(state)).quarantineTracks).toEqual(state.quarantineTracks);
    expect(retainQuarantineTracks(state, [])).toEqual([tests[0]?.key]);
    expect(state.quarantineTracks).toEqual({});
  });

  it('should take the newest fix merged on or after the entry was made', () => {
    const entry = entryOf();
    const fixes: LinkedFix[] = [
      { pull: 1, mergedAt: '2026-11-19T10:00:00Z' },
      { pull: 3, mergedAt: '2026-11-22T10:00:00Z' },
      { pull: 2, mergedAt: '2026-11-21T10:00:00Z' },
    ];

    expect(linkedFix(fixes, entry)).toEqual({ pull: 3, mergedAt: '2026-11-22T10:00:00Z' });
    expect(linkedFix(fixes.slice(0, 1), entry)).toBeUndefined();
  });
});

describe('the count in run order', () => {
  it('should not let a late pass from before the newest failure join the count after it', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, {
      count: 99,
      from: '2026-11-21T01:00:00Z',
      rows: (runId, index) => [rowOf(runId, index === 0 ? { state: 'failed' } : {})],
    });
    // A run created before that failure completes late: its pass does not count.
    history(state, tests, { count: 1, from: '2026-11-21T00:30:00Z', firstRun: 5000 });

    expect(state.quarantineTracks?.[tests[0]?.key ?? '']?.streak).toBe(98);
  });

  it('should end the count at a late failure where it ran, keeping the passes after it', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 10, from: '2026-11-21T01:00:00Z' });
    // A failure in a run created between the 4th and the 5th pass, ingested late.
    history(state, tests, {
      count: 1,
      from: '2026-11-21T02:45:00Z',
      firstRun: 5000,
      rows: (runId) => [rowOf(runId, { state: 'failed' })],
    });

    expect(state.quarantineTracks?.[tests[0]?.key ?? '']).toMatchObject({ streak: 6, failures: 1 });
  });

  it('should keep where a long count started when its oldest runs are trimmed', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 1, from: '2026-11-21T01:00:00Z' });
    history(state, tests, { count: 300, from: '2026-11-23T02:00:00Z', everyHours: 0.01, firstRun: 2000 });

    const track = state.quarantineTracks?.[tests[0]?.key ?? ''];
    expect(track).toMatchObject({ streak: 301, trimmed: { passes: 1, from: '2026-11-21T01:00:00.000Z' } });
    expect(track?.streakRuns).toHaveLength(300);
    expect(releaseVerdict(track)).toMatchObject({ met: true, kind: 'no-fix', passes: 301 });
  });

  it('should count no run created at the instant the fix merged, nor before the entry was made', () => {
    const tests = testsOf([entryOf()]);
    const state = emptyState(new Date('2026-11-19T00:00:00Z'));
    history(state, tests, { count: 5, from: '2026-11-19T20:00:00Z', firstRun: 500 });
    history(state, tests, { count: 100, from: '2026-11-21T00:00:00Z' });

    const track = state.quarantineTracks?.[tests[0]?.key ?? ''];
    expect(track?.executions).toBe(100);
    expect(releaseVerdict(track, fix)).toMatchObject({ passes: 99, met: false });
  });

  it('should give an entry that replaces another for the same test a track of its own', () => {
    const [first] = testsOf([entryOf()]);
    const [replacement] = testsOf([entryOf({ issue: 99, created: '2026-11-21', expires: '2026-12-05' })]);
    const [renewed] = testsOf([entryOf({ expires: '2026-12-10', renewal: { by: 'rifont', on: '2026-11-21' } })]);

    expect(replacement?.key).not.toBe(first?.key);
    expect(renewed?.key).toBe(first?.key);
  });
});

describe('expiry and renewal', () => {
  it('should hold a renewed entry to its renewed expiry: past day 14, removed at day 28', () => {
    const renewed = entryOf({ expires: '2026-12-18', renewal: { by: 'rifont', on: '2026-12-02' } });
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));

    expect(planOf(state, testsOf([renewed], '2026-12-04'), { today: '2026-12-04' }).expiries).toEqual([]);
    expect(planOf(state, testsOf([renewed], '2026-12-18'), { today: '2026-12-18' }).expiries).toHaveLength(1);
  });

  it('should still remove an entry past its expiry, and leave an entry that breaks another rule alone', () => {
    const tests = quarantinedTests(
      workspaceOf([
        entryOf({ expires: '2026-12-01' }),
        entryOf({ test: 'src/billing/charge.test.ts > charge > should settle once', issue: 13 }),
      ]),
      '2026-12-05',
    );

    expect(tests.map((test) => test.entry.issue)).toEqual([12]);
    expect(planOf(emptyState(new Date()), tests, { today: '2026-12-05' }).expiries).toHaveLength(1);
  });

  it('should release rather than expire a test that meets the bar on its expiry day', () => {
    const tests = testsOf([entryOf({ expires: '2026-11-24' })], '2026-11-24');
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 100, from: '2026-11-21T01:00:00Z' });

    const plan = planOf(state, tests, { fix, today: '2026-11-24' });
    expect(plan.releases).toHaveLength(1);
    expect(plan.expiries).toEqual([]);
  });
});

describe('pending removals', () => {
  const tests = testsOf([entryOf()]);
  const removed = [{ path, entry: structuredClone(entryOf()) as unknown }];

  it('should hold an entry an expiry branch removes while it is on main unchanged', () => {
    const plan = planOf(emptyState(new Date()), tests, {
      today: '2026-12-04',
      pending: [{ branch: 'flake-expiry/2026-12-04-abcd1234', kind: 'expiry', removed }],
    });

    expect(plan.held.map((held) => held.branch)).toEqual(['flake-expiry/2026-12-04-abcd1234']);
    expect(plan.expiries).toEqual([]);
  });

  it('should call an expiry stale once the operator renews the entry on main', () => {
    const renewed = testsOf(
      [entryOf({ expires: '2026-12-18', renewal: { by: 'rifont', on: '2026-12-03' } })],
      '2026-12-04',
    );
    const plan = planOf(emptyState(new Date()), renewed, {
      today: '2026-12-04',
      pending: [{ branch: 'flake-expiry/2026-12-04-abcd1234', kind: 'expiry', pull: 77, removed }],
    });

    expect(plan.stale).toMatchObject([{ pull: 77, reason: 'an entry it removes is no longer on main as it was' }]);
    expect(plan.waiting).toHaveLength(1);
  });

  it('should call a release stale when the test no longer meets the bar', () => {
    const plan = planOf(emptyState(new Date()), tests, {
      pending: [{ branch: 'flake-release/2026-11-23-abcd1234', kind: 'release', removed }],
    });

    expect(plan.stale).toMatchObject([{ reason: 'a test it releases no longer meets the bar' }]);
  });

  it('should call an expiry stale once the test it expires meets the release bar', () => {
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 100, from: '2026-11-21T01:00:00Z' });

    const plan = planOf(state, tests, {
      fix,
      pending: [{ branch: 'flake-expiry/2026-11-24-abcd1234', kind: 'expiry', pull: 5, removed }],
    });

    expect(plan.stale).toMatchObject([{ pull: 5, reason: 'a test it expires now meets the release bar' }]);
    expect(plan.releases).toHaveLength(1);
  });

  it('should release nothing from a partial count, and leave a pending release as it is', () => {
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 100, from: '2026-11-21T01:00:00Z' });
    const pending: PendingRemoval = { branch: 'flake-release/2026-11-24-abcd1234', kind: 'release', removed };

    const partial = planRemovals({
      tests,
      tracks: state.quarantineTracks ?? {},
      fixes: new Map(tests.map((test) => [test.key, fix])),
      pending: [],
      today: '2026-12-04',
      releases: false,
    });
    expect(partial.releases).toEqual([]);
    expect(partial.expiries).toHaveLength(1);

    const held = planRemovals({
      tests,
      tracks: {},
      fixes: new Map(),
      pending: [pending],
      today: '2026-11-24',
      releases: false,
    });
    expect(held.stale).toEqual([]);
    expect(held.held).toHaveLength(1);
  });

  it('should list the entries a branch removes against the file it was built on', () => {
    const before = JSON.stringify({ entries: [entryOf(), entryOf({ issue: 14, test: 'src/a.test.ts > a > b' })] });
    const after = removeFromQuarantine(before, [entryOf()]);

    expect(JSON.parse(after)).toEqual({ entries: [entryOf({ issue: 14, test: 'src/a.test.ts > a > b' })] });
    expect(after.endsWith('\n')).toBe(true);
  });
});

describe('the release record', () => {
  it('should round-trip through the marker and keep the newest removal', () => {
    const record = { identity: 'abcd', path, created: '2026-11-20', expires: '2026-12-04' };
    const texts = [
      removalMarker('expiry', record),
      `text\n${removalMarker('release', { ...record, expires: '2026-12-18' })}`,
    ];

    expect(lastRemoval(texts)).toEqual({ kind: 'release', record: { ...record, expires: '2026-12-18' } });
    expect(lastRemoval(['<!-- flake-release: {not json} -->'])).toBeUndefined();
    expect(removalMarker('release', { ...record, path: 'a-->b' })).not.toContain('a-->b');
  });

  it('should count a release as recent for 30 days', () => {
    expect(isRecentRelease('2026-11-01', '2026-12-01')).toBe(true);
    expect(isRecentRelease('2026-10-31', '2026-12-01')).toBe(false);
  });
});

type Request = { readonly method: string; readonly path: string; readonly body?: unknown };

/**
 * A GitHub client answering from `routes` (the first route whose key the path contains; a function is called with the
 * path), recording each request. An issue and its comments default to no labels and no comments.
 */
const fakeGitHub = (
  routes: Record<string, unknown> = {},
  options: { refusePullRequests?: boolean; texts?: Record<string, string> } = {},
) => {
  const requests: Request[] = [];
  const github: Client = {
    repository: 'taucad/tau',
    budget: () => 1000,
    async get<T>(requested: string): Promise<T> {
      requests.push({ method: 'GET', path: requested });
      const key = Object.keys(routes).find((candidate) => requested.includes(candidate));
      if (key === undefined) {
        if (requested.includes('/git/ref/heads/')) {
          throw new GitHubError(`GET ${requested}`, 404);
        }
        if (/\/issues\/\d+\/comments\?/u.test(requested)) {
          return [] as T;
        }
        if (/\/issues\/\d+$/u.test(requested)) {
          const issue: unknown = { number: Number(requested.split('/').at(-1)), state: 'open', labels: [] };
          return issue as T;
        }
        throw new Error(`unexpected GET ${requested}`);
      }
      const route = routes[key];
      return (typeof route === 'function' ? (route as (path: string) => unknown)(requested) : route) as T;
    },
    async getText(requested: string): Promise<string> {
      requests.push({ method: 'GET', path: requested });
      const key = Object.keys(options.texts ?? {}).find((candidate) => requested.includes(candidate));
      if (key === undefined) {
        throw new Error(`unexpected getText ${requested}`);
      }
      return options.texts?.[key] ?? '';
    },
    async getBytes(): Promise<Uint8Array<ArrayBuffer>> {
      throw new Error('unexpected getBytes');
    },
    async send<T>(method: 'POST' | 'PATCH' | 'PUT', requested: string, body: unknown): Promise<T> {
      requests.push({ method, path: requested, body });
      if (requested.endsWith('/pulls') && options.refusePullRequests) {
        throw new GitHubError(`${method} ${requested}`, 403, 'GitHub Actions is not permitted to create pull requests');
      }
      const answer: unknown = requested.endsWith('/pulls')
        ? { number: 9001, node_id: 'PR_node' }
        : { sha: 'sha-new', data: {} };
      return answer as T;
    },
  };
  return { github, requests };
};

const plannedOf = (tests: readonly QuarantinedTest[], state: LedgerState): readonly PlannedRemoval[] =>
  planOf(state, tests, { fix }).releases;

describe('the release job', () => {
  it('should push the removal, name the branch on the owner issue and label it releasing', async () => {
    const tests = testsOf([entryOf(), entryOf({ test: 'src/a.test.ts > a > keeps', issue: 14 })]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests.slice(0, 1), { count: 100, from: '2026-11-21T01:00:00Z' });
    const releases = plannedOf(tests, state);
    const { github, requests } = fakeGitHub(
      { '/git/commits/': { tree: { sha: 'base-tree' } } },
      { refusePullRequests: true },
    );

    const outcome = await applyRemovals(github, {
      kind: 'release',
      removals: releases,
      base: 'main',
      baseSha: 'base-sha',
      quarantines: workspaceOf(tests.map((test) => test.entry)).quarantines,
      problems: [],
      today: '2026-11-24',
    });

    const tree = requests.find((request) => request.path.endsWith('/git/trees'))?.body as {
      tree: Array<{ path: string; content: string }>;
    };
    expect(tree.tree.map((file) => file.path)).toEqual([path]);
    expect((JSON.parse(tree.tree[0]?.content ?? '{}') as { entries: QuarantineEntry[] }).entries).toEqual([
      tests[1]?.entry,
    ]);
    const ref = requests.find((request) => request.path.endsWith('/git/refs'))?.body as { ref: string };
    expect(ref.ref).toMatch(/^refs\/heads\/flake-release\/2026-11-24-[\da-f]{8}$/u);
    const note = requests.find((request) => request.path.endsWith('/issues/12/comments'))?.body as { body: string };
    expect(note.body).toContain('https://github.com/taucad/tau/compare/main...flake-release/2026-11-24-');
    expect(note.body).toContain('100 of 100 consecutive gating passes after fix #4242');
    expect(lastRemoval([note.body])).toMatchObject({ kind: 'release', record: { created: '2026-11-20' } });
    expect(requests.find((request) => request.path.endsWith('/issues/12/labels'))?.body).toEqual({
      labels: ['flake:releasing'],
    });
    expect(outcome.some((line) => line.startsWith('Could not open the pull request'))).toBe(true);
  });

  it('should open the expiry pull request with auto-merge and hand the issue to the operator', async () => {
    const tests = testsOf([entryOf()], '2026-12-04');
    const { expiries } = planOf(emptyState(new Date()), tests, { today: '2026-12-04' });
    const { github, requests } = fakeGitHub({ '/git/commits/': { tree: { sha: 'base-tree' } } });

    await applyRemovals(github, {
      kind: 'expiry',
      removals: expiries,
      base: 'main',
      baseSha: 'base-sha',
      quarantines: workspaceOf([entryOf()]).quarantines,
      problems: [],
      today: '2026-12-04',
    });

    const pull = requests.find((request) => request.path.endsWith('/pulls'))?.body as { title: string; head: string };
    expect(pull.title).toBe('test(host): Expire 1 quarantined test');
    expect(pull.head).toMatch(/^flake-expiry\//u);
    expect(requests.some((request) => request.path === '/graphql')).toBe(true);
    const note = requests.find((request) => request.path.endsWith('/issues/12/comments'))?.body as { body: string };
    expect(note.body).toContain('The removal is #9001 (squash auto-merge on).');
    expect(note.body).toContain('may renew it once');
    expect(requests.find((request) => request.path.endsWith('/issues/12/labels'))?.body).toEqual({
      labels: ['flake:needs-operator'],
    });
  });

  it('should find the fixes from a flake/<issue> branch and from merged pull requests labelled flake', async () => {
    const { github } = fakeGitHub({
      '/pulls?': [
        { number: 50, state: 'closed', merged_at: '2026-11-21T00:00:00Z' },
        { number: 51, state: 'closed', merged_at: null },
      ],
      '/timeline': [
        {
          event: 'cross-referenced',
          source: {
            issue: { number: 60, pull_request: { merged_at: '2026-11-22T00:00:00Z' }, labels: [{ name: 'flake' }] },
          },
        },
        {
          event: 'cross-referenced',
          source: { issue: { number: 61, pull_request: { merged_at: '2026-11-23T00:00:00Z' }, labels: [] } },
        },
        {
          event: 'cross-referenced',
          source: { issue: { number: 62, labels: [{ name: 'flake' }] } },
        },
      ],
    });

    expect(await readLinkedFixes(github, 12)).toEqual([
      { pull: 50, mergedAt: '2026-11-21T00:00:00Z' },
      { pull: 60, mergedAt: '2026-11-22T00:00:00Z' },
    ]);
  });

  it('should read the entries a pending branch removes from its parent commit and its own', async () => {
    const before = `${JSON.stringify({ entries: [entryOf(), entryOf({ issue: 14, test: 'src/a.test.ts > a > b' })] })}\n`;
    const after = removeFromQuarantine(before, [entryOf()]);
    const { github } = fakeGitHub(
      {
        'matching-refs/heads/flake-release': [
          { ref: 'refs/heads/flake-release/2026-11-24-abcd1234', object: { sha: 'branch-sha' } },
        ],
        'matching-refs/heads/flake-expiry': [],
        '/pulls?': [],
        '/commits/branch-sha': {
          commit: { message: 'test(host): Release 1 quarantined test\n\n- x (#12)\n' },
          parents: [{ sha: 'parent-sha' }],
          files: [{ filename: path, status: 'modified' }],
        },
      },
      { texts: { 'ref=parent-sha': before, 'ref=branch-sha': after } },
    );

    expect(await readPendingRemovals(github)).toEqual([
      {
        branch: 'flake-release/2026-11-24-abcd1234',
        kind: 'release',
        pull: undefined,
        message: 'test(host): Release 1 quarantined test\n\n- x (#12)\n',
        removed: [{ path, entry: entryOf() }],
      },
    ]);
  });

  it('should open the pull request of a current removal branch and close the one of a stale branch', async () => {
    const { github, requests } = fakeGitHub();
    const plan: RemovalPlan = {
      releases: [],
      expiries: [],
      held: [],
      waiting: [],
      current: [
        { branch: 'flake-expiry/2026-12-04-aaaa', kind: 'expiry', message: 'test(host): Expire 1\n\n- x', removed: [] },
      ],
      stale: [{ branch: 'flake-release/2026-11-24-bbbb', kind: 'release', pull: 88, removed: [], reason: 'gone' }],
    };

    const outcome = await reconcileRemovals(github, plan, { base: 'main' });

    expect(requests.find((request) => request.path.endsWith('/pulls'))?.body).toMatchObject({
      title: 'test(host): Expire 1',
      head: 'flake-expiry/2026-12-04-aaaa',
    });
    expect(requests.find((request) => request.path.endsWith('/pulls/88'))?.body).toEqual({ state: 'closed' });
    expect(outcome).toEqual([
      'Opened #9001 for `flake-expiry/2026-12-04-aaaa`, which had no pull request.',
      'Closed #88 (`flake-release/2026-11-24-bbbb`): gone.',
    ]);
  });

  it('should close the owner issue once its release merged, and not after an expiry or an unmerged release', async () => {
    const record = { identity: 'abcd', path, created: '2026-11-20', expires: '2026-12-04' };
    const merged = { ...record, branch: 'flake-release/2026-11-24-aaaa' };
    const unmerged = { ...record, branch: 'flake-release/2026-11-24-bbbb' };
    const bot = { type: 'Bot' };
    const releasing = [{ name: 'flake' }, { name: 'flake:releasing' }];
    const { github, requests } = fakeGitHub({
      'labels=flake%3Areleasing': [12, 13, 14, 15, 16].map((number) => ({ number, state: 'open', labels: releasing })),
      '/issues/12/comments': [{ body: removalMarker('release', merged), user: bot }],
      '/issues/13/comments': [
        { body: removalMarker('release', merged), user: bot },
        { body: removalMarker('expiry', record), user: bot },
      ],
      '/issues/15/comments': [{ body: removalMarker('release', unmerged), user: bot }],
      // A person's comment cannot pose as the automation's record.
      '/issues/16/comments': [{ body: removalMarker('release', merged), user: { type: 'User' } }],
      '/pulls?': (requested: string) =>
        requested.includes(encodeURIComponent('taucad:flake-release/2026-11-24-aaaa'))
          ? [{ number: 70, state: 'closed', merged_at: '2026-11-25T08:00:00Z' }]
          : [{ number: 71, state: 'closed', merged_at: null }],
    });

    const outcome = await closeReleased(github, { tests: testsOf([entryOf({ issue: 14 })]) });

    const patched = (issue: number): unknown =>
      requests.find((request) => request.method === 'PATCH' && request.path.endsWith(`/issues/${issue}`))?.body;
    expect(patched(12)).toEqual({ state: 'closed', state_reason: 'completed', labels: ['flake', 'flake:released'] });
    expect(patched(13)).toEqual({ labels: ['flake'] });
    expect(patched(15)).toEqual({ labels: ['flake'] });
    expect(patched(16)).toEqual({ labels: ['flake'] });
    expect(requests.some((request) => request.path.includes('/issues/14'))).toBe(false);
    // The closing comment records the day the release merged: the start of the 30-day return window.
    const closing = requests.find(
      (request) => request.method === 'POST' && request.path.endsWith('/issues/12/comments'),
    )?.body as { body: string };
    expect(lastLanded([closing.body])).toEqual({ ...merged, released: '2026-11-25' });
    expect(lastRemoval([closing.body])).toBeUndefined();
    expect(outcome).toHaveLength(4);
  });

  it('should comment once per removal branch and add a label a failed run left out', async () => {
    const tests = testsOf([entryOf()], '2026-12-04');
    const [removal] = planOf(emptyState(new Date()), tests, { today: '2026-12-04' }).expiries;
    if (!removal) {
      throw new Error('expected an expiry');
    }
    const branch = 'flake-expiry/2026-12-04-aaaa';
    const record = { identity: 'abcd', path, created: '2026-11-20', expires: '2026-12-04', branch };
    const { github, requests } = fakeGitHub({
      '/issues/12/comments': [{ body: removalMarker('expiry', record), user: { type: 'Bot' } }],
    });

    await ensureOwnerNotes(github, [{ kind: 'expiry', removal, branch, where: 'There.' }]);

    expect(requests.filter((request) => request.method === 'POST').map((request) => request.path)).toEqual([
      '/repos/taucad/tau/issues/12/labels',
    ]);
  });

  it('should not open a removal whose entry changed on the base since the plan', async () => {
    const renewed = `${JSON.stringify({ entries: [entryOf({ expires: '2026-12-18', renewal: { by: 'rifont', on: '2026-12-03' } })] })}\n`;
    const { github, requests } = fakeGitHub({}, { texts: { 'ref=main': renewed } });
    const plan: RemovalPlan = {
      releases: [],
      expiries: [],
      held: [],
      waiting: [],
      stale: [],
      current: [{ branch: 'flake-expiry/2026-12-04-aaaa', kind: 'expiry', removed: [{ path, entry: entryOf() }] }],
    };

    const outcome = await reconcileRemovals(github, plan, { base: 'main' });

    expect(requests.some((request) => request.method === 'POST')).toBe(false);
    expect(outcome).toEqual([
      '`flake-expiry/2026-12-04-aaaa` is not opened: an entry it removes changed on `main` since this run planned.',
    ]);
  });

  it('should read every page of the timeline for a linked fix', async () => {
    const filler = Array.from({ length: 100 }, () => ({ event: 'commented' }));
    const { github } = fakeGitHub({
      '/pulls?': [],
      '/timeline': (requested: string) =>
        requested.endsWith('page=1')
          ? filler
          : [
              {
                event: 'cross-referenced',
                source: {
                  issue: { number: 60, pull_request: { merged_at: '2026-11-22T00:00:00Z' }, labels: ['flake'] },
                },
              },
            ],
    });

    expect(await readLinkedFixes(github, 12)).toEqual([{ pull: 60, mergedAt: '2026-11-22T00:00:00Z' }]);
  });

  it('should write the release comment with the entry it releases', () => {
    const tests = testsOf([entryOf({ renewal: { by: 'rifont', on: '2026-11-21' }, expires: '2026-12-10' })]);
    const state = emptyState(new Date('2026-11-20T00:00:00Z'));
    history(state, tests, { count: 100, from: '2026-11-21T01:00:00Z' });
    const [release] = plannedOf(tests, state);
    if (!release) {
      throw new Error('expected a release');
    }

    expect(
      lastRemoval([releaseComment(release, { identity: 'abcd', where: 'Here.', branch: 'flake-release/x' })])?.record,
    ).toEqual({
      identity: 'abcd',
      path,
      created: '2026-11-20',
      expires: '2026-12-10',
      renewal: { by: 'rifont', on: '2026-11-21' },
      branch: 'flake-release/x',
    });
    expect(removalFiles(workspaceOf([]).quarantines, [release])).toEqual([
      { path, text: `${JSON.stringify({ entries: [] }, undefined, 2)}\n` },
    ]);
  });
});
