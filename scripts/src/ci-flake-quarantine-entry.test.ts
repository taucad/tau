/* eslint-disable @typescript-eslint/naming-convention -- Runs and requests are GitHub REST JSON. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readQuarantine } from '@taucad/vitest-ci/quarantine';

import { artifactRows } from '#ci-flake-ledger-ingest-cli.js';
import { emptyState, ingestRun, meetsEntryRule, parseOutcomes } from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IdentityState, IngestRun, LedgerState, OutcomeRow } from '#ci-flake-ledger-state.js';
import {
  applyPlan,
  mayAutoMerge,
  proposedFiles,
  readPages,
  readReturns,
  reconcileEntryBranches,
  validatePlan,
} from '#ci-flake-quarantine-entry-cli.js';
import type { Workspace } from '#ci-flake-quarantine-entry-cli.js';
import {
  addDays,
  failsEveryAttempt,
  issueBody,
  pullRequestBody,
  identityHashOf,
  narrowVariant,
  offenders,
  planEntries,
  renderQuarantine,
} from '#ci-flake-quarantine-entry.js';
import { identityMarker } from '#flake-regression.js';
import { removalMarker, returnMarker } from '#ci-flake-quarantine-release.js';
import type { ReturnRecord } from '#ci-flake-quarantine-release.js';
import type { EntryPlan, PlanInput, WorkspaceProject } from '#ci-flake-quarantine-entry.js';
import { GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';

const sha = (n: number): string => String(n).padStart(40, '0');

/** The replay week: one merge-queue run a day from 11-16 to 11-22, and a re-run of 11-18's. */
const weekRuns: ReadonlyArray<{ id: number; attempt: number; at: string; pr: number }> = [
  { id: 5001, attempt: 1, at: '2026-11-16T12:00:00Z', pr: 101 },
  { id: 5002, attempt: 1, at: '2026-11-17T12:00:00Z', pr: 102 },
  { id: 5003, attempt: 1, at: '2026-11-18T12:00:00Z', pr: 103 },
  { id: 5003, attempt: 2, at: '2026-11-18T13:00:00Z', pr: 103 },
  { id: 5004, attempt: 1, at: '2026-11-19T12:00:00Z', pr: 104 },
  { id: 5005, attempt: 1, at: '2026-11-20T12:00:00Z', pr: 105 },
  { id: 5006, attempt: 1, at: '2026-11-21T12:00:00Z', pr: 106 },
  { id: 5007, attempt: 1, at: '2026-11-22T12:00:00Z', pr: 107 },
];

const queueRun = (run: (typeof weekRuns)[number]): IngestRun => ({
  id: run.id,
  event: 'merge_group',
  head_branch: `gh-readonly-queue/main/pr-${run.pr}-${sha(run.id - 1)}`,
  head_sha: sha(run.id),
  status: 'completed',
  conclusion: 'success',
  created_at: run.at,
  updated_at: run.at,
  html_url: `https://github.com/taucad/tau/actions/runs/${run.id}`,
  run_attempt: run.attempt,
});

const weekRows = (name: string): OutcomeRow[] => {
  const parsed = parseOutcomes(
    readFileSync(resolve(import.meta.dirname, `fixtures/flake-quarantine/${name}.outcomes.jsonl`), 'utf8'),
    name,
  );
  expect(parsed.problems).toEqual([]);
  return parsed.rows;
};

/** The ledger state after ingesting the replay week, run by run, as `flake-ledger.yml` does. */
const replayWeek = (): LedgerState => {
  const state = emptyState(new Date('2026-11-16T00:00:00Z'));
  // Two artifacts a run: a gating lane's, and a non-gating shadow row's (DC-25), read as the ingestion reads them.
  const rows = [
    ...artifactRows('test-outcomes-affected-test-1', weekRows('replay-week')),
    ...artifactRows('test-outcomes-shadow-journey-chat-1', weekRows('replay-week-shadow')),
  ];
  for (const run of weekRuns) {
    ingestRun(state, {
      run: queueRun(run),
      rows: rows.filter((row) => row.run === run.id),
      artifacts: 2,
      rejected: 0,
    });
  }
  return state;
};

const id = {
  order: 'host › src/store.test.ts > store > should keep the order',
  render: 'ui-e2e › src/viewer.spec.ts > viewer > should render the model',
  write: 'host › src/io.test.ts > io > should write the file',
  tick: 'host › src/clock.test.ts > clock > should tick once a second',
  settle: 'api › src/billing/charge.test.ts > charge > should settle once',
  once: 'host › src/once.test.ts > once > should flake only once',
  journey: 'ui-e2e › src/journey-chat.spec.ts > journey > should answer in the chat',
};

const projects = new Map<string, WorkspaceProject>([
  ['host', { name: 'host', root: 'packages/host', tags: [] }],
  ['ui-e2e', { name: 'ui-e2e', root: 'apps/ui-e2e', tags: [] }],
  ['api', { name: 'api', root: 'apps/api', tags: [] }],
]);

