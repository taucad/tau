import { describe, expect, it } from 'vitest';
import { creditStandingOf, formatWholeCredits } from '#hooks/use-credit-standing.js';

const facts = {
  availableAtoms: '0',
  minimumHoldAtoms: { cheap: '5000', premium: '300000' },
  autoReloadEnabled: false,
  creditsPerUsd: 100,
};

describe('creditStandingOf', () => {
  it('should read a zero balance as empty, covering no route', () => {
    const standing = creditStandingOf(facts);

    expect(standing?.isEmpty).toBe(true);
    expect(standing?.coversAnyRoute).toBe(false);
    expect(standing?.covers('cheap')).toBe(false);
    expect(standing?.creditsPerUsd).toBe(100);
  });

  it('should cover the routes whose floor the balance meets', () => {
    const standing = creditStandingOf({ ...facts, availableAtoms: '5000' });

    expect(standing?.isEmpty).toBe(false);
    expect(standing?.covers('cheap')).toBe(true);
    expect(standing?.covers('premium')).toBe(false);
    expect(standing?.covers('unpublished')).toBeUndefined();
    expect(standing?.coversAnyRoute).toBe(true);
  });

  /* An unavailable balance must not read as zero, and automatic reload funds the turn at the server's refusal. */
  it.each([
    ['an unknown balance', { ...facts, availableAtoms: undefined }],
    ['automatic reload', { ...facts, autoReloadEnabled: true }],
    ['a malformed balance', { ...facts, availableAtoms: 'lots' }],
    ['no facts', undefined],
  ])('should say nothing for %s', (_case, credit) => {
    expect(creditStandingOf(credit)).toBeUndefined();
  });

  it('should format whole credits rounded down', () => {
    expect(formatWholeCredits(10_009_999n)).toBe('1,000');
  });
});
