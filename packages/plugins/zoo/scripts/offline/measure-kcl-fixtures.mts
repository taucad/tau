/**
 * Measures KCL fixture directories through the offline engine in one process, one JSON line per fixture.
 *
 * Usage: tsx measure-kcl-fixtures.mts <outFile> <fixturesDir> <fixturePath>...
 */
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { measureKclFixture } from '#testing/kcl-fixture.test-utils.js';

const [outFile, fixturesDirectory, ...fixtures] = process.argv.slice(2) as [string, string, ...string[]];
// One fixture at a time: the engine is single-threaded and each run owns it.
for (const fixture of fixtures) {
  const start = performance.now();
  // oxlint-disable-next-line no-await-in-loop -- sequential by design
  const outcome = await measureKclFixture(path.join(fixturesDirectory, fixture));
  const line = { id: fixture, ...outcome, ms: Math.round(performance.now() - start) };
  // oxlint-disable-next-line no-await-in-loop -- sequential by design
  await appendFile(outFile, `${JSON.stringify(line)}\n`);
}

process.exit(0);
