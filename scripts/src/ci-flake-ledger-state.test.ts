/* eslint-disable @typescript-eslint/naming-convention -- Runs are GitHub REST JSON. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { aliasProblems, ledgerProblems } from '#ci-flake-ledger.js';
import {
  applyAliases,
  confirmLineage,
  emptyState,
  eventsInLast,
  ingestRun,
  isIngested,
  isInherited,
  lineageConfirmed,
  meetsEntryRule,
  parseOutcomes,
  parseState,
  pruneState,
  renderLedgerMarkdown,
  serializeState,
  summarizeLedger,
  variantKey,
} from '#ci-flake-ledger-state.js';
import type { IdentityState, IngestRun, LedgerState, OutcomeRow } from '#ci-flake-ledger-state.js';

const fixture = (name: string): OutcomeRow[] => {
  const parsed = parseOutcomes(
    readFileSync(resolve(import.meta.dirname, 'fixtures/flake-ledger', `${name}.outcomes.jsonl`), 'utf8'),
    name,
  );
  expect(parsed.problems).toEqual([]);
  return parsed.rows;
};

const sha = (n: number): string => n.toString(16).padStart(40, '0');

const queueRun = (options: {
  id: number;
  pr: number;
  base: string;
  head: string;
  at: string;
  attempt?: number;
}): IngestRun => ({
  id: options.id,
  event: 'merge_group',
  head_branch: `gh-readonly-queue/main/pr-${options.pr}-${options.base}`,
  head_sha: options.head,
  status: 'completed',
  conclusion: 'success',
  created_at: options.at,
  updated_at: options.at,
  html_url: `https://github.com/taucad/tau/actions/runs/${options.id}`,
  run_attempt: options.attempt ?? 1,
});

const pushRun = (id: number, head: string, at: string): IngestRun => ({
  id,
  event: 'push',
  head_branch: 'main',
  head_sha: head,
  status: 'completed',
  conclusion: 'success',
  created_at: at,
  updated_at: at,
  html_url: `https://github.com/taucad/tau/actions/runs/${id}`,
  run_attempt: 1,
});

const row = (overrides: Partial<OutcomeRow> & { id: string; run: number }): OutcomeRow => ({
  kind: 'test',
  project: 'host',
  target: 'test',
  targetKey: 'test',
  file: 'src/a.test.ts',
  variant: { os: 'linux', arch: 'x64' },
  state: 'passed',
  retryCount: 0,
  flaky: false,
  durationMs: 5,
  errors: [],
  hash: '111',
  attempt: 1,
  job: 'affected-lane',
  ...overrides,
});

const A = 'host › src/a.test.ts > store > should keep the order';
const B = 'host › src/a.test.ts > store > should save';
const C = 'host › src/b.test.ts > retries > should settle';
const now = new Date('2026-11-25T12:00:00Z');
const identity = (state: LedgerState, id: string): IdentityState => {
  const found = state.identities[id];
  if (!found) {
    throw new Error(`${id} is not in the state`);
  }
  return found;
};

describe('parseOutcomes', () => {
  it('should read a schema-1 row and turn null into a missing value', () => {
    const [first] = fixture('run-1001-attempt-1');
    expect(first).toMatchObject({ id: A, state: 'failed', hash: '111', run: 1001, attempt: 1, targetKey: 'test' });
    expect(first?.variant).toEqual({
      os: 'linux',
      arch: 'x64',
      vitestProject: undefined,
      browser: undefined,
      flagState: undefined,
    });
  });

  it('should reject an unknown schema, a line that is not JSON and a row with a bad field', () => {
    const good =
      readFileSync(resolve(import.meta.dirname, 'fixtures/flake-ledger/run-1001-attempt-1.outcomes.jsonl'), 'utf8')
        .split('\n')
        .at(0) ?? '';
    const parsed = parseOutcomes(
      [
        good,
        good.replace('"schema":1', '"schema":2'),
        '{not json',
        good.replace('"state":"failed"', '"state":"broken"'),
        good.replace('"run":1001', '"run":"1001"'),
        '[1]',
      ].join('\n'),
      'x',
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.problems).toEqual([
      'x:2: unknown schema 2',
      'x:3: not JSON',
      'x:4: invalid state',
      'x:5: invalid run',
      'x:6: not an object',
    ]);
  });
});

describe('variantKey', () => {
  it('should name the platform, then the browser or Vitest project and the flag state', () => {
    expect(variantKey({ os: 'linux', arch: 'x64' })).toBe('linux-x64');
    expect(variantKey({ os: 'linux', arch: 'x64', vitestProject: 'firefox', browser: 'firefox' })).toBe(
      'linux-x64 browser=firefox',
    );
    expect(variantKey({ os: 'darwin', arch: 'arm64', vitestProject: 'chat', flagState: 'on' })).toBe(
      'darwin-arm64 project=chat flags=on',
    );
  });
});

describe('ingestRun', () => {
  const run1 = queueRun({ id: 1001, pr: 10, base: sha(1), head: sha(2), at: '2026-11-24T10:00:00Z' });

  it('should count the run attempt own rows once, and a cache replay not at all', () => {
    const state = emptyState(now);
    const result = ingestRun(state, { run: run1, rows: fixture('run-1001-attempt-1'), artifacts: 1, rejected: 0 });
    // A, B and C are this attempt's tests; the run-900 row is a cache replay; the module row counts for its task.
    expect(result.record).toMatchObject({ run: 1001, attempt: 1, counted: 3, replayed: 1, lineage: 'pr-10' });
    // A failed and C retried, so they are tracked; B only passed, so only its task counts it.
    expect(Object.keys(state.identities).sort()).toEqual([A, C]);
    expect(state.tasks['host:test']).toMatchObject({ tests: 3, failures: 1, otherFailures: 1 });
    expect(identity(state, A)).toMatchObject({ executions: 1, failures: 1, passStreak: 0 });
    expect(identity(state, A).openFailures).toHaveLength(1);
    expect(isIngested(state, 1001, 1)).toBe(true);
    expect(isIngested(state, 1001, 2)).toBe(false);
  });

  it('should record a retried pass inside one task as a retry event', () => {
    const state = emptyState(now);
    const { events } = ingestRun(state, { run: run1, rows: fixture('run-1001-attempt-1'), artifacts: 1, rejected: 0 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: C,
      event: { kind: 'retry', run: 1001, failedRun: 1001, variant: 'linux-x64', execution: 1 },
    });
    expect(identity(state, C)).toMatchObject({ executions: 1, failures: 0, retriedPasses: 1 });
  });

  it('should pair a failure with a pass on the same hash in a later attempt, counting the earlier attempt once', () => {
    const state = emptyState(now);
    ingestRun(state, { run: run1, rows: fixture('run-1001-attempt-1'), artifacts: 1, rejected: 0 });
    const rerun = { ...run1, run_attempt: 2, updated_at: '2026-11-24T10:30:00Z' };
    // The re-run's artifacts hold attempt 2's rows and attempt 1's again: only attempt 2's (A) are counted.
    const result = ingestRun(state, {
      run: rerun,
      rows: [...fixture('run-1001-attempt-1'), ...fixture('run-1001-attempt-2')],
      artifacts: 2,
      rejected: 0,
    });
    expect(result.record).toMatchObject({ attempt: 2, counted: 1 });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: A,
      event: {
        kind: 'same-hash',
        run: 1001,
        attempt: 2,
        failedRun: 1001,
        failedAttempt: 1,
        hash: '111',
        execution: 1,
        error: 'AssertionError: expected 1 to be 2',
      },
    });
    expect(identity(state, A)).toMatchObject({ executions: 2, failures: 1, passStreak: 1, openFailures: [] });
    expect(isIngested(state, 1001, 2)).toBe(true);
  });

  it('should pair both attempts when one ingestion reads them together', () => {
    const state = emptyState(now);
    const { events } = ingestRun(state, {
      run: { ...run1, run_attempt: 2 },
      rows: [...fixture('run-1001-attempt-2'), ...fixture('run-1001-attempt-1')],
      artifacts: 2,
      rejected: 0,
    });
    expect(events.map(({ id, event }) => [id, event.kind])).toEqual([
      [C, 'retry'],
      [A, 'same-hash'],
    ]);
  });

  it('should pair a failure that follows a pass on the same hash once the test is tracked', () => {
    const state = emptyState(now);
    ingestRun(state, {
      run: pushRun(1, sha(1), '2026-11-24T01:00:00Z'),
      rows: [row({ id: A, run: 1, state: 'failed', hash: 'h1' })],
      artifacts: 1,
      rejected: 0,
    });
    ingestRun(state, {
      run: pushRun(2, sha(2), '2026-11-24T02:00:00Z'),
      rows: [row({ id: A, run: 2, hash: 'h2' })],
      artifacts: 1,
      rejected: 0,
    });
    const { events } = ingestRun(state, {
      run: pushRun(3, sha(3), '2026-11-24T03:00:00Z'),
      rows: [row({ id: A, run: 3, state: 'failed', hash: 'h2' })],
      artifacts: 1,
      rejected: 0,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: A, event: { kind: 'same-hash', run: 3, execution: 3 } });
  });

  it('should not pair a failure and a pass of one hash on different variants', () => {
    const state = emptyState(now);
    const firefox = { os: 'linux', arch: 'x64', vitestProject: 'firefox', browser: 'firefox' };
    const chromium = { os: 'linux', arch: 'x64', vitestProject: 'chromium', browser: 'chromium' };
    const { events } = ingestRun(state, {
      run: pushRun(1, sha(1), '2026-11-24T01:00:00Z'),
      rows: [row({ id: A, run: 1, state: 'failed', variant: firefox }), row({ id: A, run: 1, variant: chromium })],
      artifacts: 1,
      rejected: 0,
    });
    expect(events).toEqual([]);
    expect(Object.keys(identity(state, A).variants).sort()).toEqual([
      'linux-x64 browser=chromium',
      'linux-x64 browser=firefox',
    ]);
  });

  it('should never call a test that fails every execution of a hash a flake', () => {
    const state = emptyState(now);
    const { events } = ingestRun(state, {
      run: { ...run1, run_attempt: 2 },
      rows: [
        row({ id: A, run: 1001, attempt: 1, state: 'failed' }),
        row({ id: A, run: 1001, attempt: 2, state: 'failed' }),
      ],
      artifacts: 1,
      rejected: 0,
    });
    expect(events).toEqual([]);
    expect(identity(state, A)).toMatchObject({ executions: 2, failures: 2 });
  });
});

describe('lineage pairs', () => {
  const failing = queueRun({ id: 1, pr: 10, base: sha(1), head: sha(2), at: '2026-11-24T01:00:00Z' });
  const passing = queueRun({ id: 2, pr: 10, base: sha(3), head: sha(4), at: '2026-11-24T02:00:00Z' });

  const candidateOf = (state: LedgerState) => {
    ingestRun(state, {
      run: failing,
      rows: [row({ id: A, run: 1, state: 'failed', hash: 'h1' })],
      artifacts: 1,
      rejected: 0,
    });
    const { candidates, events } = ingestRun(state, {
      run: passing,
      rows: [row({ id: A, run: 2, hash: 'h2' })],
      artifacts: 1,
      rejected: 0,
    });
    expect(events).toEqual([]);
    expect(candidates).toHaveLength(1);
    const [candidate] = candidates;
    if (!candidate) {
      throw new Error('no lineage candidate');
    }
    return candidate;
  };

  it('should propose the next passing run of the same pull request and record it once the diff matches', () => {
    const state = emptyState(now);
    const candidate = candidateOf(state);
    expect(candidate.failure).toMatchObject({ run: 1, lineage: 'pr-10', base: sha(1), sha: sha(2) });
    expect(candidate.pass).toMatchObject({ run: 2, kind: 'queue', base: sha(3), sha: sha(4) });
    expect(identity(state, A).openFailures).toEqual([]);
    const diff = [{ filename: 'packages/host/src/a.ts', sha: 'abc' }];
    expect(
      lineageConfirmed(candidate, { failed: diff, passed: [{ filename: 'packages/host/src/a.ts', sha: 'def' }] }),
    ).toBe(false);
    expect(lineageConfirmed(candidate, { failed: diff })).toBeUndefined();
    expect(lineageConfirmed(candidate, { failed: diff, passed: [...diff] })).toBe(true);
    expect(isInherited(state, candidate)).toBe(false);
    expect(confirmLineage(state, candidate)).toMatchObject({ kind: 'lineage', run: 2, failedRun: 1, execution: 1 });
    expect(identity(state, A).events).toHaveLength(1);
  });

  it('should leave a failure the group ahead also had to that group', () => {
    const state = emptyState(now);
    ingestRun(state, {
      run: queueRun({ id: 0, pr: 9, base: sha(0), head: sha(1), at: '2026-11-24T00:30:00Z' }),
      rows: [row({ id: A, run: 0, state: 'failed', hash: 'h0' })],
      artifacts: 1,
      rejected: 0,
    });
    expect(isInherited(state, candidateOf(state))).toBe(true);
  });

  it('should confirm a push pair only when the commits between leave the test file alone', () => {
    const state = emptyState(now);
    ingestRun(state, {
      run: pushRun(1, sha(1), '2026-11-24T01:00:00Z'),
      rows: [row({ id: A, run: 1, state: 'failed', hash: 'h1' })],
      artifacts: 1,
      rejected: 0,
    });
    const { candidates } = ingestRun(state, {
      run: pushRun(2, sha(2), '2026-11-24T02:00:00Z'),
      rows: [row({ id: A, run: 2, hash: 'h2' })],
      artifacts: 1,
      rejected: 0,
    });
    const [candidate] = candidates;
    expect(candidate?.pass.kind).toBe('push');
    if (!candidate) {
      return;
    }
    expect(lineageConfirmed(candidate, { between: [{ filename: 'packages/host/src/a.test.ts' }] })).toBe(false);
    expect(lineageConfirmed(candidate, { between: [{ filename: 'packages/host/src/other.ts' }] })).toBe(true);
  });
});

describe('aliases', () => {
  const OLD = 'api › src/session.test.ts > session > should expire';
  const NEW = 'api › src/session.test.ts > session > should expire an idle session';
  const aliases = [{ from: OLD, to: NEW }];
  const before = fixture('rename-before');
  const after = fixture('rename-after');

  const ingestBefore = (state: LedgerState): void => {
    ingestRun(state, { run: pushRun(2001, sha(1), '2026-11-20T01:00:00Z'), rows: before, artifacts: 1, rejected: 0 });
    ingestRun(state, { run: pushRun(2002, sha(2), '2026-11-20T02:00:00Z'), rows: before, artifacts: 1, rejected: 0 });
  };

  it('should keep a renamed test history under its new identity', () => {
    const state = emptyState(now);
    ingestBefore(state);
    expect(identity(state, OLD)).toMatchObject({ executions: 2, failures: 1 });
    expect(identity(state, OLD).events).toHaveLength(1);
    expect(applyAliases(state, aliases)).toEqual([OLD]);
    ingestRun(state, {
      run: pushRun(2003, sha(3), '2026-11-21T01:00:00Z'),
      rows: after,
      artifacts: 1,
      rejected: 0,
      aliases,
    });
    expect(state.identities[OLD]).toBeUndefined();
    const renamed = identity(state, NEW);
    expect(renamed).toMatchObject({
      executions: 4,
      failures: 2,
      firstSeen: '2026-11-20T01:00:00Z',
      lastSeen: '2026-11-21T01:00:00Z',
      aliases: [OLD],
    });
    expect(renamed.events.map((event) => [event.kind, event.run, event.execution])).toEqual([
      ['same-hash', 2002, 1],
      ['same-hash', 2003, 3],
    ]);
    expect(meetsEntryRule(renamed)).toBe(true);
  });

  it('should fold histories recorded under both names, the older first', () => {
    const state = emptyState(now);
    ingestBefore(state);
    ingestRun(state, { run: pushRun(2003, sha(3), '2026-11-21T01:00:00Z'), rows: after, artifacts: 1, rejected: 0 });
    expect(identity(state, NEW).events).toHaveLength(1);
    expect(meetsEntryRule(identity(state, NEW))).toBe(false);
    applyAliases(state, aliases);
    const renamed = identity(state, NEW);
    expect(renamed.executions).toBe(4);
    expect(renamed.events.map((event) => event.execution)).toEqual([1, 3]);
    expect(meetsEntryRule(renamed)).toBe(true);
  });

  it('should follow a chain of renames and reject a cycle, a self alias and a duplicate', () => {
    const state = emptyState(now);
    ingestBefore(state);
    applyAliases(state, [
      { from: OLD, to: 'middle' },
      { from: 'middle', to: NEW },
    ]);
    expect(Object.keys(state.identities)).toEqual([NEW]);
    expect(aliasProblems([{ from: 'a', to: 'b' }])).toEqual([]);
    expect(aliasProblems([{ from: 'a', to: 'a' }])).toEqual(['flake-ledger.json alias "a": points to itself']);
    expect(
      aliasProblems([
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ]),
    ).toEqual(['flake-ledger.json alias "a": listed twice']);
    expect(
      aliasProblems([
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ]),
    ).toHaveLength(2);
    expect(ledgerProblems({ entries: [], aliases: [{ from: '', to: 'b' }] })).toEqual([
      'flake-ledger.json alias "": from and to must name a test',
    ]);
  });
});

describe('the entry rule', () => {
  const withEvents = (executions: number, at: readonly number[]): IdentityState => ({
    project: 'host',
    targetKey: 'test',
    firstSeen: '2026-11-01T00:00:00Z',
    lastSeen: '2026-11-24T00:00:00Z',
    lastFailure: '2026-11-24T00:00:00Z',
    executions,
    failures: at.length,
    retriedPasses: 0,
    passStreak: 0,
    variants: {},
    events: at.map((execution) => ({
      kind: 'same-hash',
      at: '2026-11-24T00:00:00Z',
      run: execution,
      attempt: 1,
      failedRun: execution,
      failedAttempt: 1,
      variant: 'linux-x64',
      execution,
    })),
    openFailures: [],
    passHashes: [],
    failureShas: [],
    aliases: [],
  });

  it('should fire on two events in the last 80 executions or three in the last 230', () => {
    expect(meetsEntryRule(withEvents(100, [15, 90]))).toBe(false);
    expect(meetsEntryRule(withEvents(100, [21, 90]))).toBe(true);
    expect(eventsInLast(withEvents(300, [80, 150, 290]), 230)).toBe(3);
    expect(meetsEntryRule(withEvents(300, [80, 150, 290]))).toBe(true);
    expect(meetsEntryRule(withEvents(300, [60, 150, 290]))).toBe(false);
    expect(meetsEntryRule(withEvents(1, [1]))).toBe(false);
  });
});

describe('state documents', () => {
  it('should round-trip, refuse an unknown schema and drop what has aged out', () => {
    const state = emptyState(now);
    ingestRun(state, {
      run: queueRun({ id: 1001, pr: 10, base: sha(1), head: sha(2), at: '2026-11-24T10:00:00Z' }),
      rows: fixture('run-1001-attempt-1'),
      artifacts: 1,
      rejected: 0,
    });
    ingestRun(state, {
      run: pushRun(5, sha(5), '2026-07-01T00:00:00Z'),
      rows: [row({ id: B, run: 5, state: 'failed' })],
      artifacts: 1,
      rejected: 0,
    });
    const text = serializeState(state);
    expect(parseState(text)).toEqual(JSON.parse(text));
    expect(text).not.toContain('null');
    expect(() => parseState('{"schema":2}')).toThrow('unknown schema 2');
    expect(() => parseState('{"schema":1}')).toThrow('missing');
    pruneState(state, now);
    expect(state.ingested.map((entry) => entry.run)).toEqual([1001]);
    expect(Object.keys(state.identities).sort()).toEqual([A, C]);
  });

  it('should list the tests with an event in the window, most first, with escaped cells', () => {
    const state = emptyState(now);
    ingestRun(state, {
      run: {
        ...queueRun({ id: 1001, pr: 10, base: sha(1), head: sha(2), at: '2026-11-24T10:00:00Z' }),
        run_attempt: 2,
      },
      rows: [...fixture('run-1001-attempt-1'), ...fixture('run-1001-attempt-2')],
      artifacts: 2,
      rejected: 1,
    });
    ingestRun(state, {
      run: pushRun(7, sha(7), '2026-11-24T11:00:00Z'),
      rows: [row({ id: 'host › src/x.test.ts > a | b', run: 7, flaky: true })],
      artifacts: 1,
      rejected: 0,
    });
    const summary = summarizeLedger(state, { from: '2026-11-24T00:00:00Z', to: '2026-11-25T00:00:00Z' });
    expect(summary).toMatchObject({ runs: 2, events: 3, rejected: 1, tracked: 3 });
    expect(summary.rows.map((entry) => entry.id)).toEqual([A, C, 'host › src/x.test.ts > a | b']);
    const markdown = renderLedgerMarkdown(summary);
    expect(markdown).toContain('## Test flake ledger (FQ-2)');
    expect(markdown).toContain(String.raw`a \| b`);
    expect(markdown).toContain(`| ${A} | 0 / 1 / 0 | 1 | 2 | 1 | 0 | linux-x64 |`);
    expect(renderLedgerMarkdown(summarizeLedger(emptyState(now), summary.window))).toContain('No flake events');
  });
});
