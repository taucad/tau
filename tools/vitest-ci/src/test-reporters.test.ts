import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { OutcomeReporter } from '#outcome-reporter.js';
import { QuarantineVerdict } from '#quarantine-verdict.js';
import { RetryPolicyReporter } from '#retry-policy.js';
import { testReporters } from '#test-reporters.js';

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */

describe('testReporters', () => {
  it('adds github-actions on GitHub Actions and always ends with the recorder, the quarantine verdict and the retry policy', () => {
    const ci = testReporters('verbose', { GITHUB_ACTIONS: 'true' });
    expect(ci.slice(0, 2)).toEqual(['verbose', 'github-actions']);
    expect(ci[2]).toBeInstanceOf(OutcomeReporter);
    expect(ci[3]).toBeInstanceOf(QuarantineVerdict);
    expect(ci[4]).toBeInstanceOf(RetryPolicyReporter);
    expect(ci).toHaveLength(5);

    const local = testReporters('verbose', {});
    expect(local[0]).toBe('verbose');
    expect(local[1]).toBeInstanceOf(OutcomeReporter);
    expect(local[2]).toBeInstanceOf(QuarantineVerdict);
    expect(local[3]).toBeInstanceOf(RetryPolicyReporter);
    expect(local).toHaveLength(4);
  });

  it('defaults to the default console reporter and the process environment', () => {
    const reporters = testReporters();
    expect(reporters[0]).toBe('default');
    expect(reporters.at(-3)).toBeInstanceOf(OutcomeReporter);
    expect(reporters.at(-2)).toBeInstanceOf(QuarantineVerdict);
    expect(reporters.at(-1)).toBeInstanceOf(RetryPolicyReporter);
    expect(reporters).toHaveLength(process.env['GITHUB_ACTIONS'] === 'true' ? 5 : 4);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End wire names. */