const testFiles = new Map<string, string>([
  ['packages/host/src/store.test.ts', "describe('store', () => {\n  it('should keep the order', () => {});\n});\n"],
  [
    'apps/ui-e2e/src/viewer.spec.ts',
    "describe('viewer', () => {\n  it('should render the model', async () => {});\n});\n",
  ],
]);

const workspace: Workspace = { projects, quarantines: [] };

const plan = (state: LedgerState, overrides: Partial<PlanInput> = {}): EntryPlan =>
  planEntries({ state, projects, quarantines: [], pending: [], today: '2026-11-22', ...overrides });

type Request = { readonly method: string; readonly path: string; readonly body?: unknown };

/** A GitHub client that answers the entry job's requests from memory and records each one. */
const fakeGitHub = (
  options: {
    refusePullRequests?: boolean;
    pullStatus?: number;
    issues?: unknown[];
    branches?: Array<{ branch: string; pulls: unknown[]; pushed?: string; proposed?: unknown[] }>;
    failComment?: number;
  } = {},
) => {
  const requests: Request[] = [];
  let next = 700;
  const github: Client = {
    repository: 'taucad/tau',
    budget: () => 1000,
    async get<T>(path: string): Promise<T> {
      requests.push({ method: 'GET', path });
      if (path.includes('/issues?')) {
        return (options.issues ?? []) as T;
      }
      if (path.includes('/labels/') || path.includes('/git/ref/heads/')) {
        throw new GitHubError(`GET ${path}`, 404);
      }
      if (path.includes('/git/matching-refs/')) {
        const references: unknown = (options.branches ?? []).map(({ branch }) => ({
          ref: `refs/heads/${branch}`,
          object: { sha: `head-${branch}` },
        }));
        return references as T;
      }
      if (path.includes('/pulls?')) {
        const head = decodeURIComponent(/head=([^&]+)/u.exec(path)?.[1] ?? '').replace(/^taucad:/u, '');
        const pulls: unknown = options.branches?.find(({ branch }) => branch === head)?.pulls ?? [];
        return pulls as T;
      }
      if (path.includes('/tau/commits/head-')) {
        const branch = path.slice(path.indexOf('/commits/head-') + '/commits/head-'.length);
        const proposed = options.branches?.find((entry) => entry.branch === branch)?.proposed;
        const commit: unknown = {
          parents: [{ sha: 'parent' }],
          files: proposed ? [{ filename: 'packages/host/quarantine.json', status: 'modified' }] : [],
        };
        return commit as T;
      }
      if (path.includes('/git/commits/head-')) {
        const branch = path.slice(path.indexOf('/git/commits/head-') + '/git/commits/head-'.length);
        const pushed = options.branches?.find((entry) => entry.branch === branch)?.pushed ?? '2026-11-21';
        const commit: unknown = {
          message: 'test(host): Quarantine 1 flaky test\n\n- src/a.test.ts > a (#12)\n',
          committer: { date: `${pushed}T10:00:00Z` },
        };
        return commit as T;
      }
      if (path.includes('/git/commits/')) {
        const commit: unknown = {
          tree: { sha: 'base-tree' },
          message: 'test(host): Quarantine 1 flaky test\n\n- src/a.test.ts > a (#12)\n',
        };
        return commit as T;
      }
      throw new Error(`unexpected GET ${path}`);
    },
    async getText(path: string): Promise<string> {
      const head = /ref=head-(.+)$/u.exec(path)?.[1];
      if (head !== undefined) {
        const proposed = options.branches?.find((entry) => entry.branch === head)?.proposed ?? [];
        return JSON.stringify({ entries: proposed });
      }
      if (path.endsWith('ref=parent')) {
        return JSON.stringify({ entries: [] });
      }
      throw new Error(`unexpected getText ${path}`);
    },
    async getBytes(): Promise<Uint8Array<ArrayBuffer>> {
      throw new Error('unexpected getBytes');
    },
    async send<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown): Promise<T> {
      requests.push({ method, path, body });
      if (path.endsWith('/pulls') && options.refusePullRequests) {
        throw new GitHubError(`${method} ${path}`, 403, 'GitHub Actions is not permitted to create pull requests');
      }
      if (path.endsWith(`/issues/${options.failComment ?? 0}/comments`)) {
        throw new GitHubError(`${method} ${path}`, 502);
      }
      if (path.endsWith('/pulls') && options.pullStatus !== undefined) {
        throw new GitHubError(`${method} ${path}`, options.pullStatus);
      }
      next += 1;
      if (path.endsWith('/issues')) {
        const issue: unknown = { number: next };
        return issue as T;
      }
      if (path.endsWith('/pulls')) {
        const pull: unknown = { number: 9001, node_id: 'PR_node' };
        return pull as T;
      }
      const written: unknown = { sha: `sha-${next}`, data: {} };
      return written as T;
    },
  };
  return { github, requests };
};

