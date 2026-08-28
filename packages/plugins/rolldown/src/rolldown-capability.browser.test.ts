import { expect, it } from 'vitest';

import type { BundlerFileSystem } from '@taucad/bundler-core';

import { BrowserRolldownCapabilityError, createRolldownModuleVm } from '#rolldown-module-vm.js';

async function readFile(_path: string, encoding: 'utf8'): Promise<string>;
async function readFile(_path: string): Promise<Uint8Array<ArrayBuffer>>;
async function readFile(_path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
  return encoding === 'utf8' ? '' : new Uint8Array();
}

it('rejects a real non-isolated browser before loading Rolldown', async () => {
  expect(globalThis.crossOriginIsolated).toBe(false);
  await expect(import('#index.js')).resolves.toHaveProperty('rolldown');
  const filesystem: BundlerFileSystem = {
    exists: async () => false,
    readFile,
    writeFile: async () => undefined,
    ensureDir: async () => undefined,
  };
  await expect(
    createRolldownModuleVm({
      filesystem,
    }),
  ).rejects.toMatchObject({
    name: BrowserRolldownCapabilityError.name,
    code: 'ROLLDOWN_SHARED_MEMORY_UNAVAILABLE',
  });
});
