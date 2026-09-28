import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Create an ordinary fixture project only in the config lane's own cache.
 * @internal
 * @param extensions - Conventional configuration files to include.
 * @returns A new project path; preserve it for failed-check inspection.
 */
export const createConfigFixture = async (extensions: readonly string[] = []): Promise<string> => {
  const cache = fileURLToPath(
    new URL('../../../../node_modules/.cache/geospec/matcher-full-config-c1-a1/', import.meta.url),
  );
  await mkdir(cache, { recursive: true });
  const projectPath = await mkdtemp(join(cache, 'ordinary-'));
  await writeFile(join(projectPath, 'package.json'), '{"type":"module"}\n');
  await copyFile(new URL('__fixtures__/tau.json', import.meta.url), join(projectPath, 'tau.json'));
  await Promise.all(
    extensions.map(async (extension) => {
      const name = `geospec.config.${extension}`;
      await copyFile(new URL(`__fixtures__/${name}`, import.meta.url), join(projectPath, name));
    }),
  );
  await mkdir(join(projectPath, 'cases'));
  await Promise.all(
    ['cases/keep.geospec.ts', 'cases/skip.geospec.ts', 'other.geospec.js'].map(async (name) => {
      await writeFile(join(projectPath, name), 'export {};\n');
    }),
  );
  return projectPath;
};
