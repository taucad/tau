// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkKclFixture, kclFixtureCases, kclFixtureTimeout } from '#testing/kcl-fixture-suite.test-utils.js';

describe('offline KCL: kcl-lib simulation tests', () => {
  it.each(kclFixtureCases('simulation'))(
    '%s',
    async (_path, fixture) => {
      expect(await checkKclFixture(fixture)).toEqual([]);
    },
    kclFixtureTimeout,
  );
});
