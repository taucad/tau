import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { executeCodeInNode } from '#node-module-execution.js';

const temporaryDirectories = async (): Promise<string[]> => {
  const entries = await readdir(tmpdir());
  return entries.filter((name) => name.startsWith('taucad-rolldown-')).sort();
};

describe('executeCodeInNode', () => {
  it('uses unique module URLs and removes temporary directories', async () => {
    const before = await temporaryDirectories();
    const results = await Promise.all(
      Array.from({ length: 4 }, async (_, index) =>
        executeCodeInNode<{ readonly default: number }>(`export default ${index};`, new AbortController().signal),
      ),
    );

    expect(results.map(({ value }) => value.default)).toEqual([0, 1, 2, 3]);
    expect(new Set(results.map(({ entryUrl }) => entryUrl))).toHaveLength(4);
    await expect(temporaryDirectories()).resolves.toEqual(before);
  });

  it('removes temporary directories after evaluation failure and abort', async () => {
    const before = await temporaryDirectories();
    await expect(
      executeCodeInNode('throw new Error("fixture failure");', new AbortController().signal),
    ).rejects.toThrow('fixture failure');

    const controller = new AbortController();
    controller.abort();
    await expect(executeCodeInNode('export default 1;', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(temporaryDirectories()).resolves.toEqual(before);
  });
});
