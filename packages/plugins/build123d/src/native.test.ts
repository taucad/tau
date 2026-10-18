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

import { build123dLaunchSet, build123dOptionsFromClosure, sealBuild123dClosure } from '#build123d-closure.js';
import { build123d } from '#build123d.plugin.js';
import { build123dKernel } from '#build123d.kernel.js';
import { build123dNative } from '#native.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o644,
});

const closure: ClosureLaunch = {
  package: '@taucad/build123d',
  dependency: 'engine',
  root: '/store/closures/sha256/abc',
  closureIntegrity: 'sha256-AAAA',
  files: [
    row('python/bin/python3', 'a'),
    row('tau-worker/worker.py', 'b'),
    row('tau-worker/native_materials.py', 'e'),
    row('tau-worker/mechanisms.py', 'f'),
    row('tau-worker/tau_kernel/analyzer.py', 'c'),
    row('tau-worker/tau_kernel/glb.py', 'd'),
    row('tau-worker/tau_kernel/model.py', '1'),
    row('tau-worker/tau_kernel/protocol.py', '2'),
  ],
};

describe('build123dNative', () => {
  it('should adopt the package named in its manifest with the closure module it already exports', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
    };

    expect(build123dNative).toMatchObject({
      package: manifest.name,
      ecosystem: 'pypi',
      optionsFromClosure: build123dOptionsFromClosure,
      seal: sealBuild123dClosure,
      launchSet: build123dLaunchSet,
    });
  });

  it('should validate the options a sealed closure maps to, including its root', () => {
    const options = build123dNative.optionsFromClosure(closure);

    expect(build123dNative.optionsSchema.parse(options)).toEqual({ ...options, runtimePath: closure.root });
    expect(build123dNative.optionsSchema.safeParse({ ...options, runtimePath: undefined }).success).toBe(false);
  });

  it('should launch only files the closure lists', () => {
    const listed = new Set(closure.files.map(({ path }) => path));

    expect(build123dNative.launchSet(closure.files).every((path) => listed.has(path))).toBe(true);
  });

  it('should give the kernel plugin an explicit closure and host bounds as its options', () => {
    const closureOptions = build123dNative.optionsFromClosure(closure);

    const { capabilities } = build123d({ kernels: { default: { closure: closureOptions, requestTimeout: 60_000 } } });

    expect(capabilities.kernels.map(({ id, extensions }) => ({ id, extensions }))).toEqual([
      { id: 'build123d', extensions: ['py'] },
    ]);
    expect(capabilities.kernels[0].options).toMatchObject({ requestTimeout: 60_000, closure: closureOptions });
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

describe('build123dNative deployment', () => {
  const deployment = parsePluginDeployment(build123dNative.manifest, 'build123dNative.manifest');

  it('should resolve the package root and entry from its own module', () => {
    expect(fileURLToPath(build123dNative.packageRoot)).toBe(fileURLToPath(new URL('../', import.meta.url)));
    expect(build123dNative.entry).toBe(new URL('native.ts', sourceRoot).href);
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
        expect(row.ecosystem, row.id).toBe('pypi');
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
        build123dNative.launchSet(closure.files).filter((path) => !listed.has(path)),
        target,
      ).toEqual([]);
      expect(
        build123dNative.optionsSchema.safeParse(build123dNative.optionsFromClosure(closure)).error,
        target,
      ).toBeUndefined();
    }
  });
});

describe('build123dKernel', () => {
  it('should carry build123dNative on every registration', () => {
    expect(nativeDeploymentOf(build123dKernel())).toBe(build123dNative);
    expect(Object.keys(build123dKernel())).not.toContain('deployment');
  });

  it("should keep the deployment through the plugin and the runtime definition, with the manifest's kernels", async () => {
    const runtime = await resolveRuntimeDefinition(defineRuntime({ plugins: [build123d()] }), undefined);
    const deployment = parsePluginDeployment(build123dNative.manifest, 'build123dNative.manifest');

    expect(nativeDeploymentsOf(runtime)).toEqual([
      {
        deployment: build123dNative,
        kernels: Object.entries(deployment.kernels).map(([id, { extensions, requires }]) => ({
          id,
          extensions,
          requires,
        })),
      },
    ]);
  });
});
