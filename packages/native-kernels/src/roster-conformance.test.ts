// The agreement between the roster, each kernel package and the product catalog that hosts otherwise remember by
// hand: package names, catalog rows, launch sets and options over every golden target, and the loaded kernels.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { parsePluginDeployment, targetKey } from '@taucad/runtime/preparation/node';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';
import { describe, expect, it } from 'vitest';

import { nativeKernelAdopters } from '#adopters.js';
import type { AdopterOf, NativePackage } from '#adopters.js';
import { nativeKernelManifests } from '#manifest.js';
import { fixtureClosure } from '#native-kernels.fixture.js';

const require = createRequire(import.meta.url);

const catalog: readonly KernelConfiguration[] = kernelConfigurations;

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;

const packageRoot = (packageName: string): string => dirname(require.resolve(`${packageName}/package.json`));

const extensionOf = (path: string): string => path.slice(path.lastIndexOf('.') + 1);

// The kernels an adopter's loaded plugin declares, with options mapped from a fixture closure.
const loadedKernels = async <P extends NativePackage>(adopter: AdopterOf<P>) => {
  const factory = await adopter.load();
  const options = adopter.optionsFromClosure(fixtureClosure(adopter.package, '/store/closures/sha256/loaded'));
  return factory(options).capabilities.kernels;
};

describe.each(nativeKernelAdopters.map((adopter) => [adopter.package, adopter] as const))('%s', (_name, adopter) => {
  const deployment = parsePluginDeployment(
    nativeKernelManifests[adopter.package],
    `${adopter.package} tau-plugin.json`,
  );

  it('should be adopted under the name its package.json publishes', async () => {
    await expect(readJson(join(packageRoot(adopter.package), 'package.json'))).resolves.toMatchObject({
      name: adopter.package,
    });
  });

  it('should give every manifest kernel a catalog row that requires it, in its ecosystem, with a main file it claims', () => {
    for (const [kernel, { extensions }] of Object.entries(deployment.kernels)) {
      const rows = catalog.filter((row) => row.requiresRuntimeKernelId === kernel);

      expect(rows, kernel).not.toEqual([]);
      for (const row of rows) {
        expect(row.ecosystem, row.id).toBe(adopter.ecosystem);
        expect(extensions, row.id).toContain(extensionOf(row.mainFile));
      }
    }
  });

  it('should launch only listed files and map a closure to options its schema accepts on every golden target', async (context) => {
    const golden = (await readJson(join(packageRoot(adopter.package), 'tau-plugin.golden.json'))) as Record<
      string,
      unknown
    >;
    const declaredTargets = new Set(
      Object.values(deployment.dependencies).flatMap((variants) => variants.map(({ target }) => targetKey(target))),
    );

    // A regenerated tau-plugin.json resets its golden receipts to `{}` until the kernel's `<kernel>-tau-plugin.yml`
    // dispatch re-records them on every target; this check re-arms when that commit lands.
    context.skip(
      Object.keys(golden).length === 0,
      `${adopter.package} tau-plugin.golden.json has no targets yet: run its tau-plugin workflow dispatch to record them`,
    );
    for (const target of Object.keys(golden)) {
      const closure = fixtureClosure(adopter.package, `/store/closures/sha256/${target}`);
      const listed = new Set(closure.files.map(({ path }) => path));

      expect(declaredTargets, target).toContain(target);
      expect(
        adopter.launchSet(closure.files).filter((path) => !listed.has(path)),
        target,
      ).toEqual([]);
      expect(adopter.optionsSchema.safeParse(adopter.optionsFromClosure(closure)).error, target).toBeUndefined();
    }
  });

  it("should load a plugin whose kernels are the manifest's, with the same extensions", async () => {
    const kernels = await loadedKernels(adopter);

    expect(Object.fromEntries(kernels.map(({ id, extensions }) => [id, [...extensions].toSorted()]))).toEqual(
      Object.fromEntries(
        Object.entries(deployment.kernels).map(([kernel, { extensions }]) => [kernel, [...extensions].toSorted()]),
      ),
    );
  });
});

describe('nativeKernelAdopters', () => {
  it('should hold each native kernel package once, in the reviewed order', () => {
    expect(nativeKernelAdopters.map((adopter) => adopter.package)).toEqual(['@taucad/build123d', '@taucad/picogk']);
    expect(Object.keys(nativeKernelManifests)).toEqual(nativeKernelAdopters.map((adopter) => adopter.package));
  });
});
