/**
 * The reporter list every Tau Vitest config uses: `reporters: testReporters('verbose')`.
 *
 * The list keeps the config's own console reporter, adds `github-actions` on GitHub Actions (a failure becomes a
 * check-run annotation) and adds the {@link OutcomeReporter}, whose file is a declared output of the test target, so a
 * cache replay restores the original run's rows. A change to how every config reports is one change here.
 *
 * The outcome recorder is imported through the package's own subpath, not a `#` alias, because the configs that
 * import this module are type-checked under other projects' compiler options, some with a `#*` path alias. The list
 * is typed with the recorder's own class, not Vitest's `Reporter`: a project whose Vitest resolves to another peer
 * variant (another `@types/node`) has a `Reporter` whose private members make the two types unrelated.
 */
import process from 'node:process';

import { OutcomeReporter } from '@taucad/vitest-ci/outcome-reporter';
import type { OutcomeEnvironment } from '@taucad/vitest-ci/outcome-reporter';
import type { BuiltinReporters } from 'vitest/node';

/**
 * The reporter list for a Tau Vitest config: the config's console reporter, `github-actions` on GitHub Actions,
 * and the {@link OutcomeReporter}.
 *
 * @param base - The console reporter the config uses, `verbose` or `default` in Tau.
 * @param env - The environment to read `GITHUB_ACTIONS` from. Defaults to `process.env`.
 * @returns The value for `test.reporters`.
 *
 * @example <caption>A config that prints each test name</caption>
 * ```typescript
 * import { testReporters } from '@taucad/vitest-ci';
 * import { defineConfig } from 'vitest/config';
 *
 * export default defineConfig({ test: { reporters: testReporters('verbose') } });
 * ```
 * @public
 */
export const testReporters = (
  base: BuiltinReporters = 'default',
  env: OutcomeEnvironment = process.env,
): Array<BuiltinReporters | OutcomeReporter> => [
  base,
  ...(env['GITHUB_ACTIONS'] === 'true' ? (['github-actions'] as const) : []),
  new OutcomeReporter(),
];
