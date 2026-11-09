// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import { checkKclBodyNames } from '#testing/kcl-body-names.test-utils.js';
import { kclFixtureManifest, kclFixturesDirectory, kclFixtureTimeout } from '#testing/kcl-fixture-suite.test-utils.js';
import { directoryFileSystem } from '#testing/kcl-fixture.test-utils.js';

// Every fixture that builds more than one solid: patterns, booleans, nested and coincident bodies.
const multiBodyFixtures = kclFixtureManifest.fixtures
  .filter((fixture) => 'solids' in fixture.offline && fixture.offline.solids > 1)
  .map((fixture) => fixture.path);

// Fixtures the offline engine cannot name, and why; a fix fails the test until its entry is removed.
const knownGaps: Record<string, string> = {
  // The offline box of a surface loft misses its mesh by 70 mm and overshoots it by 1.9 m.
  'samples/wind-turbine-blade-root-inserts': 'offline surface-loft bounding box',
};

describe('offline KCL: body names', () => {
  it.each(multiBodyFixtures)(
    '%s',
    async (fixturePath) => {
      const directory = path.join(kclFixturesDirectory, fixturePath);
      const utils = new KclUtilities({
        baseUrl: 'ws://offline',
        mode: 'offline',
        fileSystemManager: new FileSystemManager(directoryFileSystem(directory)),
      });
      try {
        await utils.initializeEngine();
        const { program } = await utils.parseKcl(await readFile(path.join(directory, 'main.kcl'), 'utf8'));
        const { variables } = await utils.executeProgram(program, 'main.kcl');
        const departures = await checkKclBodyNames(utils, variables, 'node-ids');
        if (fixturePath in knownGaps) {
          expect(departures, `no longer hits its gap: ${knownGaps[fixturePath]}`).not.toEqual([]);
        } else {
          expect(departures).toEqual([]);
        }
      } finally {
        await utils.cleanup();
      }
    },
    kclFixtureTimeout,
  );
});
