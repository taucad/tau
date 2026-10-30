// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkKclFixture, kclFixtureCases, kclFixtureTimeout } from '#testing/kcl-fixture-suite.test-utils.js';

describe('offline KCL: Zoo samples and Tau fixtures', () => {
  it.each(kclFixtureCases('samples', 'tau'))(
    '%s',
    async (_path, fixture) => {
      expect(await checkKclFixture(fixture)).toEqual([]);
    },
    kclFixtureTimeout,
  );
});
