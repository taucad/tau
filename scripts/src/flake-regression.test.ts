import { describe, expect, it } from 'vitest';

import { meetsEntryRule } from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IdentityState } from '#ci-flake-ledger-state.js';
import {
  commitSha,
  culpritCommit,
  oneOffId,
  ordinaryId,
  regressedId,
  seededLedger,
  stubProber,
} from '#fixtures/flake-regression/seeded-history.js';
import {
  bisectLimits,
  bisectMarker,
  bisectRecorded,
  bisectRegression,
  cleanAttempts,
  detectRegressions,
  identityMarker,
  isFlakyRegression,
  latestOnset,
  renderBisectComment,
  renderIssueBody,
  reproIdentity,
  stableExecutions,
  verdictOf,
} from '#flake-regression.js';

/** Commits 1 to `last` of the synthetic `main`, oldest first. */
const historyTo = (last: number, first = 1): string[] =>
  Array.from({ length: last - first + 1 }, (_, index) => commitSha(first + index));

const event = (execution: number, at = '2026-11-20T00:00:00.000Z'): FlakeEvent => ({
  kind: 'retry',
  at,
  run: execution,
  attempt: 1,
  failedRun: execution,
  failedAttempt: 1,
  variant: 'linux-x64',
  execution,
});

const identity = (events: FlakeEvent[], options: { executions: number; stableBefore?: number }): IdentityState => ({
  project: 'scripts',
  targetKey: 'test',
  file: 'src/a.test.ts',
  firstSeen: '2026-11-01T00:00:00.000Z',
  lastSeen: '2026-11-20T00:00:00.000Z',
  lastFailure: '2026-11-20T00:00:00.000Z',
  executions: options.executions,
  failures: 0,
  retriedPasses: events.length,
  passStreak: 0,
  variants: {},
  events,
  openFailures: [],
  passHashes: [],
  failureShas: [],
  aliases: [],
  ...(options.stableBefore === undefined ? {} : { stableBefore: options.stableBefore }),
});

