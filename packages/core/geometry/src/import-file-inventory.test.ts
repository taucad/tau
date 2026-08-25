import { describe, expect, it } from 'vitest';

import { createImportFileInventory } from '#import-file-inventory.js';

const encode = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

const createFilesystem = (files: Readonly<Record<string, Uint8Array<ArrayBuffer>>>) => ({
  async readdir(directory: string) {
    const prefix = directory === '/' ? '/' : `${directory}/`;
    return Object.keys(files)
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map((path) => path.slice(prefix.length));
  },
  async stat(path: string) {
    if (!(path in files)) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
    return { type: 'file' };
  },
  async readFile(path: string) {
    const bytes = files[path];
    if (!bytes) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
    return bytes;
  },
});

describe('createImportFileInventory', () => {
  it('discovers sibling and nested glTF resources deterministically', async () => {
    const inventory = await createImportFileInventory(
      createFilesystem({
        '/main.gltf': encode(JSON.stringify({ buffers: [{ uri: 'mesh.bin' }], images: [{ uri: 'textures/a.png' }] })),
        '/mesh.bin': encode('mesh'),
        '/readme.txt': encode('sibling'),
        '/textures/a.png': encode('image'),
      }),
      '/main.gltf',
    );

    expect(inventory.resolved).toEqual(['/main.gltf', '/mesh.bin', '/readme.txt', '/textures/a.png']);
    expect(inventory.unresolved).toEqual([]);
    expect(inventory.resolver.exists('textures/a.png')).toBe(true);
  });

  it('reports missing referenced resources as canonical paths', async () => {
    const inventory = await createImportFileInventory(
      createFilesystem({
        '/models/main.gltf': encode(JSON.stringify({ buffers: [{ uri: '../shared/model.bin' }] })),
      }),
      '/models/main.gltf',
    );

    expect(inventory.resolved).toEqual(['/models/main.gltf']);
    expect(inventory.unresolved).toEqual(['/shared/model.bin']);
  });
});
