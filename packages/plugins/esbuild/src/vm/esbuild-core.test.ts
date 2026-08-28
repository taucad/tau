import { describe, expect, it } from 'vitest';
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

describeBundlerConformance({
  name: 'esbuild',
  create: async (filesystem, options) =>
    createEsbuildModuleVm({ filesystem, autoExportNames: ['main', 'defaultParams'], ...options }),
});