describe('flaky-regression detection', () => {
  it('should count the executions of a test before the ledger first tracked it', () => {
    const state = seededLedger();
    expect(state.identities[regressedId]?.stableBefore).toBe(322);
    expect(state.identities[ordinaryId]?.stableBefore).toBe(299);
    expect(state.tasks['scripts:test']?.targets).toEqual({ 'test linux-x64': 340 });
  });

  it('should flag a test that flakes after 300 stable executions, and not an ordinary flake or a single event', () => {
    const state = seededLedger();
    const candidates = detectRegressions(state);
    expect(candidates.map((candidate) => candidate.id)).toEqual([regressedId]);
    expect(candidates[0]).toMatchObject({ stableBefore: 322, onset: { failedRun: 323 }, previous: undefined });
    expect(candidates[0]?.events.map((entry) => entry.failedRun)).toEqual([323, 331]);

    // The ordinary flake meets the entry rule too, and stays an ordinary flake (quarantine is FQ-6's).
    const ordinary = state.identities[ordinaryId];
    expect(ordinary && meetsEntryRule(ordinary)).toBe(true);
    expect(ordinary && isFlakyRegression(ordinary)).toBe(false);
    const oneOff = state.identities[oneOffId];
    expect(oneOff && meetsEntryRule(oneOff)).toBe(false);
    expect(oneOff && isFlakyRegression(oneOff)).toBe(false);
  });

  it('should measure the stable run from the event before it, and need at least 300', () => {
    const stable = identity([event(10), event(311), event(330)], { executions: 340, stableBefore: 0 });
    expect(latestOnset(stable)).toMatchObject({
      stableBefore: 300,
      onset: { execution: 311 },
      previous: { execution: 10 },
    });
    expect(isFlakyRegression(stable)).toBe(true);

    const short = identity([event(10), event(310), event(330)], { executions: 340, stableBefore: 0 });
    expect(latestOnset(short)).toBeUndefined();
    expect(isFlakyRegression(short)).toBe(false);
    expect(stableExecutions).toBe(300);
  });

  it('should treat a test first tracked before the baseline existed as having only its tracked history', () => {
    expect(latestOnset(identity([event(5), event(20)], { executions: 30 }))).toBeUndefined();
    expect(latestOnset(identity([event(301), event(320)], { executions: 330 }))).toMatchObject({ stableBefore: 300 });
    expect(latestOnset(identity([], { executions: 330 }))).toBeUndefined();
  });

  it('should map a ledger identity to the repro inputs', () => {
    const state = seededLedger();
    const regressed = state.identities[regressedId];
    expect(regressed && reproIdentity(regressedId, regressed, 'scripts')).toEqual({
      project: 'scripts',
      target: 'test',
      file: 'scripts/src/victim.test.ts',
      test: 'victim should settle the queue',
    });
    expect(regressed && reproIdentity(regressedId, regressed, '.')?.file).toBe('src/victim.test.ts');
    expect(regressed && reproIdentity('other › src/victim.test.ts > x', regressed, 'scripts')).toBeUndefined();
  });

  it('should tie one issue to one identity and recognise a bisect already done or still running', () => {
    expect(identityMarker(regressedId)).toMatch(/^<!-- flake-identity: [\da-f]{16} -->$/u);
    expect(identityMarker(regressedId)).not.toBe(identityMarker(ordinaryId));
    const now = new Date('2026-11-20T12:00:00.000Z');
    expect(bisectRecorded([bisectMarker(323, 'done', '2026-11-19T00:00:00.000Z')], 323, now)).toBe('done');
    expect(bisectRecorded([bisectMarker(323, 'started', '2026-11-20T10:00:00.000Z')], 323, now)).toBe('running');
    expect(bisectRecorded([bisectMarker(323, 'started', '2026-11-20T01:00:00.000Z')], 323, now)).toBeUndefined();
    expect(
      bisectRecorded([bisectMarker(400, 'done', '2026-11-19T00:00:00.000Z'), 'unrelated'], 323, now),
    ).toBeUndefined();
  });
});

