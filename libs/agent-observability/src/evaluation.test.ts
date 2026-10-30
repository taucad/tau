import { describe, expect, it } from 'vitest';
import type { CheckReading, CorpusCandidate, EvaluatorVersion, Judgement } from '#evaluation.js';
import { calibrate, checkReference, corpusEligibility } from '#evaluation.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');
const later = at + 86_400_000;
const source = (change: Partial<CorpusCandidate['lineage'][number]> = {}): CorpusCandidate['lineage'][number] => ({
  source: 'source-1',
  digest: `sha256:${'a'.repeat(64)}`,
  protection: 'free',
  rights: 'verified',
  expiresAt: later,
  proof: null,
  ...change,
});
const candidate = (change: Partial<CorpusCandidate> = {}): CorpusCandidate => ({
  origin: 'customer',
  lineage: [source()],
  reuse: 'allowed',
  ...change,
});

describe('corpusEligibility', () => {
  it('admits verified Free material whose account allows reuse now, and synthetic or operator cases without one', () => {
    expect(corpusEligibility(candidate(), at)).toEqual({ eligible: true });
    expect(corpusEligibility(candidate({ origin: 'synthetic', reuse: 'unknown' }), at)).toEqual({ eligible: true });
    expect(corpusEligibility(candidate({ origin: 'operator', reuse: 'denied' }), at)).toEqual({ eligible: true });
  });

  it('refuses Pro anywhere in the lineage, whatever the origin, the reuse purpose or another refusal', () => {
    for (const origin of ['customer', 'synthetic', 'operator'] as const) {
      expect(
        corpusEligibility(
          candidate({ origin, lineage: [source(), source({ protection: 'pro', rights: 'unknown' })] }),
          at,
        ),
      ).toEqual({ eligible: false, refusal: 'pro-protected' });
    }
  });

  it('refuses lineage it cannot establish, and a source that expired or withdrew reuse since it was chosen', () => {
    const cases: Array<[CorpusCandidate, string]> = [
      [candidate({ lineage: [] }), 'lineage-missing'],
      [candidate({ lineage: [source(), source({ protection: 'unknown' })] }), 'protection-unknown'],
      [candidate({ lineage: [source({ rights: 'unknown' })] }), 'rights-unverified'],
      [candidate({ lineage: [source({ rights: 'denied' })] }), 'rights-unverified'],
      [candidate({ lineage: [source({ expiresAt: at })] }), 'expired'],
      [candidate({ reuse: 'denied' }), 'reuse-not-allowed'],
      [candidate({ reuse: 'unknown' }), 'reuse-not-allowed'],
    ];
    for (const [offered, refusal] of cases) {
      expect(corpusEligibility(offered, at)).toEqual({ eligible: false, refusal });
    }
    expect(corpusEligibility(candidate(), later)).toEqual({ eligible: false, refusal: 'expired' });
  });
});

const judge: EvaluatorVersion = { prompt: 'prompt-1', model: 'judge-model-1', rubric: 'rubric-1', parser: 'parser-1' };
const judged = (
  id: string,
  [verdict, reference]: [Judgement['verdict'], Judgement['reference']],
  change: Partial<Judgement> = {},
): Judgement => ({
  case: id,
  cohort: 'cad',
  evaluator: judge,
  verdict,
  reference,
  referenceSource: reference === 'unknown' ? 'none' : 'deterministic',
  ...change,
});