describe('the replay week (FQ-6 acceptance)', () => {
  it('should admit the tests that meet the entry rule and none that fail every attempt', () => {
    const state = replayWeek();

    const { admitted, refused, held } = plan(state);

    expect(admitted.map((planned) => planned.id)).toEqual([id.order, id.render]);
    expect(refused.map((refusal) => [refusal.id, refusal.kind])).toEqual([
      [id.journey, 'shadow'],
      [id.settle, 'never-quarantine'],
      [id.tick, 'failing'],
    ]);
    expect(held).toEqual([]);
    // The ledger keeps the newest outcome whether or not the failure paired.
    expect(state.identities[id.tick]?.lastOutcome).toBe('failed');
    expect(state.identities[id.order]?.lastOutcome).toBe('passed');
    // Failed every attempt on every run it failed: never a flake event, never an offender.
    expect(state.identities[id.write]?.failures).toBe(4);
    expect(state.identities[id.write]?.events).toEqual([]);
    // One event is below the rule.
    expect(state.identities[id.once]?.events).toHaveLength(1);
    expect(offenders(state).map((offender) => offender.id)).not.toContain(id.once);
  });

  it('should write entries that the validator accepts, narrowed to the browser that flaked', () => {
    const checked = validatePlan(plan(replayWeek()), {
      workspace,
      readTracked: (path) => testFiles.get(path),
      today: '2026-11-22',
    });

    expect(checked.problems).toEqual([]);
    const files = proposedFiles([], checked.plan.admitted);
    expect(files.map((file) => file.path)).toEqual(['packages/host/quarantine.json', 'apps/ui-e2e/quarantine.json']);
    const ui = JSON.parse(files[1]?.text ?? '') as { $schema: string; entries: unknown[] };
    expect(ui.$schema).toBe('../../tools/vitest-ci/quarantine.schema.json');
    expect(ui.entries).toEqual([
      {
        test: 'src/viewer.spec.ts > viewer > should render the model',
        variant: { browser: 'firefox' },
        owner: 'rifont',
        issue: 0,
        class: 'timing-budget',
        created: '2026-11-22',
        expires: '2026-12-06',
        evidence: '2 flake events (same-hash 1, retry 1) in its last 11 executions; runs 5003, 5006',
      },
    ]);
  });

  it('should open the owner issues and one quarantine pull request that may auto-merge', async () => {
    const checked = validatePlan(plan(replayWeek()), {
      workspace,
      readTracked: (path) => testFiles.get(path),
      today: '2026-11-22',
    });
    const { github, requests } = fakeGitHub();

    const result = await applyPlan(github, checked.plan, {
      base: 'main',
      baseSha: sha(1),
      quarantines: [],
      problems: checked.problems,
      today: '2026-11-22',
    });

    const created = requests.filter((request) => request.method === 'POST' && request.path.endsWith('/issues'));
    // The never-quarantine offender gets an issue (it keeps gating; the agent starts at once), but no entry.
    expect(created.map((request) => (request.body as { title: string }).title)).toEqual([
      `Flaky test: ${id.settle}`,
      `Flaky test: ${id.order}`,
      `Flaky test: ${id.render}`,
    ]);
    expect(created.every((request) => (request.body as { labels: string[] }).labels.includes('flake'))).toBe(true);
    const tree = requests.find((request) => request.path.endsWith('/git/trees'))?.body as {
      tree: Array<{ path: string; content: string }>;
    };
    expect(tree.tree.map((file) => file.path)).toEqual([
      'packages/host/quarantine.json',
      'apps/ui-e2e/quarantine.json',
    ]);
    for (const file of tree.tree) {
      const root = file.path.replace(/\/quarantine\.json$/u, '');
      expect(readQuarantine(file.content, { projectRoot: root }, '2026-11-22').problems).toEqual([]);
    }
    const issues = tree.tree.flatMap(
      (file) => (JSON.parse(file.content) as { entries: Array<{ issue: number }> }).entries,
    );
    expect(issues.map((entry) => entry.issue)).toEqual([result.issues.get(id.order), result.issues.get(id.render)]);
    const pull = requests.find((request) => request.path.endsWith('/pulls'))?.body as { head: string; title: string };
    expect(pull.head).toMatch(/^flake-quarantine\/2026-11-22-[\da-f]{8}$/u);
    expect(pull.title).toBe('test(root): Quarantine 2 flaky tests in 2 projects');
    expect(requests.some((request) => request.path === '/graphql')).toBe(true);
    expect(result).toMatchObject({ pullRequest: 9001, autoMerge: true });
  });

  it('should name the branch on the issues when the token may not open pull requests', async () => {
    const checked = validatePlan(plan(replayWeek()), {
      workspace,
      readTracked: (path) => testFiles.get(path),
      today: '2026-11-22',
    });
    const { github, requests } = fakeGitHub({ refusePullRequests: true });

    const result = await applyPlan(github, checked.plan, {
      base: 'main',
      baseSha: sha(1),
      quarantines: [],
      problems: checked.problems,
      today: '2026-11-22',
    });

    expect(result).toMatchObject({ pullRequest: undefined, autoMerge: false });
    expect(requests.some((request) => request.path === '/graphql')).toBe(false);
    const comments = requests.filter((request) => request.path.endsWith('/comments'));
    expect(comments).toHaveLength(2);
    const [first] = comments;
    expect((first?.body as { body: string } | undefined)?.body).toContain(
      `https://github.com/taucad/tau/compare/main...${result.branch ?? ''}?expand=1`,
    );
  });

  it('should name the branch on the issues before it raises a pull request failure', async () => {
    const checked = validatePlan(plan(replayWeek()), {
      workspace,
      readTracked: (path) => testFiles.get(path),
      today: '2026-11-22',
    });
    const { github, requests } = fakeGitHub({ pullStatus: 502 });

    await expect(
      applyPlan(github, checked.plan, {
        base: 'main',
        baseSha: sha(1),
        quarantines: [],
        problems: checked.problems,
        today: '2026-11-22',
      }),
    ).rejects.toThrow('502');
    const comments = requests.filter((request) => request.path.endsWith('/comments'));
    expect(comments).toHaveLength(2);
    expect((comments[0]?.body as { body: string } | undefined)?.body).toContain('/compare/main...flake-quarantine/');
  });

  it('should open the pull request of an entry branch left without one, and leave one that has one', async () => {
    const { github, requests } = fakeGitHub({
      branches: [
        { branch: 'flake-quarantine/2026-11-21-aaaaaaaa', pulls: [] },
        { branch: 'flake-quarantine/2026-11-22-bbbbbbbb', pulls: [{ number: 5, state: 'open' }] },
      ],
    });

    const outcome = await reconcileEntryBranches(github, 'main', '2026-11-22');

    const opened = requests.filter((request) => request.path.endsWith('/pulls'));
    expect(opened.map((request) => request.body)).toEqual([
      expect.objectContaining({
        title: 'test(host): Quarantine 1 flaky test',
        head: 'flake-quarantine/2026-11-21-aaaaaaaa',
        base: 'main',
      }),
    ]);
    expect(outcome).toEqual(['Opened #9001 for `flake-quarantine/2026-11-21-aaaaaaaa`, which had no pull request.']);
  });

  it('should leave an entry branch held when the token may not open its pull request', async () => {
    const { github } = fakeGitHub({
      refusePullRequests: true,
      branches: [{ branch: 'flake-quarantine/2026-11-21-aaaaaaaa', pulls: [] }],
    });

    expect(await reconcileEntryBranches(github, 'main', '2026-11-22')).toEqual([
      '`flake-quarantine/2026-11-21-aaaaaaaa` still has no pull request: this token may not open one.',
    ]);
  });

  it('should not open the pull request of an entry branch whose proposal has expired', async () => {
    const { github, requests } = fakeGitHub({
      branches: [{ branch: 'flake-quarantine/2026-11-01-aaaaaaaa', pulls: [], pushed: '2026-11-01' }],
    });

    expect(await reconcileEntryBranches(github, 'main', '2026-11-22')).toEqual([
      '`flake-quarantine/2026-11-01-aaaaaaaa` holds an expired proposal; it is not opened and reserves nothing.',
    ]);
    expect(requests.some((request) => request.path.endsWith('/pulls'))).toBe(false);
  });

  it('should not open an entry branch whose proposed entry has expired, though pushed in the last 14 days', async () => {
    const { github, requests } = fakeGitHub({
      branches: [
        {
          branch: 'flake-quarantine/2026-11-21-aaaaaaaa',
          pulls: [],
          proposed: [{ test: 'src/a.test.ts > a > b', created: '2026-11-08', expires: '2026-11-22' }],
        },
      ],
    });

    const outcome = await reconcileEntryBranches(github, 'main', '2026-11-23');

    expect(requests.some((request) => request.method === 'POST')).toBe(false);
    expect(outcome).toEqual([
      '`flake-quarantine/2026-11-21-aaaaaaaa` holds an expired proposal; it is not opened and reserves nothing.',
    ]);
  });

  it('should comment on every other owner issue when one comment fails', async () => {
    const checked = validatePlan(plan(replayWeek()), {
      workspace,
      readTracked: (path) => testFiles.get(path),
      today: '2026-11-22',
    });
    // The label takes 701; the issues are 702 (the billing test's), 703 and 704.
    const { github, requests } = fakeGitHub({ refusePullRequests: true, failComment: 703 });

    const result = await applyPlan(github, checked.plan, {
      base: 'main',
      baseSha: sha(1),
      quarantines: [],
      problems: checked.problems,
      today: '2026-11-22',
    });

    const comments = requests.filter((request) => request.path.endsWith('/comments'));
    expect(comments.map((request) => request.path)).toEqual([
      '/repos/taucad/tau/issues/703/comments',
      '/repos/taucad/tau/issues/704/comments',
    ]);
    expect(result.outcome.some((line) => line.startsWith('Could not comment on #703'))).toBe(true);
  });

  it('should refuse the entry of a project whose quarantine.json is not an object, and check the rest', () => {
    const broken: Workspace = { projects, quarantines: [{ path: 'packages/host/quarantine.json', text: 'null' }] };

    const checked = validatePlan(plan(replayWeek(), { quarantines: broken.quarantines }), {
      workspace: broken,
      readTracked: (path) => testFiles.get(path),
      today: '2026-11-22',
    });

    expect(checked.plan.admitted.map((planned) => planned.id)).toEqual([id.render]);
    expect(checked.plan.refused.find((refusal) => refusal.id === id.order)?.kind).toBe('invalid');
  });

  it('should escape pipes in the table cells of the issue and the pull request', () => {
    const [first] = plan(replayWeek()).admitted;
    expect(first).toBeDefined();
    if (first === undefined) {
      return;
    }
    const piped = {
      ...first,
      events: first.events.map((event) => ({ ...event, error: 'expected a | b' })),
      entry: { ...first.entry, test: 'src/store.test.ts > store > a | b' },
    };

    expect(issueBody(piped, { repository: 'taucad/tau' })).toContain('`expected a \\| b`');
    expect(pullRequestBody([piped], { autoMerge: true, problems: [] })).toContain('store > a \\| b`');
  });

  it('should link an open owner issue instead of opening another', async () => {
    const checked = validatePlan(plan(replayWeek()), {
      workspace,
      readTracked: (path) => testFiles.get(path),
      today: '2026-11-22',
    });
    const { github, requests } = fakeGitHub({ issues: [{ number: 42, body: `${identityMarker(id.order)}\n\nBody` }] });

    const result = await applyPlan(github, checked.plan, {
      base: 'main',
      baseSha: sha(1),
      quarantines: [],
      problems: checked.problems,
      today: '2026-11-22',
    });

    expect(result.issues.get(id.order)).toBe(42);
    expect(requests.filter((request) => request.method === 'POST' && request.path.endsWith('/issues'))).toHaveLength(2);
  });
});