describe('the bisect under stress', () => {
  it('should attribute a seeded regression to its commit when the last stable commit is clean', async () => {
    const { prober, requests } = stubProber({
      culprit: culpritCommit,
      rates: { 'cpu:stress': 0.3, 'repeat:alone': 0.05 },
    });
    const history = historyTo(330);
    const result = await bisectRegression({ history, good: 199, modes: 'repeat,cpu,parallel', prober });
    expect(result).toMatchObject({
      outcome: 'culprit',
      culprit: commitSha(culpritCommit),
      clean: commitSha(culpritCommit - 1),
      flaky: commitSha(culpritCommit),
      candidates: 1,
      introduced: false,
      mode: 'cpu:stress',
    });
    expect(result.probes.length).toBeLessThanOrEqual(bisectLimits.probes);
    expect(result.minutes).toBeLessThanOrEqual(bisectLimits.minutes);
    // The first probe runs every mode at the flaky commit; the rest run only the variant that reproduced best.
    expect(requests[0]).toMatchObject({ sha: commitSha(330), modes: 'repeat,cpu,parallel', attempts: 30 });
    expect(requests.slice(1).every((request) => request.modes === 'cpu:stress')).toBe(true);
    expect(requests.slice(1).every((request) => request.attempts === result.required)).toBe(true);
    expect(requests.every((request) => request.minutes <= bisectLimits.dispatchMinutes)).toBe(true);
  });

  it('should move the clean end back when the last stable commit already flakes', async () => {
    const { prober } = stubProber({ culprit: culpritCommit, rates: { 'repeat:alone': 0.4 } });
    const history = historyTo(323, 74);
    const result = await bisectRegression({ history, good: history.indexOf(commitSha(322)), modes: 'repeat', prober });
    expect(result).toMatchObject({ outcome: 'culprit', culprit: commitSha(culpritCommit), clean: commitSha(320) });
    expect(result.probes.map((probe) => [probe.sha, probe.verdict])).toEqual([
      [commitSha(323), 'flaky'],
      [commitSha(322), 'flaky'],
      [commitSha(321), 'flaky'],
      [commitSha(319), 'clean'],
      [commitSha(320), 'clean'],
    ]);
  });

  it('should name the commit that added a test that flaked from the start', async () => {
    const { prober } = stubProber({ culprit: 40, addedAt: 40, rates: { 'repeat:alone': 0.5 } });
    const result = await bisectRegression({ history: historyTo(60), good: 9, modes: 'repeat', prober });
    expect(result).toMatchObject({ outcome: 'culprit', culprit: commitSha(40), introduced: true });
    expect(result.probes.find((probe) => probe.sha === commitSha(39))?.verdict).toBe('absent');
  });

  it('should stop when the first flaky commit does not reproduce', async () => {
    const { prober, requests } = stubProber({ culprit: 1000, rates: {} });
    const result = await bisectRegression({ history: historyTo(60), good: 9, modes: 'repeat', prober });
    expect(result).toMatchObject({ outcome: 'not-reproduced', candidates: 0 });
    expect(result.culprit).toBeUndefined();
    expect(requests).toHaveLength(1);
  });

  it('should refuse a rate that needs more passes per clean verdict than a probe may run', async () => {
    const { prober, requests } = stubProber({ culprit: 1, rates: { 'repeat:alone': 0.02 } });
    const result = await bisectRegression({
      history: historyTo(60),
      good: 9,
      modes: 'repeat',
      prober,
      limits: { initialAttempts: 100, maximumCleanAttempts: 50 },
    });
    expect(result.outcome).toBe('rate-too-low');
    expect(result.required).toBeGreaterThan(50);
    expect(requests).toHaveLength(1);
  });

  it('should report the oldest commit of the window reproducing as unbracketed', async () => {
    const { prober } = stubProber({ culprit: 1, rates: { 'repeat:alone': 0.5 } });
    const result = await bisectRegression({ history: historyTo(20, 5), good: 14, modes: 'repeat', prober });
    expect(result).toMatchObject({ outcome: 'unbracketed', flaky: commitSha(5), clean: undefined });
  });

  it('should stop at the probe cap and report the narrowed range', async () => {
    const { prober, requests } = stubProber({ culprit: culpritCommit, rates: { 'repeat:alone': 0.5 } });
    const result = await bisectRegression({
      history: historyTo(330, 81),
      good: 0,
      modes: 'repeat',
      prober,
      limits: { probes: 4 },
    });
    expect(result.outcome).toBe('budget');
    expect(requests).toHaveLength(4);
    expect(result.candidates).toBeGreaterThan(1);
    expect(result.clean && Number.parseInt(result.clean, 16)).toBeLessThan(culpritCommit);
    expect(result.flaky && Number.parseInt(result.flaky, 16)).toBeGreaterThanOrEqual(culpritCommit);
  });

  it('should stop at the minute budget, giving each dispatch at most what is left', async () => {
    const { prober, requests } = stubProber({ culprit: culpritCommit, rates: { 'repeat:alone': 0.5 }, minutes: 110 });
    const result = await bisectRegression({ history: historyTo(330), good: 100, modes: 'repeat', prober });
    expect(result.outcome).toBe('budget');
    expect(requests.map((request) => request.minutes)).toEqual([120, 120, 80]);
    expect(result.minutes).toBe(300);
  });

  it('should stop at a probe that gives no report rather than guess', async () => {
    const { prober } = stubProber({ culprit: culpritCommit, rates: { 'repeat:alone': 0.5 }, broken: [322] });
    const result = await bisectRegression({ history: historyTo(330, 300), good: 0, modes: 'repeat', prober });
    expect(result.outcome).toBe('inconclusive');
    expect(result.probes.at(-1)).toMatchObject({
      sha: commitSha(322),
      verdict: 'inconclusive',
      error: 'no report (failure)',
    });
    const empty = stubProber({ culprit: 1, rates: {}, broken: [330] });
    const noReport = await bisectRegression({
      history: historyTo(330, 300),
      good: 0,
      modes: 'repeat',
      prober: empty.prober,
    });
    expect(noReport.outcome).toBe('inconclusive');
  });

  it('should refuse a last stable commit that is not before the flaky one', async () => {
    const { prober } = stubProber({ culprit: 1, rates: {} });
    await expect(bisectRegression({ history: historyTo(10), good: 9, modes: 'repeat', prober })).rejects.toThrow(
      'must come before the flaky one',
    );
  });

  it('should call a commit clean only after enough straight passes, and never count a crash as a flake', () => {
    expect(cleanAttempts(0, 30)).toBeUndefined();
    expect(cleanAttempts(30, 30)).toBe(bisectLimits.minimumCleanAttempts);
    expect(cleanAttempts(9, 30)).toBe(bisectLimits.minimumCleanAttempts);
    expect(cleanAttempts(3, 30)).toBe(44);
    expect(cleanAttempts(1, 100)).toBe(459);
    expect(verdictOf({ key: 'repeat:alone', outcomes: { passed: 43, failed: 0 } }, 44)).toBe('inconclusive');
    expect(verdictOf({ key: 'repeat:alone', outcomes: { passed: 44 } }, 44)).toBe('clean');
    expect(verdictOf({ key: 'repeat:alone', outcomes: { passed: 40, timeout: 1 } }, 44)).toBe('flaky');
    expect(verdictOf({ key: 'repeat:alone', outcomes: { error: 44 } }, 44)).toBe('inconclusive');
    expect(verdictOf({ key: 'repeat:alone', outcomes: { missing: 44 } }, 44)).toBe('absent');
    expect(verdictOf({ key: 'cpu:pinned', outcomes: {}, unavailable: 'no taskset' }, 44)).toBe('inconclusive');
    expect(verdictOf(undefined, 44)).toBe('inconclusive');
  });
});

