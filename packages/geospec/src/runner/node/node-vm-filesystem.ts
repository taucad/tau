/**
 * Node-backed `VmFileSystem` shared by the CLI and pool worker entries (R3):
 * each pool worker self-provisions its filesystem from `projectPath`, so no
 * filesystem object ever crosses the worker wire.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { VmFileSystem } from '@taucad/vm';

const resolveNodeVmPath = (options: { root: string; path: string }): string =>
  isAbsolute(options.path) ? options.path : join(options.root, options.path);

/** Create a Node `VmFileSystem` rooted at `root`. */
export const createNodeVmFileSystem = (root: string): VmFileSystem => {
  async function readNodeVmFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readNodeVmFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readNodeVmFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = await readFile(resolveNodeVmPath({ root, path }));
    if (encoding === 'utf8') {
      return content.toString('utf8');
    }
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    return copy;
  }

  return {
    async exists(path: string): Promise<boolean> {
      try {
        await stat(resolveNodeVmPath({ root, path }));
        return true;
      } catch {
        return false;
      }
    },

    readFile: readNodeVmFile,

    async writeFile(path: string, content: string): Promise<void> {
      await writeFile(resolveNodeVmPath({ root, path }), content, 'utf8');
    },

    async ensureDir(path: string): Promise<void> {
      await mkdir(resolveNodeVmPath({ root, path }), { recursive: true });
    },
  };
};
