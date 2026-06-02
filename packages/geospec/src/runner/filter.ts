import type { GeoSpecTestCase } from '#runner/types.js';

const fullTestName = (test: Pick<GeoSpecTestCase, 'suite' | 'name'>): string => [...test.suite, test.name].join(' > ');

/**
 * Return true when a collected GeoSpec test matches the supplied test-name
 * pattern. Patterns are case-insensitive substrings, matching Vitest's most
 * common `-t` usage without exposing JavaScript RegExp edge cases through the
 * agent-facing API.
 *
 * @internal
 *
 * @param test - collected test metadata.
 * @param testNamePattern - optional case-insensitive substring.
 * @returns whether the test should be included.
 */
export const matchesGeoSpecTestName = (
  test: Pick<GeoSpecTestCase, 'suite' | 'name'>,
  testNamePattern: string | undefined,
): boolean => {
  const normalizedPattern = testNamePattern?.trim().toLowerCase();
  if (!normalizedPattern) {
    return true;
  }

  return fullTestName(test).toLowerCase().includes(normalizedPattern);
};

/**
 * Filter collected GeoSpec tests by test-name pattern.
 *
 * @internal
 *
 * @param tests - collected tests.
 * @param testNamePattern - optional case-insensitive substring.
 * @returns tests that match the filter.
 */
export const filterGeoSpecTests = (
  tests: readonly GeoSpecTestCase[],
  testNamePattern: string | undefined,
): GeoSpecTestCase[] => tests.filter((test) => matchesGeoSpecTestName(test, testNamePattern));
