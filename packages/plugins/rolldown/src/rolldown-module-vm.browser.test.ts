import { describe, expect, it, vi } from 'vitest';

import { describeBundlerConformance } from '@taucad/runtime-testing';
import type { BundlerConformanceFileSystem } from '@taucad/runtime-testing';

import { createRolldownModuleVm, loadRolldown } from '#rolldown-module-vm.js';

const fileSystem = (initial: Readonly<Record<string, string>>): BundlerConformanceFileSystem => {
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
  const filesystem: BundlerConformanceFileSystem = {
    exists: async (path) => files.has(path),
    readFile,
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    ensureDir: async () => undefined,
  };
  return filesystem;
};

describeBundlerConformance({
  name: 'browser Rolldown',
  create: async (filesystem, options) =>
    createRolldownModuleVm({
      filesystem,
      autoExportNames: ['main', 'defaultParams', 'getParameterDefinitions'],
      ...options,
    }),
});

describe('browser Rolldown lifecycle', () => {
  it('uses shared memory and reinitializes after cleanup', async () => {
    expect(globalThis.crossOriginIsolated).toBe(true);
    expect(() => new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true })).not.toThrow();
    const run = async (): Promise<void> => {
      const vm = await createRolldownModuleVm({ filesystem: fileSystem({ 'main.ts': 'export default 42;' }) });
      const bundle = await vm.bundle('main.ts');
      expect(bundle.success).toBe(true);
      vm.dispose();
    };
    await run();
    await run();
  });

  it('shares concurrent engine initialization', async () => {
    const [left, right] = await Promise.all([loadRolldown(), loadRolldown()]);
    expect(left).toBe(right);
  });

  it('revokes Blob URLs after successful, failed, and aborted execution', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const vm = await createRolldownModuleVm({ filesystem: fileSystem({}) });
    try {
      await expect(vm.execute('export default 42;')).resolves.toMatchObject({ success: true });
      await expect(vm.execute('throw new Error("fixture failure");')).resolves.toMatchObject({ success: false });
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort();
      }, 0);
      await expect(
        vm.execute('await new Promise((resolve) => setTimeout(resolve, 10)); export default 42;', controller.signal),
      ).resolves.toMatchObject({ success: false });
      expect(revoke).toHaveBeenCalledTimes(3);
    } finally {
      revoke.mockRestore();
      vm.dispose();
    }
  });
});
