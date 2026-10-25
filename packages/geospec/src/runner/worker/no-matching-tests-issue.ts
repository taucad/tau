import type { VmIssue } from '#vm/types.js';

/**
 * Create a run-level issue when filters select no tests.
 *
 * @returns A structured VM issue for empty GeoSpec filter selections.
 *
 * @public
 */
export const createNoMatchingGeoSpecTestsIssue = (): VmIssue => ({
  code: 'NO_MATCHING_GEOSPEC_TESTS',
  message: 'No matching GeoSpec tests were selected by the supplied filters.',
  severity: 'error',
  type: 'runtime',
});