describe('calibrate', () => {
  it('measures agreement, false success, false failure and abstention against deterministic and expert references', () => {
    const [calibration] = calibrate([
      judged('c1', ['pass', 'pass']),
      judged('c2', ['pass', 'pass'], { referenceSource: 'expert' }),
      judged('c3', ['fail', 'pass']),
      judged('c4', ['pass', 'fail']),
      judged('c5', ['fail', 'fail'], { referenceSource: 'expert' }),
      judged('c6', ['abstain', 'fail']),
      judged('c7', ['pass', 'unknown']),
      judged('c1', ['pass', 'pass']),
    ]);

    expect(calibration).toEqual({
      evaluator: judge,
      cohort: 'cad',
      judged: 7,
      abstained: 1,
      measured: 5,
      unreferenced: 1,
      conflicted: 0,
      bySource: { deterministic: 3, expert: 2 },
      agreement: 3 / 5,
      falseSuccess: 1 / 2,
      falseFailure: 1 / 3,
      abstention: 1 / 7,
    });
  });

  it('keeps each evaluator version and cohort apart, and a case judged both ways out of every rate', () => {
    const revised = { ...judge, rubric: 'rubric-2' };
    const calibrations = calibrate([
      judged('c1', ['pass', 'pass']),
      judged('c1', ['fail', 'pass']),
      judged('c2', ['fail', 'fail']),
      judged('c1', ['fail', 'pass'], { evaluator: revised }),
      judged('c1', ['pass', 'pass'], { cohort: 'chat' }),
    ]);

    expect(
      calibrations.map(({ evaluator, cohort, judged, conflicted, agreement }) => [
        evaluator.rubric,
        cohort,
        judged,
        conflicted,
        agreement,
      ]),
    ).toEqual([
      ['rubric-1', 'cad', 1, 1, 1],
      ['rubric-2', 'cad', 1, 0, 0],
      ['rubric-1', 'chat', 1, 0, 1],
    ]);
  });

  it('reports a rate with nothing to measure it against as undefined, never zero', () => {
    const [calibration] = calibrate([judged('c1', ['abstain', 'unknown']), judged('c2', ['pass', 'unknown'])]);

    expect(calibration).toMatchObject({
      judged: 2,
      measured: 0,
      agreement: undefined,
      falseSuccess: undefined,
      falseFailure: undefined,
      abstention: 1 / 2,
    });
    expect(calibrate([])).toEqual([]);
  });
});

const check = (
  at: number,
  [requirement, result]: [string, CheckReading['result']],
  revision = 'revision-2',
): CheckReading => ({ at, revision, requirement, result });

describe('checkReference', () => {
  it('passes only when every requirement passed at the last revision checked, and fails on any failure there', () => {
    expect(checkReference([check(1, ['fit', 'passed']), check(2, ['mass', 'passed'])])).toBe('pass');
    expect(checkReference([check(1, ['fit', 'passed']), check(2, ['mass', 'failed'])])).toBe('fail');
    expect(checkReference([check(2, ['fit', 'passed']), check(1, ['fit', 'failed'])])).toBe('pass');
    expect(
      checkReference([
        check(1, ['fit', 'failed'], 'revision-1'),
        check(2, ['fit', 'passed']),
        check(3, ['mass', 'passed']),
      ]),
    ).toBe('pass');
    expect(checkReference([check(1, ['fit', 'passed']), check(2, ['fit', 'failed'], 'revision-3')])).toBe('fail');
  });

  it('keeps inconclusive, unsupported and unrun checks distinct from a pass, and no checks unknown', () => {
    for (const result of ['inconclusive', 'unsupported', 'not-run'] as const) {
      expect(checkReference([check(1, ['fit', 'passed']), check(2, ['mass', result])])).toBe('unknown');
      expect(checkReference([check(1, ['fit', 'failed']), check(2, ['mass', result])])).toBe('fail');
    }
    expect(checkReference([])).toBe('unknown');
  });

  it("measures a judge that accepts the assistant's claimed success against the checks, not the claim", () => {
    const reference = checkReference([check(1, ['fit', 'failed'])]);
    const [calibration] = calibrate([
      judged('c1', ['pass', reference]),
      judged('c2', ['pass', checkReference([check(1, ['fit', 'passed'])])]),
    ]);

    expect(calibration).toMatchObject({ measured: 2, agreement: 1 / 2, falseSuccess: 1, falseFailure: 0 });
  });
});