describe('shadow rows (DC-25)', () => {
  it('should open no entry for a test whose failures meet the rule only in a non-gating shadow row', () => {
    const state = replayWeek();
    const journey = state.identities[id.journey];

    // Numerically it meets the rule: two retried passes in seven executions.
    expect(journey && meetsEntryRule(journey)).toBe(true);
    expect(journey?.events.every((event) => event.shadow === true)).toBe(true);
    const result = plan(state);
    expect(offenders(state).map((offender) => offender.id)).not.toContain(id.journey);
    expect(result.admitted.map((planned) => planned.id)).not.toContain(id.journey);
    expect(result.refused.find((refusal) => refusal.id === id.journey)?.kind).toBe('shadow');
  });

  it('should count only the gating events of a test that also flakes in a shadow row', () => {
    const state = replayWeek();
    const order = state.identities[id.order];
    expect(order).toBeDefined();
    if (order === undefined) {
      return;
    }
    // One of its two events was a shadow row's: one gating event is below the rule.
    order.events = order.events.map((event, index) => (index === 0 ? { ...event, shadow: true } : event));

    expect(plan(state).admitted.map((planned) => planned.id)).toEqual([id.render]);
  });
});

describe('planEntries', () => {
  it('should refuse a test whose newest execution failed every attempt on a hash that passed before', () => {
    const state = replayWeek();
    const order = state.identities[id.order];
    expect(order).toBeDefined();
    if (order === undefined) {
      return;
    }
    // A same-hash failure pairs at once and leaves no open failure, but the test is failing now.
    order.lastOutcome = 'failed';
    order.openFailures = [];

    expect(plan(state).refused.find((refusal) => refusal.id === id.order)?.kind).toBe('failing');
  });

  it('should reserve no capacity for an expired entry of an unmerged proposal', () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({
      test: `src/other.test.ts > t${index}`,
      expires: '2026-11-20',
    }));

    const result = plan(replayWeek(), {
      pending: [{ path: 'packages/host/quarantine.json', text: JSON.stringify({ entries }) }],
    });

    expect(result.admitted.map((planned) => planned.id)).toEqual([id.order, id.render]);
  });

  it('should count no event of a test whose target is a registered shadow row, marked or not', () => {
    const state = replayWeek();
    for (const event of state.identities[id.render]?.events ?? []) {
      expect(event.shadow).toBeUndefined();
    }

    const result = plan(state, { shadowTargets: new Set(['ui-e2e:test:e2e']) });

    expect(result.admitted.map((planned) => planned.id)).toEqual([id.order]);
    expect(result.refused.find((refusal) => refusal.id === id.render)?.kind).toBe('shadow');
  });

  it('should hold a test already on main or on an open entry branch', () => {
    const state = replayWeek();
    const entry = (test: string): string =>
      JSON.stringify({
        entries: [
          {
            test,
            owner: 'rifont',
            issue: 1,
            class: 'race',
            created: '2026-11-20',
            expires: '2026-12-01',
            evidence: 'x',
          },
        ],
      });

    const result = plan(state, {
      quarantines: [
        { path: 'packages/host/quarantine.json', text: entry('src/store.test.ts > store > should keep the order') },
      ],
      pending: [
        { path: 'apps/ui-e2e/quarantine.json', text: entry('src/viewer.spec.ts > viewer > should render the model') },
      ],
    });

    expect(result.admitted).toEqual([]);
    expect(result.held).toEqual([id.order, id.render]);
  });

  it('should refuse past the per-project cap of 8, counting open entry branches', () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({ test: `src/other.test.ts > t${index}` }));

    const result = plan(replayWeek(), {
      pending: [{ path: 'packages/host/quarantine.json', text: JSON.stringify({ entries }) }],
    });

    expect(result.admitted.map((planned) => planned.id)).toEqual([id.render]);
    expect(result.refused.find((refusal) => refusal.id === id.order)?.kind).toBe('cap');
  });

  it('should refuse past the workspace cap of 20', () => {
    const file = (n: number): { path: string; text: string } => ({
      path: `libs/l${n}/quarantine.json`,
      text: JSON.stringify({
        entries: Array.from({ length: 5 }, (_, index) => ({ test: `src/a.test.ts > t${index}` })),
      }),
    });

    const result = plan(replayWeek(), { quarantines: [file(1), file(2), file(3), file(4)] });

    expect(result.admitted).toEqual([]);
    expect(result.refused.filter((refusal) => refusal.kind === 'cap')).toHaveLength(2);
  });

  it('should take the owner and the owner issue from flake-ledger.json', () => {
    const result = plan(replayWeek(), {
      owners: {
        entries: [
          {
            key: id.order,
            owner: 'octocat',
            recorded: '2026-11-20',
            expiryDay: '2026-12-01',
            note: 'Owner issue: taucad/tau#2787.',
          },
        ],
      },
    });

    expect(result.admitted[0]).toMatchObject({ linkedIssue: 2787, entry: { owner: 'octocat', issue: 2787 } });
  });

  it('should never quarantine a flaky regression: a test stable for 300 executions before its burst', () => {
    const state = replayWeek();
    const order = state.identities[id.order];
    expect(order).toBeDefined();
    if (order === undefined) {
      return;
    }
    // Its variant ran it 400 times without an event before the ledger first saw it fail.
    for (const variant of Object.values(order.variants)) {
      variant.stableBefore = 400;
    }

    const result = plan(state);

    expect(result.admitted.map((planned) => planned.id)).toEqual([id.render]);
    expect(result.refused.find((refusal) => refusal.id === id.order)?.kind).toBe('flaky-regression');
  });

  it('should refuse a test whose project is not in the workspace', () => {
    const result = plan(replayWeek(), {
      projects: new Map([['host', { name: 'host', root: 'packages/host', tags: [] }]]),
    });

    expect(result.refused.find((refusal) => refusal.id === id.render)?.kind).toBe('no-project');
  });
});

