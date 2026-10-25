import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGeoSpecConfig } from '#config/read-geospec-config.js';
import { runGeoSpecModule } from '#runner/run-geospec-module.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { memoryFileSystem, passingSpec } from '#runner/testing/memory-filesystem.js';
import { createPlainModuleVm } from '#vm/plain-module-vm.js';
import type { CreateModuleVm, ModuleVm } from '#vm/types.js';

const nativeAssertions = { engine: {} } as unknown as Parameters<typeof runGeoSpecModule>[0]['nativeAssertions'];

describe('createPlainModuleVm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should bundle and execute project files and builtins', async () => {
    const vm = await createPlainModuleVm({
      filesystem: memoryFileSystem({
        'spec/main.geospec.ts':
          "import { size } from './helper';\nimport { tag } from 'tagged';\nexport default size + tag;",
        'spec/helper.ts': 'export const size: number = 2;',
      }),
    });
    vm.registerModule('tagged', { version: '0.0.0', code: "export const tag = '-x';" });
    const bundle = await vm.bundle('spec/main.geospec.ts');
    expect(bundle).toMatchObject({ success: true, issues: [] });
    expect(bundle.dependencies).toEqual(['spec/main.geospec.ts', 'spec/helper.ts']);
    await expect(vm.execute<{ default: string }>(bundle.code)).resolves.toMatchObject({
      success: true,
      value: { default: '2-x' },
    });
    vm.dispose();
  });

  it.each([
    ['lodash-es', 'package-import-unsupported'],
    ['@scope/pkg/sub', 'package-import-unsupported'],
    ['https://esm.sh/lodash-es', 'url-import-unsupported'],
  ])('should refuse the bare import %j with a typed BUNDLER_FAILED issue', async (specifier, reason) => {
    const vm = await createPlainModuleVm({
      filesystem: memoryFileSystem({ 'main.ts': `import value from '${specifier}';\nexport default value;` }),
    });
    const bundle = await vm.bundle('main.ts');
    expect(bundle.success).toBe(false);
    expect(bundle.issues).toEqual([
      expect.objectContaining({
        code: 'BUNDLER_FAILED',
        severity: 'error',
        message: expect.stringContaining(`Cannot import '${specifier}'`) as string,
        details: { code: reason, specifier },
      }),
    ]);
  });

  it('should resolve a directory import to its index file on the Node filesystem', async () => {
    const root = await mkdtemp(join(tmpdir(), 'geospec-plain-vm-'));
    try {
      await mkdir(join(root, 'lib'));
      await writeFile(join(root, 'lib', 'index.ts'), 'export const size: number = 3;');
      await writeFile(join(root, 'main.ts'), "import { size } from './lib';\nexport default size;");
      const vm = await createPlainModuleVm({ filesystem: createNodeVmFileSystem(root) });
      const bundle = await vm.bundle('main.ts');
      expect(bundle).toMatchObject({ success: true, issues: [] });
      expect(bundle.dependencies).toEqual(['main.ts', 'lib/index.ts']);
      vm.dispose();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('should refuse a missing project import', async () => {
    const vm = await createPlainModuleVm({ filesystem: memoryFileSystem({ 'main.ts': "import './absent';" }) });
    const bundle = await vm.bundle('main.ts');
    expect(bundle.success).toBe(false);
    expect(bundle.issues[0]).toMatchObject({
      code: 'BUNDLER_FAILED',
      message: expect.stringContaining("'./absent'") as string,
    });
  });

  it('should report bare specifiers on detection without loading them', async () => {
    const vm = await createPlainModuleVm({
      filesystem: memoryFileSystem({
        'main.ts': "import 'geospec/config';\nimport 'lodash-es';\nimport './local';",
        'local.ts': '',
      }),
    });
    await expect(vm.detectImports('main.ts')).resolves.toEqual({
      detectedModules: ['geospec/config', 'lodash-es'],
      dependencies: ['main.ts', 'local.ts'],
    });
  });

  it('should refuse every bundle outside Node until a VM is injected', async () => {
    vi.stubGlobal('process', undefined);
    const vm = await createPlainModuleVm({ filesystem: memoryFileSystem({ 'main.ts': 'export default 1;' }) });
    vi.unstubAllGlobals();
    const bundle = await vm.bundle('main.ts');
    expect(bundle.success).toBe(false);
    expect(bundle.issues).toEqual([
      expect.objectContaining({ code: 'BUNDLER_FAILED', message: expect.stringContaining('createModuleVm') as string }),
    ]);
    await expect(vm.detectImports('main.ts')).rejects.toThrow('createModuleVm');
  });
});

describe('injected module VM', () => {
  const recordingVm = (): { createModuleVm: CreateModuleVm; created: string[] } => {
    const created: string[] = [];
    return {
      created,
      createModuleVm: async (options) => {
        created.push('vm');
        const inner: ModuleVm = await createPlainModuleVm(options);
        return inner;
      },
    };
  };

  it('should run a spec through the injected VM', async () => {
    const { createModuleVm, created } = recordingVm();
    const result = await runGeoSpecModule({
      filesystem: memoryFileSystem({ 'a.geospec.ts': passingSpec('injected') }),
      entryPath: 'a.geospec.ts',
      nativeAssertions,
      createModuleVm,
    });
    expect(created).toEqual(['vm']);
    expect(result).toMatchObject({ success: true, tests: [{ name: 'passes', status: 'passed' }] });
  });

  it('should refuse a bare npm import in a spec on the plain default', async () => {
    const result = await runGeoSpecModule({
      filesystem: memoryFileSystem({ 'a.geospec.ts': `import 'lodash-es';\n${passingSpec('bare')}` }),
      entryPath: 'a.geospec.ts',
      nativeAssertions,
    });
    expect(result).toMatchObject({
      success: false,
      issues: [{ code: 'BUNDLER_FAILED', message: expect.stringContaining("Cannot import 'lodash-es'") as string }],
    });
  });

  it('should read a config through the injected VM', async () => {
    const { createModuleVm, created } = recordingVm();
    await expect(
      readGeoSpecConfig({
        filesystem: memoryFileSystem({
          'geospec.config.ts': "import { defineConfig } from 'geospec/config';\nexport default defineConfig({});",
        }),
        projectPath: '',
        createModuleVm,
      }),
    ).resolves.toMatchObject({ status: 'applied', configPath: 'geospec.config.ts' });
    expect(created).toEqual(['vm']);
  });
});
