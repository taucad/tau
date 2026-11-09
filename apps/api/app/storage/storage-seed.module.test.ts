import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { storageSeedFiles } from '@taucad/api-object-storage/seed';
import { storageSeedDirectory } from '#storage/storage-seed.module.js';

describe('storageSeedDirectory', () => {
  it("should read Tau's infra/seed from source", async () => {
    const directory = storageSeedDirectory();

    expect(directory).toBe(resolve(import.meta.dirname, '../../../../infra/seed'));
    expect(await readdir(directory)).toEqual(expect.arrayContaining(Object.values(storageSeedFiles)));
  });

  it('should prefer the seed directory beside the bundle', async () => {
    const bundle = await mkdtemp(join(tmpdir(), 'tau-api-dist-'));
    try {
      await mkdir(join(bundle, 'seed'));
      expect(storageSeedDirectory(bundle)).toBe(join(bundle, 'seed'));
    } finally {
      await rm(bundle, { recursive: true, force: true });
    }
  });
});
