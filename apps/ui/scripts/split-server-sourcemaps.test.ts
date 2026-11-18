// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { splitServerSourcemaps } from '#scripts/split-server-sourcemaps.mts';

const directories: string[] = [];
const fixtureRoot = resolve(import.meta.dirname, '../node_modules/.cache');
afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

const files = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(directory.length + 1)
        .replaceAll('\\', '/'),
    )
    .toSorted();
};

it('should leave the server bundle without maps and the aside copy with maps only', async () => {
  await mkdir(fixtureRoot, { recursive: true });
  const build = await mkdtemp(join(fixtureRoot, 'tau-split-sourcemaps-'));
  directories.push(build);
  await mkdir(join(build, 'server/assets'), { recursive: true });
  await mkdir(join(build, 'server-sourcemaps'), { recursive: true });
  await writeFile(join(build, 'server-sourcemaps/stale.js.map'), 'stale');
  await writeFile(join(build, 'server/index.js'), 'index');
  await writeFile(join(build, 'server/index.js.map'), 'map');
  await writeFile(join(build, 'server/assets/chunk.js'), 'chunk');
  await writeFile(join(build, 'server/assets/chunk.js.map'), 'map');

  splitServerSourcemaps(build);

  expect(await files(join(build, 'server'))).toEqual(['assets/chunk.js', 'index.js']);
  expect(await files(join(build, 'server-sourcemaps'))).toEqual(['assets/chunk.js.map', 'index.js.map']);
});
