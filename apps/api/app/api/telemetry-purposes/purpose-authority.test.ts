import { describe, expect, it } from 'vitest';
import type { PurposeAuthorityInput, RecordedPurposeDecision } from '#api/telemetry-purposes/purpose-authority.js';
import { purposeEpoch, resolvePurposeAuthority } from '#api/telemetry-purposes/purpose-authority.js';
import type { PurposeRefusal, TelemetryPurpose } from '#api/telemetry-purposes/telemetry-purpose.schema.js';
import { telemetryPurposes } from '#api/telemetry-purposes/telemetry-purpose.schema.js';

const notice = 'observability-notice-2026-10-29';
const superseded = 'observability-notice-2026-09-01';

let sequence = 0;
const decided = (purpose: TelemetryPurpose, granted: boolean, version = notice): RecordedPurposeDecision => ({
  purpose,
  granted,
  noticeVersion: version,
  sequence: ++sequence,
});

const authority = (overrides: Partial<PurposeAuthorityInput> = {}): PurposeAuthorityInput => ({
  noticeVersion: notice,
  decisions: [],
  tier: 'free',
  tierAssured: true,
  ...overrides,
});

const allowed = (input: PurposeAuthorityInput): TelemetryPurpose[] =>
  resolvePurposeAuthority(input)
    .filter((state) => state.allowed)
    .map((state) => state.purpose);

const refusalOf = (input: PurposeAuthorityInput, purpose: TelemetryPurpose): PurposeRefusal | undefined =>
  resolvePurposeAuthority(input).find((state) => state.purpose === purpose)?.refusal;

