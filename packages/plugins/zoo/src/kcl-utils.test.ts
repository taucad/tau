// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

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
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl('x = 1\n');
    const outcome = await utils.executeMockKcl(program, '/main.kcl');

    expect(outcome.warnings).toBeDefined();
    expect(Array.isArray(outcome.errors)).toBe(true);
    expect(Array.isArray(outcome.warnings)).toBe(true);
  });

  it('preserves KCL numeric unit types in mock execution variables', async () => {
    const source = `@settings(defaultLengthUnit = mm, kclVersion = 1.0)
length = 12mm
angle = 30deg
count = 3_
derived = length + 2cm
area = 2mm * 3mm
bare = 7
`;
    const fs = new FileSystemManager(memoryFs(new Map([['/main.kcl', source]])));
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl(source);
    const { variables } = await utils.executeMockKcl(program, '/main.kcl');

    expect(variables['length']).toMatchObject({ ty: { type: 'Length', mm: null } });
    expect(variables['angle']).toMatchObject({ ty: { type: 'Angle', degrees: null } });
    expect(variables['count']).toMatchObject({ ty: { type: 'Count' } });
    expect(variables['derived']).toMatchObject({ value: 32, ty: { type: 'Length', mm: null } });
    expect(variables['area']).toMatchObject({ ty: { type: 'Unknown' } });
    expect(variables['bare']).toMatchObject({ ty: { type: 'Default', len: 'mm', angle: 'degrees' } });
  });
});
