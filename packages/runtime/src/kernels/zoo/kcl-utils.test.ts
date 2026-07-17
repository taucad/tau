// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FileSystemManager } from '#kernels/zoo/filesystem-manager.js';
import { KclUtilities } from '#kernels/zoo/kcl-utils.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';

const memoryFs = (files: Map<string, string>): KernelFileSystem =>
  ({
    async readFile(path: string) {
      const hit = files.get(path);
      if (hit === undefined) {
        throw new Error(`ENOENT ${path}`);
      }

      return new TextEncoder().encode(hit);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async readdir() {
      return ['main.kcl'];
    },
  }) as unknown as KernelFileSystem;

describe('KclUtilities execution normalization', () => {
  it('partitions issues into errors vs warnings on executeMockKcl', async () => {
    const fs = new FileSystemManager(memoryFs(new Map([['/main.kcl', 'x = 1\n']])));
    const utils = new KclUtilities({ fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl('x = 1\n');
    const outcome = await utils.executeMockKcl(program, '/main.kcl');

    expect(outcome.warnings).toBeDefined();
    expect(Array.isArray(outcome.errors)).toBe(true);
    expect(Array.isArray(outcome.warnings)).toBe(true);
  });
});
