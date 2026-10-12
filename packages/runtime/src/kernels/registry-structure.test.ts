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

const spelling = async (files: readonly string[], pattern: RegExp): Promise<string[]> => {
  const contents = await Promise.all(files.map(async (file) => readFile(path.join(packagesRoot, file), 'utf8')));
  return files.filter((_file, index) => pattern.test(contents[index]!));
};

it('should keep the built-in module registry key inside the runtime helper', async () => {
  const pluginEntries = await readdir(path.join(packagesRoot, 'plugins'), { withFileTypes: true });
  const pluginSourceLists = await Promise.all(
    pluginEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => sources(`plugins/${entry.name}/src`).catch((): string[] => [])),
  );
  const pluginSources = pluginSourceLists.flat();
  const allRuntimeSources = await sources('runtime/src');
  const runtimeSources = allRuntimeSources.filter((file) => file !== 'runtime/src/kernels/kernel-module-helpers.ts');

  const offenders = [
    ...(await spelling(
      pluginSources,
      /__KERNEL_MODULES__|KERNEL_MODULES_KEY|getModuleRegistry|createKernelModuleRegistryExpression/,
    )),
    ...(await spelling(runtimeSources, /__KERNEL_MODULES__/)),
  ];

  expect(offenders).toEqual([]);
});
