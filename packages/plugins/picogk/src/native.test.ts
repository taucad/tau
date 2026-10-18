// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { nativeDeploymentOf } from '@taucad/native-process-core/adopter';
import { nativeDeploymentsOf } from '@taucad/native-process-core/store';
import { parsePluginDeployment, targetKey } from '@taucad/runtime/preparation/node';
import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';
import { defineRuntime, resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';
import { describe, expect, it } from 'vitest';

import { picogkLaunchSet, picogkOptionsFromClosure } from '#picogk-closure.js';
import { picogkKernel } from '#picogk.kernel.js';
import { picogkNative } from '#native.js';
import { picogk } from '#picogk.plugin.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o644,
});

const closure: ClosureLaunch = {
  package: '@taucad/picogk',
  dependency: 'runtime',
  root: '/store/closures/sha256/0123',
  closureIntegrity: 'sha256-AAAA',
  files: [
    row('dotnet/dotnet', 'a'),
    row('dotnet/host/fxr/10.0.11/libhostfxr.dylib', 'b'),
    row('dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib', 'c'),
    row('dotnet/shared/Microsoft.NETCore.App/10.0.11/libcoreclr.dylib', 'd'),
    row('tau-worker/Tau.PicoGK.Worker.dll', 'e'),
    row('tau-worker/PicoGK.dll', 'f'),
    row('tau-worker/picogk.26.2.dylib', '1'),
  ],
};

describe('picogkNative', () => {
  it('should adopt the package named in its manifest with the mapping its closure module exports', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
    };

    expect(picogkNative).toMatchObject({ package: manifest.name, ecosystem: 'nuget' });
    expect(picogkNative.optionsFromClosure(closure)).toEqual(picogkOptionsFromClosure(closure));
    expect(picogkNative.launchSet(closure.files)).toEqual(picogkLaunchSet(closure.files));
    expect(picogkNative).not.toHaveProperty('seal');
  });

  it('should validate the options a sealed closure maps to, including its root and worker assembly', () => {
    const options = picogkNative.optionsFromClosure(closure);

    expect(picogkNative.optionsSchema.parse(options)).toEqual(options);
    expect(picogkNative.optionsSchema.safeParse({ ...options, workerArguments: undefined }).success).toBe(false);
  });

  it('should launch only files the closure lists', () => {
    const listed = new Set(closure.files.map(({ path }) => path));

    expect(picogkNative.launchSet(closure.files).every((path) => listed.has(path))).toBe(true);
  });

  it('should give the kernel plugin an explicit closure and host bounds as its options', () => {
    const closureOptions = picogkNative.optionsFromClosure(closure);

    const { capabilities } = picogk({ kernels: { default: { closure: closureOptions, maxArtifactBytes: 1024 } } });

    expect(capabilities.kernels.map(({ id, extensions }) => ({ id, extensions }))).toEqual([
      { id: 'picogk', extensions: ['cs'] },
    ]);
    expect(capabilities.kernels[0].options).toMatchObject({ maxArtifactBytes: 1024, closure: closureOptions });
  });
});

const sourceRoot = new URL('./', import.meta.url);

const catalog: readonly KernelConfiguration[] = kernelConfigurations;

// The modules a source module reaches through the package's own `#` imports, itself included.
const importGraph = async (module: URL, seen = new Set<string>()): Promise<Set<string>> => {
  seen.add(module.href);
  const source = await readFile(module, 'utf8');
  const next = [...source.matchAll(/from '#(?<name>[^']+)\.js'/gu)]
    .map((match) => new URL(`${match.groups?.['name'] ?? ''}.ts`, sourceRoot))
    .filter(({ href }) => !seen.has(href));
  for (const { href } of next) {
    seen.add(href);
  }
  await Promise.all(next.map(async (url) => importGraph(url, seen)));
  return seen;
};

describe('picogkNative deployment', () => {
  const deployment = parsePluginDeployment(picogkNative.manifest, 'picogkNative.manifest');

  it('should resolve the package root and entry from its own module', () => {
    expect(fileURLToPath(picogkNative.packageRoot)).toBe(fileURLToPath(new URL('../', import.meta.url)));
    expect(picogkNative.entry).toBe(new URL('native.ts', sourceRoot).href);
  });

  it('should import no kernel module, so a parent process prepares the kernel without loading it', async () => {
    const modules = [...(await importGraph(new URL('native.ts', sourceRoot)))].map((href) =>
      href.slice(sourceRoot.href.length),
    );

    expect(modules).toContain('native.ts');
    expect(modules.filter((module) => module.endsWith('.kernel.ts'))).toEqual([]);
  });

  it('should give every manifest kernel a catalog row that requires it, in its ecosystem, with a main file it claims', () => {
    for (const [kernel, { extensions }] of Object.entries(deployment.kernels)) {
      const rows = catalog.filter((row) => row.requiresRuntimeKernelId === kernel);

      expect(rows, kernel).not.toEqual([]);
      for (const row of rows) {
        expect(row.ecosystem, row.id).toBe('nuget');
        expect(extensions, row.id).toContain(row.mainFile.slice(row.mainFile.lastIndexOf('.') + 1));
      }
    }
  });

  it('should launch only listed files and map a closure to options its schema accepts on every golden target', async (context) => {
    const golden = JSON.parse(await readFile(new URL('../tau-plugin.golden.json', import.meta.url), 'utf8')) as Record<
      string,
      unknown
    >;
    const declaredTargets = new Set(
      Object.values(deployment.dependencies).flatMap((variants) => variants.map(({ target }) => targetKey(target))),
    );
    const listed = new Set(closure.files.map(({ path }) => path));

    // A regenerated tau-plugin.json resets its golden receipts to `{}` until the kernel's tau-plugin workflow dispatch
    // re-records them on every target; this check re-arms when that commit lands.
    context.skip(Object.keys(golden).length === 0, 'tau-plugin.golden.json has no targets yet');
    for (const target of Object.keys(golden)) {
      expect(declaredTargets, target).toContain(target);
      expect(
        picogkNative.launchSet(closure.files).filter((path) => !listed.has(path)),
        target,
      ).toEqual([]);
      expect(
        picogkNative.optionsSchema.safeParse(picogkNative.optionsFromClosure(closure)).error,
        target,
      ).toBeUndefined();
    }
  });
});

describe('picogkKernel', () => {
  it('should carry picogkNative on every registration', () => {
    expect(nativeDeploymentOf(picogkKernel())).toBe(picogkNative);
    expect(Object.keys(picogkKernel())).not.toContain('deployment');
  });

  it("should keep the deployment through the plugin and the runtime definition, with the manifest's kernels", async () => {
    const runtime = await resolveRuntimeDefinition(defineRuntime({ plugins: [picogk()] }), undefined);
    const deployment = parsePluginDeployment(picogkNative.manifest, 'picogkNative.manifest');

    expect(nativeDeploymentsOf(runtime)).toEqual([
      {
        deployment: picogkNative,
        kernels: Object.entries(deployment.kernels).map(([id, { extensions, requires }]) => ({
          id,
          extensions,
          requires,
        })),
      },
    ]);
  });
});
