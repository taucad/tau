import { describe, expect, it } from 'vitest';
import { geoSpecTimeoutCode, isGeoSpecTimeoutCode } from '#runner/timeout-codes.js';

describe('geoSpecTimeoutCode', () => {
  it('should name one code per wall-clock bound in the GEOSPEC_*_TIMEOUT family', () => {
    expect(geoSpecTimeoutCode).toStrictEqual({
      test: 'GEOSPEC_TEST_TIMEOUT',
      shard: 'GEOSPEC_SHARD_TIMEOUT',
      run: 'GEOSPEC_RUN_TIMEOUT',
    });
  });

  it.each([
    ['GEOSPEC_TEST_TIMEOUT', true],
    ['GEOSPEC_SHARD_TIMEOUT', true],
    ['GEOSPEC_RUN_TIMEOUT', true],
    ['MATCHER_TIMEOUT', false],
    ['TEST_FAILED', false],
  ])('should classify %s as a timeout code: %s', (code, expected) => {
    expect(isGeoSpecTimeoutCode(code)).toBe(expected);
  });
});
