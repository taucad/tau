/* eslint-disable @typescript-eslint/naming-convention -- Runs and requests are GitHub REST JSON. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readQuarantine } from '@taucad/vitest-ci/quarantine';

import { artifactRows } from '#ci-flake-ledger-ingest-cli.js';
import { emptyState, ingestRun, meetsEntryRule, parseOutcomes } from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IdentityState, IngestRun, LedgerState, OutcomeRow } from '#ci-flake-ledger-state.js';
import { applyPlan, mayAutoMerge, proposedFiles, validatePlan } from '#ci-flake-quarantine-entry-cli.js';
import type { Workspace } from '#ci-flake-quarantine-entry-cli.js';
import {
  addDays,
  failsEveryAttempt,
  issueBody,
  narrowVariant,
  offenders,
  planEntries,
  renderQuarantine,
} from '#ci-flake-quarantine-entry.js';
import { identityMarker } from '#flake-regression.js';
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
const fakeGitHub = (options: { refusePullRequests?: boolean; issues?: unknown[] } = {}) => {
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
      if (path.includes('/git/commits/')) {
        const commit: unknown = { tree: { sha: 'base-tree' } };
        return commit as T;
      }
      throw new Error(`unexpected GET ${path}`);
    },
    async getText(): Promise<string> {
      throw new Error('unexpected getText');
    },
    async getBytes(): Promise<Uint8Array<ArrayBuffer>> {
      throw new Error('unexpected getBytes');
    },
    async send<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown): Promise<T> {
      requests.push({ method, path, body });
      if (path.endsWith('/pulls') && options.refusePullRequests) {
        throw new GitHubError(`${method} ${path}`, 403, 'GitHub Actions is not permitted to create pull requests');
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
    // Its target ran it 400 times without an event before the ledger first saw it fail.
    order.stableBefore = 400;

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
