import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createOpenFileQueue } from '#main/open-files.js';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('createOpenFileQueue', () => {
  it('captures supported absolute paths once and returns bounded bytes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-open-file-'));
    temporary.push(root);
    const path = join(root, 'part.mesh.xml');
    writeFileSync(path, new Uint8Array([1, 2, 3]));
    const queue = createOpenFileQueue({ extensions: ['mesh.xml'], maxBytes: 3, maxFiles: 2 });

    expect(queue.enqueue([path, path, join(root, 'ignored.txt')])).toBe(1);
    await expect(queue.consume()).resolves.toEqual([{ name: 'part.mesh.xml', bytes: new Uint8Array([1, 2, 3]) }]);
    expect(queue.hasPending()).toBe(false);
  });

  it('rejects an opened file over the manifest limit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-open-file-'));
    temporary.push(root);
    const path = join(root, 'part.glb');
    writeFileSync(path, new Uint8Array([1, 2]));
    const queue = createOpenFileQueue({ extensions: ['glb'], maxBytes: 1, maxFiles: 1 });
    queue.enqueue([path]);

    await expect(queue.consume()).rejects.toThrow('byte limit');
  });
});
