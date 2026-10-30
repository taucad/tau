/**
 * The KCL fixture regression suite: Zoo's samples, kcl-lib's simulation tests and the standard library's doc
 * examples, run through the offline engine and held to the baselines in `offline/fixtures/kcl/manifest.json`.
 *
 * Each group of fixtures is its own test file (`offline-kcl-*.integration.test.ts`), so the groups run in parallel.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KclFixtureOutcome } from '#testing/kcl-fixture.test-utils.js';
import { measureKclFixture } from '#testing/kcl-fixture.test-utils.js';

/** One fixture as the manifest records it. */
export type KclFixture = {
  path: string;
  upstream?: string;
  functions: string[];
  kclVersion?: string;
  norun?: boolean;
  /** Zoo's physical properties for the fixture, from kcl-lib's snapshots: the oracle. */
  zoo?: { volume: number; area: number };
  /** What the offline engine built when the baseline was recorded, or the gap it hit. */
  offline: KclFixtureOutcome;
};

/** The suite's manifest, written by `scripts/offline/vendor-kcl-fixtures.py`. */
export type KclFixtureManifest = {
  upstream: { repository: string; commit: string };
  functions: Record<string, string[]>;
  uncovered: string[];
  excluded: Array<{ path: string; reason: string }>;
  fixtures: KclFixture[];
};

export const kclFixturesDirectory = fileURLToPath(new URL('../offline/fixtures/kcl', import.meta.url));

export const kclFixtureManifest = JSON.parse(
  readFileSync(path.join(kclFixturesDirectory, 'manifest.json'), 'utf8'),
) as KclFixtureManifest;

// The libcascade build is deterministic, so a baseline holds to round-off in its ten recorded digits.
const baselineTolerance = 1e-6;
// How closely the offline engine must agree with Zoo where the baseline already did.
const zooTolerance = 0.01;

const relativeError = (actual: number, expected: number): number =>
  expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected);

const update = 'If this change is intended, re-record the baselines: see src/offline/fixtures/kcl/README.md.';

/**
 * The fixtures in the given groups (`samples`, `simulation`, `examples` or `tau`), as test cases.
 *
 * @param groups - the top-level fixture directories to run
 * @returns `[path, fixture]` pairs for `it.each`
 */
export const kclFixtureCases = (...groups: string[]): Array<readonly [string, KclFixture]> =>
  kclFixtureManifest.fixtures
    .filter((fixture) => groups.includes(fixture.path.split('/')[0]!))
    .map((fixture) => [fixture.path, fixture] as const);

/**
 * Runs a fixture and compares it with its baseline, and with Zoo where the baseline agreed with Zoo.
 *
 * @param fixture - the fixture to run
 * @returns how the run departs from the baseline; empty when it matches
 */
export async function checkKclFixture(fixture: KclFixture): Promise<string[]> {
  const outcome = await measureKclFixture(path.join(kclFixturesDirectory, fixture.path));
  const { offline: baseline } = fixture;
  if ('gap' in baseline) {
    // A known gap: a fix shows up here, and the baseline then records what the fixture builds.
    return 'gap' in outcome && outcome.gap === baseline.gap
      ? []
      : [`no longer hits its recorded gap "${baseline.gap}": ${JSON.stringify(outcome)}. ${update}`];
  }

  if ('gap' in outcome) {
    return [`now fails: ${outcome.gap}`];
  }

  const departures: string[] = [];
  if (outcome.solids !== baseline.solids) {
    departures.push(`builds ${outcome.solids} solids, not ${baseline.solids}. ${update}`);
  }

  for (const key of ['volume', 'area'] as const) {
    if (relativeError(outcome[key], baseline[key]) >= baselineTolerance) {
      departures.push(`${key} is ${outcome[key]}, not ${baseline[key]}. ${update}`);
    }
  }

  const { zoo } = fixture;
  if (
    zoo &&
    zoo.volume > 0 &&
    relativeError(baseline.volume, zoo.volume) < zooTolerance &&
    relativeError(outcome.volume, zoo.volume) >= zooTolerance
  ) {
    departures.push(`volume ${outcome.volume} is more than 1% from Zoo's ${zoo.volume}`);
  }

  return departures;
}

/** Long enough for the heaviest sample, which takes about 12 s. */
export const kclFixtureTimeout = 120_000;
