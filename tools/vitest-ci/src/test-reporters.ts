/**
 * The reporter list every Tau Vitest config uses: `reporters: testReporters('verbose')`.
 *
 * The list keeps the config's own console reporter, adds `github-actions` on GitHub Actions (a failure becomes a
 * check-run annotation), adds the {@link OutcomeReporter}, whose file is a declared output of the test target, so a
 * cache replay restores the original run's rows, and ends with the {@link RetryPolicyReporter}, which reads that file
 * at the end of the run (testing policy § 16.2). A change to how every config reports is one change here.
 * {@link testRetry} is the `retry` every config sets beside it.
 *
 * The outcome recorder is imported through the package's own subpath, not a `#` alias, because the configs that
 * import this module are type-checked under other projects' compiler options, some with a `#*` path alias. The list
 * is typed with the recorder's own class, not Vitest's `Reporter`: a project whose Vitest resolves to another peer
 * variant (another `@types/node`) has a `Reporter` whose private members make the two types unrelated.
 */
import process from 'node:process';

import { OutcomeReporter } from '@taucad/vitest-ci/outcome-reporter';
import type { OutcomeEnvironment } from '@taucad/vitest-ci/outcome-reporter';
import { onCi, RetryPolicyReporter, retryBudget, underVerification } from '@taucad/vitest-ci/retry-policy';
import type { RetryEnvironment } from '@taucad/vitest-ci/retry-policy';
import type { BuiltinReporters } from 'vitest/node';

/**
 * The reporter list for a Tau Vitest config: the config's console reporter, `github-actions` on GitHub Actions,
 * the {@link OutcomeReporter} and the {@link RetryPolicyReporter}.
 *
 * @param base - The console reporter the config uses, `verbose` or `default` in Tau.
 * @param env - The environment to read `GITHUB_ACTIONS` from. Defaults to `process.env`.
 * @returns The value for `test.reporters`.
 *
 * @example <caption>A config that prints each test name</caption>
 * ```typescript
 * import { testReporters, testRetry } from '@taucad/vitest-ci';
 * import { defineConfig } from 'vitest/config';
 *
 * export default defineConfig({ test: { reporters: testReporters('verbose'), retry: testRetry() } });
 * ```
 * @public
 */
export const testReporters = (
  base: BuiltinReporters = 'default',
  env: OutcomeEnvironment = process.env,
): Array<BuiltinReporters | OutcomeReporter | RetryPolicyReporter> => {
  const outcome = new OutcomeReporter();
  return [
    base,
    ...(env['GITHUB_ACTIONS'] === 'true' ? (['github-actions'] as const) : []),
    outcome,
    new RetryPolicyReporter({ outcome }),
  ];
};

/**
 * The `retry` of a Tau Vitest config (RT-1): one in-process retry in CI, none locally or under the flake harness.
 *
 * @param env - The environment to read. Defaults to `process.env`.
 * @returns `1` on CI outside the flake harness, else `0`.
 *
 * @example <caption>Every config</caption>
 * ```typescript
 * import { testReporters, testRetry } from '@taucad/vitest-ci';
 * import { defineConfig } from 'vitest/config';
 *
 * export default defineConfig({ test: { reporters: testReporters('verbose'), retry: testRetry() } });
 * ```
 * @public
 */
export const testRetry = (env: RetryEnvironment = process.env): number =>
  onCi(env) && !underVerification(env) ? retryBudget.retries : 0;
