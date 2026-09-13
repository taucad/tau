import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearExecuteCache, createEsbuildModuleVm } from '#index.js';
import type { ModuleVm } from '#index.js';
import type { VmFileSystem } from '#types.js';

class MemoryFileSystem implements VmFileSystem {
  private readonly files = new Map<string, string | Uint8Array<ArrayBuffer>>();

  public setText(path: string, content: string): void {
    this.files.set(path, content);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const file = this.files.get(path);
    if (file === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }

    if (encoding === 'utf8') {
      return typeof file === 'string' ? file : new TextDecoder().decode(file);
    }

    return typeof file === 'string' ? new TextEncoder().encode(file) : file;
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(_path: string): Promise<void> {
    return undefined;
  }
}

describe('createEsbuildModuleVm', () => {
  let activeVm: ModuleVm | undefined;

  beforeEach(() => {
    clearExecuteCache();
  });

  afterEach(() => {
    activeVm?.dispose();
    activeVm = undefined;
    clearExecuteCache();
  });

  it('should bundle and execute project ESM with an in-memory builtin module', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.test.ts',
      [
        "import { describe, expectGeo } from 'geospec';",
        "import { makeBox } from './shape';",
        'export const result = describe("box", () => expectGeo(makeBox()).toHaveBoundingBox([0, 0, 0], [1, 1, 1]));',
      ].join('\n'),
    );
    filesystem.setText('/project/shape.ts', 'export const makeBox = () => ({ kind: "box", size: 1 });');

    const vm = await createEsbuildModuleVm({ filesystem, projectPath: '/project' });
    activeVm = vm;
    vm.registerModule('geospec', {
      version: '0.0.0-test',
      code: [
        'export const describe = (name, fn) => ({ name, assertion: fn() });',
        'export const expectGeo = (shape) => ({',
        '  toHaveBoundingBox: (min, max) => ({ shape, min, max })',
        '});',
      ].join('\n'),
    });

    const imports = await vm.detectImports('/project/model.test.ts');
    expect(imports.detectedModules).toEqual(['geospec']);
    expect(imports.dependencies).toContain('/project/model.test.ts');
    expect(imports.dependencies).toContain('/project/shape.ts');

    const bundled = await vm.bundle('/project/model.test.ts');
    expect(bundled.success).toBe(true);
    expect(bundled.dependencies).toEqual(expect.arrayContaining(['/project/model.test.ts', '/project/shape.ts']));

    const executed = await vm.execute<{ result: unknown }>(bundled.code);
    expect(executed.success).toBe(true);
    if (executed.success) {
      expect(executed.value.result).toEqual({
        name: 'box',
        assertion: {
          shape: { kind: 'box', size: 1 },
          min: [0, 0, 0],
          max: [1, 1, 1],
        },
      });
    }
  });

  it('should resolve production dependencies and unresolved import paths', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.ts',
      "import { value } from './present'; import './missing'; export const result = value;",
    );
    filesystem.setText('/project/present.ts', 'export const value = 7;');

    const vm = await createEsbuildModuleVm({ filesystem, projectPath: '/project' });
    activeVm = vm;

    const result = await vm.resolveDependencies('/project/main.ts');

    expect(result.resolved).toEqual(expect.arrayContaining(['/project/main.ts', '/project/present.ts']));
    expect(result.unresolved).toEqual(
      expect.arrayContaining([
        '/project/missing.ts',
        '/project/missing.tsx',
        '/project/missing.js',
        '/project/missing.jsx',
      ]),
    );
  });

  it('should return structured bundle issues when a builtin module is missing', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText('/project/model.test.ts', "import { describe } from 'geospec'; export const result = describe;");

    const vm = await createEsbuildModuleVm({ filesystem, projectPath: '/project' });
    activeVm = vm;

    const result = await vm.bundle('/project/model.test.ts');

    expect(result.success).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'BUNDLER_FAILED',
        severity: 'error',
        type: 'compilation',
      }),
    ]);
    expect(result.issues[0]!.message).toContain('geospec');
  });

  it('should return structured execution issues when bundled code throws', async () => {
    const filesystem = new MemoryFileSystem();
    const vm = await createEsbuildModuleVm({ filesystem, projectPath: '/project' });
    activeVm = vm;

    const result = await vm.execute('throw new TypeError("boom from vm test");');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual([
        {
          code: 'RUNTIME',
          message: 'boom from vm test',
          severity: 'error',
          type: 'runtime',
        },
      ]);
    }
  });

  it('should re-execute identical code by default for repeatable VM consumers', async () => {
    const key = '__TAUCAD_VM_REPEATABLE_DEFAULT__';
    const filesystem = new MemoryFileSystem();
    const vm = await createEsbuildModuleVm({ filesystem, projectPath: '/project' });
    activeVm = vm;

    try {
      const code = [
        `globalThis.${key} = (globalThis.${key} ?? 0) + 1;`,
        `export const count = globalThis.${key};`,
      ].join('\n');

      const first = await vm.execute<{ count: number }>(code);
      const second = await vm.execute<{ count: number }>(code);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (first.success && second.success) {
        expect(first.value.count).toBe(1);
        expect(second.value.count).toBe(2);
      }
    } finally {
      Reflect.deleteProperty(globalThis, key);
    }
  });

  it('should reuse identical code only when execution caching is enabled', async () => {
    const key = '__TAUCAD_VM_CACHED_EXECUTION__';
    const filesystem = new MemoryFileSystem();
    const vm = await createEsbuildModuleVm({
      filesystem,
      projectPath: '/project',
      cacheExecution: true,
    });
    activeVm = vm;

    try {
      const code = [
        `globalThis.${key} = (globalThis.${key} ?? 0) + 1;`,
        `export const count = globalThis.${key};`,
      ].join('\n');

      const first = await vm.execute<{ count: number }>(code);
      const second = await vm.execute<{ count: number }>(code);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (first.success && second.success) {
        expect(first.value).toBe(second.value);
        expect(first.value.count).toBe(1);
        expect(second.value.count).toBe(1);
      }
    } finally {
      Reflect.deleteProperty(globalThis, key);
    }
  });
});