describe('the entry helpers', () => {
  const identity = (overrides: Partial<IdentityState>): IdentityState => ({
    project: 'host',
    targetKey: 'test',
    file: 'src/a.test.ts',
    firstSeen: '2026-11-16T00:00:00Z',
    lastSeen: '2026-11-16T00:00:00Z',
    lastFailure: '2026-11-16T00:00:00Z',
    executions: 10,
    failures: 0,
    retriedPasses: 0,
    passStreak: 0,
    variants: {},
    events: [],
    openFailures: [],
    passHashes: [],
    failureShas: [],
    aliases: [],
    ...overrides,
  });

  it('should call a test failing every attempt only when its newest execution is the unpaired failure', () => {
    const failure = { run: 1, attempt: 1, at: '2026-11-16T00:00:00Z', variant: 'linux-x64', execution: 10 };

    expect(failsEveryAttempt(identity({ openFailures: [failure] }))).toBe(true);
    expect(failsEveryAttempt(identity({ openFailures: [{ ...failure, execution: 9 }] }))).toBe(false);
    expect(failsEveryAttempt(identity({}))).toBe(false);
  });

  it('should narrow to an OS only when the test also ran on another', () => {
    const event: Omit<FlakeEvent, 'variant'> = {
      kind: 'retry',
      at: '',
      run: 1,
      attempt: 1,
      failedRun: 1,
      failedAttempt: 1,
      execution: 1,
    };
    const ran = { executions: 3, failures: 0, events: 0, lastSeen: '' };

    expect(
      narrowVariant(identity({ variants: { 'darwin-arm64': ran, 'linux-x64': ran } }), [
        { ...event, variant: 'darwin-arm64' },
      ]),
    ).toEqual({ os: 'darwin' });
    expect(
      narrowVariant(identity({ variants: { 'linux-x64': ran } }), [{ ...event, variant: 'linux-x64' }]),
    ).toBeUndefined();
  });

  it('should keep an existing quarantine.json as it is and append', () => {
    const text = renderQuarantine('apps/x/quarantine.json', '{\n  "entries": [{ "test": "a > b" }]\n}\n', [
      {
        test: 'c > d',
        owner: 'rifont',
        issue: 1,
        class: 'race',
        created: '2026-11-22',
        expires: addDays('2026-11-22', 14),
        evidence: 'e',
      },
    ]);

    expect(JSON.parse(text)).toEqual({
      entries: [
        { test: 'a > b' },
        {
          test: 'c > d',
          owner: 'rifont',
          issue: 1,
          class: 'race',
          created: '2026-11-22',
          expires: '2026-12-06',
          evidence: 'e',
        },
      ],
    });
  });

  it('should auto-merge only a change to quarantine.json files that validates', () => {
    expect(mayAutoMerge(['apps/a/quarantine.json'], [])).toBe(true);
    expect(mayAutoMerge(['apps/a/quarantine.json', 'apps/a/src/a.test.ts'], [])).toBe(false);
    expect(mayAutoMerge(['apps/a/quarantine.json'], ['expired'])).toBe(false);
    expect(mayAutoMerge([], [])).toBe(false);
  });

  it('should make test output inert in the issue body', () => {
    const offender = offenders(replayWeek()).find((candidate) => candidate.id === id.order);
    expect(offender).toBeDefined();
    if (offender === undefined) {
      return;
    }
    const events = offender.events.map((event) => ({ ...event, error: 'see `x`\n@octocat' }));

    const body = issueBody({ ...offender, events }, { repository: 'taucad/tau' });

    expect(body).toContain("`see 'x' @octocat`");
    expect(body.startsWith(identityMarker(offender.id))).toBe(true);
  });
});

