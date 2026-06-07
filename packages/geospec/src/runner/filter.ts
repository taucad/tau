import type { GeoSpecTestCase } from '#runner/types.js';
import type { VmIssue } from '@taucad/vm';

const fullTestName = (test: Pick<GeoSpecTestCase, 'suite' | 'name'>): string => [...test.suite, test.name].join(' > ');

/**
 * Compiled Vitest-style test-name pattern used by a GeoSpec run.
 *
 * @public
 */
export type GeoSpecTestNamePattern = RegExp;

/**
 * Compile a Vitest-style test-name pattern once for a GeoSpec run.
 *
 * String inputs are JavaScript regular expression sources matched against the
 * full `suite > test` name. `RegExp` inputs are used as-is.
 *
 * @param testNamePattern - Optional regex source or precompiled expression.
 * @returns A compiled pattern or a structured issue when the source is invalid.
 *
 * @public
 */
export const compileGeoSpecTestNamePattern = (
  testNamePattern: string | RegExp | undefined,
): { success: true; pattern?: GeoSpecTestNamePattern } | { success: false; issue: VmIssue } => {
  if (testNamePattern === undefined || (typeof testNamePattern === 'string' && testNamePattern.trim() === '')) {
    return { success: true };
  }
  if (testNamePattern instanceof RegExp) {
    return { success: true, pattern: testNamePattern };
  }

  try {
    return { success: true, pattern: new RegExp(testNamePattern, 'u') };
  } catch (error) {
    return {
      success: false,
      issue: {
        code: 'INVALID_GEOSPEC_TEST_NAME_PATTERN',
        message: 'testNamePattern is not a valid JavaScript regular expression.',
        severity: 'error',
        type: 'runtime',
        details: {
          testNamePattern,
          reason: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
};

/**
 * Return true when a collected GeoSpec test matches the supplied compiled
 * Vitest-style test-name pattern.
 *
 * @public
 *
 * @param test - collected test metadata.
 * @param testNamePattern - optional compiled regex.
 * @returns whether the test should be included.
 */
export const matchesGeoSpecTestName = (
  test: Pick<GeoSpecTestCase, 'suite' | 'name'>,
  testNamePattern: GeoSpecTestNamePattern | undefined,
): boolean => {
  if (!testNamePattern) {
    return true;
  }

  testNamePattern.lastIndex = 0;
  return testNamePattern.test(fullTestName(test));
};

/**
 * Filter collected GeoSpec tests by compiled test-name pattern.
 *
 * @public
 *
 * @param tests - collected tests.
 * @param testNamePattern - optional compiled regex.
 * @returns tests that match the filter.
 */
export const filterGeoSpecTests = (
  tests: readonly GeoSpecTestCase[],
  testNamePattern: GeoSpecTestNamePattern | undefined,
): GeoSpecTestCase[] => tests.filter((test) => matchesGeoSpecTestName(test, testNamePattern));
