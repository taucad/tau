// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  checkKclFixture,
  kclFixtureCases,
  kclFixtureManifest,
  kclFixtureTimeout,
} from '#testing/kcl-fixture-suite.test-utils.js';

describe('offline KCL: standard library doc examples', () => {
  it('calls every standard library function from at least one fixture', () => {
    const called = new Set(kclFixtureManifest.fixtures.flatMap((fixture) => fixture.functions));
    const uncalled = Object.keys(kclFixtureManifest.functions).filter((name) => !called.has(name));
    expect(uncalled).toEqual([]);
    expect(kclFixtureManifest.uncovered).toEqual([]);
  });

  it.each(kclFixtureCases('examples'))(
    '%s',
    async (_path, fixture) => {
      expect(await checkKclFixture(fixture)).toEqual([]);
    },
    kclFixtureTimeout,
  );
});