describe('the 30-day return (FQ-9)', () => {
  const record: ReturnRecord = {
    identity: identityHashOf(id.order),
    path: 'packages/host/quarantine.json',
    created: '2026-11-10',
    expires: '2026-11-24',
    renewal: { by: 'rifont', on: '2026-11-12' },
    issue: 77,
    released: '2026-11-14',
  };

  it('should re-enter a test released in the last 30 days as the same entry, for the operator', () => {
    const result = plan(replayWeek(), { returns: new Map([[record.identity, record]]) });
    const returned = result.admitted.find((planned) => planned.id === id.order);

    expect(returned).toMatchObject({
      linkedIssue: 77,
      returned: record,
      entry: { issue: 77, created: '2026-11-10', expires: '2026-11-24', renewal: { by: 'rifont', on: '2026-11-12' } },
    });
    expect(returned?.entry.evidence).toMatch(/^returned within 30 days of its release on 2026-11-14; 2 flake events/u);
    expect(
      readQuarantine(
        JSON.stringify({ entries: [{ ...returned?.entry }] }),
        { projectRoot: 'packages/host' },
        '2026-11-22',
      ).problems,
    ).toEqual([]);
  });

  it('should refuse a return whose entry has expired: it keeps gating and goes to the operator', () => {
    const expired = { ...record, expires: '2026-11-21' };
    const result = plan(replayWeek(), { returns: new Map([[record.identity, expired]]) });

    expect(result.refused.find((refusal) => refusal.id === id.order)).toMatchObject({
      kind: 'returned',
      linkedIssue: 77,
      returned: expired,
    });
  });

  it('should reopen the owner issue of a return for the operator, whether it re-enters or not', async () => {
    const returns = new Map([[record.identity, record]]);
    const checked = validatePlan(plan(replayWeek(), { returns }), {
      workspace,
      readTracked: (path) => testFiles.get(path),
      today: '2026-11-22',
    });
    const { github, requests } = fakeGitHub();

    await applyPlan(github, checked.plan, {
      base: 'main',
      baseSha: sha(1),
      quarantines: [],
      problems: checked.problems,
      today: '2026-11-22',
    });

    expect(requests.find((request) => request.method === 'PATCH' && request.path.endsWith('/issues/77'))?.body).toEqual(
      { state: 'open', state_reason: 'reopened' },
    );
    expect(requests.find((request) => request.path.endsWith('/issues/77/labels'))?.body).toEqual({
      labels: ['flake:needs-operator'],
    });
    const tree = requests.find((request) => request.path.endsWith('/git/trees'))?.body as {
      tree: Array<{ path: string; content: string }>;
    };
    const entries = tree.tree.flatMap(
      (file) => (JSON.parse(file.content) as { entries: Array<{ issue: number }> }).entries,
    );
    expect(entries.map((entry) => entry.issue)).toContain(77);

    const refusedOnly = await applyPlan(
      fakeGitHub().github,
      {
        admitted: [],
        held: [],
        refused: plan(replayWeek(), {
          returns: new Map([[record.identity, { ...record, expires: '2026-11-21' }]]),
        }).refused.filter((refusal) => refusal.kind === 'returned'),
      },
      { base: 'main', baseSha: sha(1), quarantines: [], problems: [], today: '2026-11-22' },
    );
    expect(refusedOnly.outcome).toEqual(['Reopened #77 for the operator: a return that is not quarantined again.']);
  });

  it('should not reopen or comment again on a return an earlier run handed to the operator', async () => {
    const open = { ...record, expires: '2026-11-21', handoff: { labelled: true, noted: true, open: true } };
    const refused = plan(replayWeek(), { returns: new Map([[record.identity, open]]) }).refused.filter(
      (refusal) => refusal.kind === 'returned',
    );
    const { github, requests } = fakeGitHub();

    const result = await applyPlan(
      github,
      { admitted: [], held: [], refused },
      { base: 'main', baseSha: sha(1), quarantines: [], problems: [], today: '2026-11-22' },
    );

    expect(result.outcome).toEqual(['#77 is already open for the operator: a return that is not quarantined again.']);
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
  });

  it('should finish a handoff an earlier run left half-done, without a second note', async () => {
    const half = { ...record, expires: '2026-11-21', handoff: { labelled: true, noted: true, open: false } };
    const refused = plan(replayWeek(), { returns: new Map([[record.identity, half]]) }).refused.filter(
      (refusal) => refusal.kind === 'returned',
    );
    const { github, requests } = fakeGitHub();

    await applyPlan(
      github,
      { admitted: [], held: [], refused },
      { base: 'main', baseSha: sha(1), quarantines: [], problems: [], today: '2026-11-22' },
    );

    expect(requests.filter((request) => request.method !== 'GET')).toEqual([
      { method: 'PATCH', path: '/repos/taucad/tau/issues/77', body: { state: 'open', state_reason: 'reopened' } },
    ]);
  });

  it('should post only the missing note of an open, labelled issue whose note failed', async () => {
    const half = { ...record, expires: '2026-11-21', handoff: { labelled: true, noted: false, open: true } };
    const refused = plan(replayWeek(), { returns: new Map([[record.identity, half]]) }).refused.filter(
      (refusal) => refusal.kind === 'returned',
    );
    const { github, requests } = fakeGitHub();

    await applyPlan(
      github,
      { admitted: [], held: [], refused },
      { base: 'main', baseSha: sha(1), quarantines: [], problems: [], today: '2026-11-22' },
    );

    const writes = requests.filter((request) => request.method !== 'GET');
    expect(writes.map((request) => [request.method, request.path])).toEqual([
      ['POST', '/repos/taucad/tau/issues/77/comments'],
    ]);
    expect(writes[0]?.body).toMatchObject({ body: expect.stringContaining(returnMarker(half)) as unknown });
  });

  it('should fail closed on a list longer than it reads', async () => {
    const github: Client = {
      repository: 'taucad/tau',
      budget: () => 100,
      get: async <T>(): Promise<T> => Array.from({ length: 100 }, () => ({})) as T,
      getText: async () => '',
      getBytes: async () => new Uint8Array(),
      send: async () => {
        throw new Error('unexpected write');
      },
    };

    await expect(readPages(github, '/repos/taucad/tau/issues/1/comments')).rejects.toThrow(
      'more than 5000 items; not read in part',
    );
  });

  it('should read the releases of the last 30 days from the owner issues', async () => {
    const requests: string[] = [];
    const bot = { type: 'Bot' };
    const answer = (path: string): unknown => {
      if (path.includes('/issues?')) {
        return [
          { number: 77, state: 'closed', labels: [{ name: 'flake:released' }] },
          { number: 78, state: 'closed' },
          { number: 79, state: 'closed', pull_request: {} },
          { number: 80, state: 'open', labels: [{ name: 'flake:released' }, { name: 'flake:needs-operator' }] },
          // Reopened, but the label never landed: the handoff is not complete.
          { number: 81, state: 'open', labels: ['flake:released'] },
        ];
      }
      if (path.includes('/issues/77/comments')) {
        // The marker is on the second page of comments; a person's marker after it does not count.
        return path.endsWith('page=1')
          ? Array.from({ length: 100 }, () => ({ body: 'noise', user: bot }))
          : [
              { body: removalMarker('released', { ...record, released: '2026-11-14' }), user: bot },
              { body: removalMarker('released', { ...record, released: '2026-11-20' }), user: { type: 'User' } },
            ];
      }
      if (path.includes('/issues/78/comments')) {
        // Released more than 30 days ago.
        return [{ body: removalMarker('released', { ...record, identity: 'old', released: '2026-10-01' }), user: bot }];
      }
      if (path.includes('/issues/80/comments')) {
        // Reopened and labelled by an earlier run: still the same entry, already with the operator.
        return [
          { body: removalMarker('released', { ...record, identity: 'reopened', released: '2026-11-18' }), user: bot },
          { body: `${returnMarker({ identity: 'reopened', released: '2026-11-18' })}\nReturned.`, user: bot },
        ];
      }
      if (path.includes('/issues/81/comments')) {
        return [
          { body: removalMarker('released', { ...record, identity: 'half', released: '2026-11-18' }), user: bot },
        ];
      }
      throw new Error(`unexpected GET ${path}`);
    };
    const github: Client = {
      repository: 'taucad/tau',
      budget: () => 100,
      async get<T>(path: string): Promise<T> {
        requests.push(path);
        return answer(path) as T;
      },
      getText: async () => '',
      getBytes: async () => new Uint8Array(),
      send: async () => {
        throw new Error('unexpected write');
      },
    };

    const returns = await readReturns(github, '2026-11-22');

    expect([...returns.values()]).toEqual([
      { ...record, issue: 77, released: '2026-11-14', handoff: { labelled: false, noted: false, open: false } },
      {
        ...record,
        identity: 'reopened',
        issue: 80,
        released: '2026-11-18',
        handoff: { labelled: true, noted: true, open: true },
      },
      {
        ...record,
        identity: 'half',
        issue: 81,
        released: '2026-11-18',
        handoff: { labelled: false, noted: false, open: true },
      },
    ]);
    expect(requests[0]).toContain('state=all&labels=flake%3Areleased&since=2026-10-23T00:00:00Z');
    expect(requests.some((path) => path.includes('/issues/79/'))).toBe(false);
  });
});