describe('the issue text', () => {
  it('should open the issue with the identity marker, the stable run and that nothing is quarantined', () => {
    const [candidate] = detectRegressions(seededLedger());
    const body = candidate ? renderIssueBody(candidate, 'taucad/tau') : '';
    expect(body.startsWith(identityMarker(regressedId))).toBe(true);
    expect(body).toContain('After 322 executions without a flake event');
    expect(body).toContain('**not quarantined automatically**');
    expect(body).toContain('[323](https://github.com/taucad/tau/actions/runs/323)');
  });

  it('should name the culprit commit, its pull request and its author without notifying anyone', async () => {
    const { prober } = stubProber({ culprit: culpritCommit, rates: { 'repeat:alone': 0.4 } });
    const result = await bisectRegression({ history: historyTo(330, 200), good: 0, modes: 'repeat', prober });
    const comment = renderBisectComment({
      result,
      onsetRun: 323,
      culprit: { sha: commitSha(culpritCommit), title: 'feat(queue): Settle in batches (#4321)', author: 'octo' },
      repository: 'taucad/tau',
      now: new Date('2026-11-20T00:00:00.000Z'),
    });
    expect(comment.startsWith(bisectMarker(323, 'done', '2026-11-20T00:00:00.000Z'))).toBe(true);
    expect(comment).toContain(`### Flaky regression: culprit [${commitSha(culpritCommit).slice(0, 12)}]`);
    expect(comment).toContain('(#4321) by `octo`');
    expect(comment).toContain('It is not quarantined automatically.');
    expect(comment).not.toContain('@');
  });

  it('should report the narrowed range when there is no culprit', () => {
    const comment = renderBisectComment({
      result: {
        outcome: 'budget',
        clean: commitSha(100),
        flaky: commitSha(140),
        candidates: 40,
        introduced: false,
        probes: [],
        minutes: 300,
      },
      onsetRun: 323,
      repository: 'taucad/tau',
      now: new Date('2026-11-20T00:00:00.000Z'),
    });
    expect(comment).toContain('no culprit (the probe or minute budget ran out)');
    expect(comment).toContain('one of the 40 commits after');
  });
});