describe('resolvePurposeAuthority', () => {
  it('denies every purpose for an account that has decided nothing', () => {
    const states = resolvePurposeAuthority(authority());

    expect(states.map((state) => state.purpose)).toEqual([...telemetryPurposes]);
    expect(states.every((state) => !state.allowed && !state.decided && !state.granted)).toBe(true);
    expect(states.every((state) => state.refusal === 'no-decision')).toBe(true);
  });

  it('keeps every purpose unavailable until an approved production notice is configured', () => {
    const states = resolvePurposeAuthority(
      authority({ noticeVersion: undefined, decisions: telemetryPurposes.map((purpose) => decided(purpose, true)) }),
    );

    expect(states.every((state) => state.refusal === 'notice-unapproved')).toBe(true);
    /* A grant taken against a notice that is no longer in force is not shown as a live decision. */
    expect(states.every((state) => !state.decided && !state.granted)).toBe(true);
  });

  it('decides each purpose independently, so a summary grant is not a content grant', () => {
    expect(allowed(authority({ decisions: [decided('summary', true)] }))).toEqual(['summary']);
    expect(refusalOf(authority({ decisions: [decided('summary', true)] }), 'content')).toBe('no-decision');
    expect(refusalOf(authority({ decisions: [decided('summary', true)] }), 'feedback')).toBe('no-decision');
    expect(allowed(authority({ decisions: [decided('feedback', true)] }))).toEqual(['feedback']);
  });

  it('refuses a decision taken against a superseded notice', () => {
    const input = authority({ decisions: [decided('content', true, superseded)] });

    expect(refusalOf(input, 'content')).toBe('notice-superseded');
    expect(allowed(input)).toEqual([]);
  });

  it('records a withdrawal distinctly from never having decided', () => {
    const input = authority({ decisions: [decided('content', false)] });
    const state = resolvePurposeAuthority(input).find((entry) => entry.purpose === 'content');

    expect(state).toMatchObject({ allowed: false, decided: true, granted: false, refusal: 'withdrawn' });
  });

  it('takes the account’s newest decision for a purpose', () => {
    const input = authority({
      decisions: [
        { purpose: 'summary', granted: true, noticeVersion: notice, sequence: 1 },
        { purpose: 'summary', granted: false, noticeVersion: notice, sequence: 2 },
      ],
    });

    expect(refusalOf(input, 'summary')).toBe('withdrawn');
  });

  describe('tier', () => {
    const granted = telemetryPurposes.map((purpose) => decided(purpose, true));

    it('excludes a paid tier from reuse and training however the account answered', () => {
      for (const tier of ['pro', 'enterprise'] as const) {
        const input = authority({ decisions: granted, tier });

        expect(allowed(input)).toEqual(['summary', 'feedback', 'content', 'diagnosis']);
        expect(refusalOf(input, 'reuse')).toBe('tier-excluded');
        expect(refusalOf(input, 'training')).toBe('tier-excluded');
      }
    });

    it('refuses reuse when the free tier is only the unrecognised-plan fallback', () => {
      const input = authority({ decisions: granted, tierAssured: false });

      /* Billing access semantics are unchanged: capture purposes still resolve
       * from the account's own decision. Only the reuse purposes need the
       * entitlement established affirmatively. */
      expect(allowed(input)).toEqual(['summary', 'feedback', 'content', 'diagnosis']);
      expect(refusalOf(input, 'reuse')).toBe('tier-unverified');
      expect(refusalOf(input, 'training')).toBe('tier-unverified');
    });

    it('allows reuse and training only for an assured free tier that granted them', () => {
      expect(allowed(authority({ decisions: granted }))).toEqual([...telemetryPurposes]);
    });

    it('withdraws reuse on upgrade and restores it on downgrade without touching the decisions', () => {
      expect(allowed(authority({ decisions: granted, tier: 'free' }))).toContain('reuse');
      expect(allowed(authority({ decisions: granted, tier: 'pro' }))).not.toContain('reuse');
      expect(allowed(authority({ decisions: granted, tier: 'free' }))).toContain('reuse');
    });
  });

  describe('project authority', () => {
    const granted = telemetryPurposes.map((purpose) => decided(purpose, true));
    const project = { fenced: false, ownedByPrincipal: true, mixedSource: false };

    it('refuses everything for a deletion-fenced project, ahead of every other check', () => {
      const input = authority({
        decisions: granted,
        project: { ...project, fenced: true, ownedByPrincipal: false },
      });

      expect(resolvePurposeAuthority(input).every((state) => state.refusal === 'project-fenced')).toBe(true);
    });

    it('refuses everything for a project the principal does not own', () => {
      const input = authority({ decisions: granted, project: { ...project, ownedByPrincipal: false } });

      expect(resolvePurposeAuthority(input).every((state) => state.refusal === 'project-not-owned')).toBe(true);
    });

    it('refuses content-bearing purposes when the project carries another account’s material', () => {
      const input = authority({ decisions: granted, project: { ...project, mixedSource: true } });

      /* Counts, timings and the account's own ratings stay available; prompts, designs and anything copied
       * out of them fail closed while the inherited protection is unknown. */
      expect(allowed(input)).toEqual(['summary', 'feedback']);
      for (const purpose of ['content', 'diagnosis', 'reuse', 'training'] as const) {
        expect(refusalOf(input, purpose)).toBe('project-mixed-source');
      }
    });

    it('allows the account’s grants for its own single-source project', () => {
      expect(allowed(authority({ decisions: granted, project }))).toEqual([...telemetryPurposes]);
    });
  });
});

describe('purposeEpoch', () => {
  const base = { userId: 'user-a', projectId: undefined, noticeVersion: notice, decisions: [] as const };

  it('separates principals, projects and notices', () => {
    const epoch = purposeEpoch(base);

    expect(purposeEpoch({ ...base, userId: 'user-b' })).not.toBe(epoch);
    expect(purposeEpoch({ ...base, projectId: 'project-a' })).not.toBe(epoch);
    expect(purposeEpoch({ ...base, noticeVersion: superseded })).not.toBe(epoch);
  });

  it('changes when a decision is recorded, so a cached answer is recognised as stale', () => {
    expect(purposeEpoch({ ...base, decisions: [decided('summary', true)] })).not.toBe(purposeEpoch(base));
  });
});
