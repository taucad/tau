import { describe, expect, it, vi } from 'vitest';
import { describeBundlerConformance } from '@taucad/runtime-testing';

import { createEsbuildModuleVm } from '#vm/module-vm.js';
import type { VmFileSystem } from '#vm/types.js';

const createFileSystem = (initial: Readonly<Record<string, string>>): VmFileSystem => {
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
  const filesystem: VmFileSystem = {
    exists: async (path) => files.has(path),
    readFile,
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    ensureDir: async () => undefined,
  };
  return filesystem;
};

describe('core-backed esbuild VM', () => {
  it('detects and bundles the same transitive graph without swallowing failures', async () => {
    const vm = await createEsbuildModuleVm({
      filesystem: createFileSystem({
        'main.ts': "import { value } from './value.js'; import 'replicad'; const main = () => value;",
        'value.ts': 'export const value = 42;',
      }),
      autoExportNames: ['main'],
    });

    await expect(vm.detectImports('main.ts')).resolves.toEqual({
      dependencies: ['main.ts', 'value.ts'],
      detectedModules: ['replicad'],
    });
    vm.registerModule('replicad', { code: 'export {};', version: '1.0.0' });
    const bundled = await vm.bundle('main.ts');
    expect(bundled).toMatchObject({ success: true, dependencies: ['main.ts', 'value.ts'] });
    expect(bundled.code).toContain('main');

    await expect(vm.detectImports('missing.ts')).rejects.toThrow();
    vm.dispose();
  });

  it('does not retain an aborted operation signal', async () => {
    const vm = await createEsbuildModuleVm({ filesystem: createFileSystem({ 'main.ts': 'export default 1;' }) });
    const controller = new AbortController();
    controller.abort();
    await expect(vm.detectImports('main.ts', controller.signal)).rejects.toThrow();
    await expect(vm.detectImports('main.ts', new AbortController().signal)).resolves.toMatchObject({
      dependencies: ['main.ts'],
    });
    vm.dispose();
  });
});

// Same fixture and expectation as rolldown's lock test: both bundlers must produce identical exports.
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

describe('esbuild over a locked node_modules tree', () => {
  const dependencies = { 'cjs-pkg': '^2.0.0', dup: '^1.0.0', 'esm-pkg': '^1.0.0' };

  it('bundles ESM, CJS, subpath and nested duplicate packages', async () => {
    const vm = await createEsbuildModuleVm({ filesystem: createFileSystem(lockedProject(dependencies)) });
    const bundled = await vm.bundle('main.ts');
    expect(bundled).toMatchObject({ success: true, issues: [] });
    await expect(vm.execute<{ result: unknown }>(bundled.code)).resolves.toMatchObject({
      success: true,
      value: { result: { esm: 11, sub: 'sub', cjs: 2, nestedDup: '2.0.0', rootDup: '1.0.0' } },
    });
    vm.dispose();
  });

  it('fails a missing package with its stable code', async () => {
    const vm = await createEsbuildModuleVm({
      filesystem: createFileSystem({
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
      const vm = await createEsbuildModuleVm({
        filesystem: createFileSystem({ 'main.ts': "import isNumber from 'is-number'; export const ok = isNumber(1);" }),
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
  name: 'esbuild',
  create: async (filesystem, options) =>
    createEsbuildModuleVm({ filesystem, autoExportNames: ['main', 'defaultParams'], ...options }),
});
