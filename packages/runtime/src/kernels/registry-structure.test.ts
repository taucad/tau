import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const packagesRoot = fileURLToPath(new URL('../../../', import.meta.url));
const isTestFile = (file: string): boolean => /\.(test|test-d|spec|bench)\.[cm]?tsx?$|\.repro\.test\./.test(file);

/** Non-test TypeScript sources under `directory`, relative to `packages/`. */
const sources = async (directory: string): Promise<string[]> => {
  const entries = await readdir(path.join(packagesRoot, directory), { recursive: true });
  return entries
    .filter((entry) => /\.[cm]?tsx?$/.test(entry) && !isTestFile(entry) && !entry.includes('node_modules'))
    .map((entry) => path.posix.join(directory, entry.split(path.sep).join('/')));
};

/**
 * Kernel sources still reading the realm-global registry until their plugins migrate to the
 * worker-scoped helper (WP-A3–A5). Empty this list once they have; it never grows.
 */
const pendingMigration = new Set([
  'plugins/jscad/src/jscad.kernel.ts',
  'plugins/opencascade/src/opencascade.kernel.ts',
  'plugins/replicad/src/replicad.kernel.ts',
]);

const spelling = async (files: readonly string[], pattern: RegExp): Promise<string[]> => {
  const contents = await Promise.all(files.map(async (file) => readFile(path.join(packagesRoot, file), 'utf8')));
  return files.filter((_file, index) => pattern.test(contents[index]!));
};

it('should keep the built-in module registry key inside the runtime helper', async () => {
  const pluginDirectories = (await readdir(path.join(packagesRoot, 'plugins'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `plugins/${entry.name}/src`);
  const pluginSources = (
    await Promise.all(pluginDirectories.map(async (directory) => sources(directory).catch((): string[] => [])))
  ).flat();
  const runtimeSources = (await sources('runtime/src')).filter(
    (file) => file !== 'runtime/src/kernels/kernel-module-helpers.ts',
  );

  const offenders = [
    ...(await spelling(
      pluginSources,
      /__KERNEL_MODULES__|KERNEL_MODULES_KEY|getModuleRegistry|createKernelModuleRegistryExpression/,
    )),
    ...(await spelling(runtimeSources, /__KERNEL_MODULES__/)),
  ];

  expect(offenders.filter((file) => !pendingMigration.has(file))).toEqual([]);
});
