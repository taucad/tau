import { describe, expect, it, vi } from 'vitest';

import type { BundlerFileSystem } from '@taucad/bundler-core';
import { describeBundlerConformance } from '@taucad/runtime-testing';

import {
  loadRolldown,
  NativeRolldownCapabilityError,
  RolldownModuleVm,
  createRolldownModuleVm,
} from '#rolldown-module-vm.js';
import type { RolldownApi } from '#rolldown-module-vm.js';

const fileSystem = (initial: Readonly<Record<string, string>>): BundlerFileSystem => {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const value = files.get(path);
    if (value === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? value : encoder.encode(value);
  }
  return {
    exists: async (path) => files.has(path),
    readFile,
    writeFile: async (path, content) => {
      files.set(path, typeof content === 'string' ? content : new TextDecoder().decode(content));
    },
    ensureDir: async () => undefined,
  };
};

// Same fixture and expectation as esbuild's lock test: both bundlers must produce identical exports.
const lockedProject = (dependencies: Readonly<Record<string, string>>): Record<string, string> => {
  const packages: Record<string, string> = {
    'node_modules/esm-pkg/package.json': JSON.stringify({
      name: 'esm-pkg',
      version: '1.0.0',
      type: 'module',
      exports: { '.': './dist/index.js', './sub': './dist/sub.js' },
    }),
    'node_modules/esm-pkg/dist/index.js': "import { helper } from './helper';\nexport const esm = helper + 1;",
    'node_modules/esm-pkg/dist/helper.js': 'export const helper = 10;',
    'node_modules/esm-pkg/dist/sub.js': "export const sub = 'sub';",
    'node_modules/cjs-pkg/package.json': JSON.stringify({ name: 'cjs-pkg', version: '2.0.0', main: 'lib/main.js' }),
    'node_modules/cjs-pkg/lib/main.js': "module.exports = { cjs: require('./util').value, dup: require('dup') };",
    'node_modules/cjs-pkg/lib/util.js': 'exports.value = 2;',
    'node_modules/cjs-pkg/node_modules/dup/package.json': JSON.stringify({ name: 'dup', version: '2.0.0' }),
    'node_modules/cjs-pkg/node_modules/dup/index.js': "module.exports = '2.0.0';",
    'node_modules/dup/package.json': JSON.stringify({ name: 'dup', version: '1.0.0' }),
    'node_modules/dup/index.js': "module.exports = '1.0.0';",
  };
  const rows = Object.fromEntries(
    Object.entries(packages)
      .filter(([path]) => path.endsWith('/package.json'))
      .map(([path, text]) => [path.slice(0, -'/package.json'.length), { version: JSON.parse(text).version as string }]),
  );
  return {
    ...packages,
    'package.json': JSON.stringify({ name: 'model', dependencies }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'model', dependencies }, ...rows },
    }),
    'main.ts': [
      "import { esm } from 'esm-pkg';",
      "import { sub } from 'esm-pkg/sub';",
      "import cjs from 'cjs-pkg';",
      "import dup from 'dup';",
      'export const result = { esm, sub, cjs: cjs.cjs, nestedDup: cjs.dup, rootDup: dup };',
    ].join('\n'),
  };
};

describe('Rolldown over a locked node_modules tree', () => {
  const dependencies = { 'cjs-pkg': '^2.0.0', dup: '^1.0.0', 'esm-pkg': '^1.0.0' };

  it('bundles ESM, CJS, subpath and nested duplicate packages', async () => {
    const vm = await createRolldownModuleVm({ filesystem: fileSystem(lockedProject(dependencies)) });
    const bundled = await vm.bundle('main.ts');
    expect(bundled).toMatchObject({ success: true, issues: [] });
    await expect(vm.execute<{ result: unknown }>(bundled.code)).resolves.toMatchObject({
      success: true,
      value: { result: { esm: 11, sub: 'sub', cjs: 2, nestedDup: '2.0.0', rootDup: '1.0.0' } },
    });
    vm.dispose();
  });

  it('fails a missing package with its stable code', async () => {
    const vm = await createRolldownModuleVm({
      filesystem: fileSystem({
        ...lockedProject({ ...dependencies, absent: '^1.0.0' }),
        'main.ts': "import 'absent';",
      }),
    });
    const bundled = await vm.bundle('main.ts');
    expect(bundled).toMatchObject({
      success: false,
      issues: [{ code: 'BUNDLER_FAILED', details: { code: 'package-not-installed', name: 'absent' } }],
    });
    expect(bundled.issues[0]?.message).toContain("package-not-installed: Package 'absent' is not installed");
    vm.dispose();
  });

  it('warns package-not-locked for a CDN import in a project without a lock', async () => {
    vi.stubGlobal('fetch', async () => new Response('/* is-number@7.0.0 */ export default () => true;'));
    try {
      const vm = await createRolldownModuleVm({
        filesystem: fileSystem({ 'main.ts': "import isNumber from 'is-number'; export const ok = isNumber(1);" }),
      });
      const bundled = await vm.bundle('main.ts');
      expect(bundled).toMatchObject({
        success: true,
        issues: [{ severity: 'warning', details: { code: 'package-not-locked', name: 'is-number' } }],
      });
      vm.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describeBundlerConformance({
  name: 'native Rolldown',
  create: async (filesystem, options) =>
    createRolldownModuleVm({
      filesystem,
      autoExportNames: ['main', 'defaultParams', 'getParameterDefinitions'],
      ...options,
    }),
});

describe('native Rolldown lifecycle', () => {
  it('selects native Rolldown when browser globals are present', async () => {
    vi.stubGlobal('crossOriginIsolated', false);
    try {
      await expect(
        createRolldownModuleVm({ filesystem: fileSystem({ 'main.ts': 'export default 42;' }) }),
      ).resolves.toBeInstanceOf(RolldownModuleVm);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shares concurrent engine initialization and reinitializes VMs', async () => {
    const [leftApi, rightApi] = await Promise.all([loadRolldown(), loadRolldown()]);
    expect(leftApi).toBe(rightApi);

    const run = async (): Promise<void> => {
      const vm = await createRolldownModuleVm({ filesystem: fileSystem({ 'main.ts': 'export default 42;' }) });
      await expect(vm.bundle('main.ts')).resolves.toMatchObject({ success: true });
      vm.dispose();
    };
    await run();
    await run();
  });

  it('closes every created build after success and failure', async () => {
    const close = vi.fn(async () => undefined);
    let generation = 0;
    const generate = vi.fn(async () => {
      generation += 1;
      if (generation === 2) {
        throw new Error('generation failed');
      }
      return { output: [] };
    });
    const api = { rolldown: vi.fn(async () => ({ close, generate })) } as unknown as RolldownApi;
    const vm = new RolldownModuleVm({ filesystem: fileSystem({ 'main.ts': 'export default 1;' }) }, api);
    try {
      await expect(vm.detectImports('main.ts')).resolves.toMatchObject({ detectedModules: [] });
      await expect(vm.detectImports('main.ts')).rejects.toThrow('generation failed');
      expect(close).toHaveBeenCalledTimes(2);
    } finally {
      vm.dispose();
    }
  });

  it('provides an actionable stable native capability error', () => {
    const error = new NativeRolldownCapabilityError(new Error('missing binding'));
    expect(error).toMatchObject({
      name: 'NativeRolldownCapabilityError',
      code: 'ROLLDOWN_NATIVE_UNAVAILABLE',
    });
    expect(error.message).toContain('optional dependencies');
  });
});
