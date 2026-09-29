/* oxlint-disable eslint/no-await-in-loop -- Directory-handle traversal is path-ordered and inherently sequential. */
import * as target from '#support/external-target.js';
import { readOpfsTree } from '#support/project-storage-state.js';

/** The debug project-file-tree fixture creates a Home project at its URL slug. */
export const projectSlug = async (): Promise<string> => new URL(await target.currentUrl()).pathname.split('/').at(-1)!;

const projectTreeRoot = async (workspace?: string): Promise<string> =>
  workspace ? `${workspace}/${await projectSlug()}` : projectSlug();

export const readWorkbenchTree = async (workspace?: string): Promise<Readonly<Record<string, string>>> =>
  readOpfsTree(await projectTreeRoot(workspace));

/** Physical modification time distinguishes a no-op rerender from an identical-byte write loop. */
export const readWorkbenchModifiedAt = async (path: string, workspace?: string): Promise<number> =>
  target.evaluate(
    async ({ path, rootPath }) => {
      let directory = await navigator.storage.getDirectory();
      for (const part of [...rootPath.split('/'), ...path.split('/').filter(Boolean).slice(0, -1)]) {
        directory = await directory.getDirectoryHandle(part);
      }
      const name = path.split('/').findLast(Boolean)!;
      const handle = await directory.getFileHandle(name);
      const file = await handle.getFile();
      return file.lastModified;
    },
    { path, rootPath: await projectTreeRoot(workspace) },
  );

/** Model an editor outside Tau changing the actual project bytes. */
export const writeWorkbenchFile = async (path: string, content: string, workspace?: string): Promise<void> =>
  target.evaluate(
    async ({ path, content, rootPath }) => {
      const root = await navigator.storage.getDirectory();
      let directory = root;
      for (const part of rootPath.split('/')) {
        directory = await directory.getDirectoryHandle(part);
      }
      const parts = path.split('/').filter(Boolean);
      for (const part of parts.slice(0, -1)) {
        directory = await directory.getDirectoryHandle(part, { create: true });
      }
      const file = await directory.getFileHandle(parts.at(-1)!, { create: true });
      const writable = await file.createWritable();
      await writable.write(content);
      await writable.close();
    },
    { path, content, rootPath: await projectTreeRoot(workspace) },
  );
