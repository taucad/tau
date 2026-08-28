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
      files.set(path, content);
    },
    ensureDir: async () => undefined,
  };
};

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
