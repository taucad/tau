/**
 * An in-memory `VmFileSystem` for runner tests.
 *
 * Test support: it lets a runner suite execute real spec modules through the
 * real VM without touching the disk, which is what keeps those suites honest
 * (they exercise `runGeoSpecModule`, not a stub of it).
 *
 * @module
 */

import type { VmFileSystem } from '#runner/node/node-vm-filesystem.js';

/**
 * Build a filesystem over a path → source map.
 *
 * @param files - Root-relative VM paths and their contents.
 * @returns The filesystem.
 * @public
 */
export const memoryFileSystem = (files: Readonly<Record<string, string>>): VmFileSystem => {
  const table = new Map(Object.entries(files));
  const read = (async (path: string, encoding?: 'utf8') => {
    const content = table.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? content : new TextEncoder().encode(content);
  }) as VmFileSystem['readFile'];
  return {
    exists: async (path: string) => table.has(path),
    readFile: read,
    writeFile: async (path: string, content: string) => {
      table.set(path, content);
    },
    ensureDir: async () => undefined,
  };
};

/**
 * A spec module with one passing test.
 *
 * @param name - The test name.
 * @returns Module source.
 * @public
 */
export const passingSpec = (name: string): string => `
  import { describe, it } from 'geospec';
  describe('${name}', () => {
    it('passes', () => {});
  });
`;

/**
 * A spec module whose single test throws.
 *
 * @param name - The test name.
 * @returns Module source.
 * @public
 */
export const failingSpec = (name: string): string => `
  import { describe, it } from 'geospec';
  describe('${name}', () => {
    it('fails', () => { throw new Error('nope'); });
  });
`;
