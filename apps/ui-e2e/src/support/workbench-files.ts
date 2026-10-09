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

/** Bounded receipts from the debug route's actual captured provider watches. */
export type WorkbenchObservationEvidence = {
  readonly registrations: Readonly<Record<string, number>>;
  readonly disposed: number;
  readonly active: ReadonlyArray<{ readonly path: string; readonly watches: number }>;
};
type WorkbenchObservationControl = {
  close(path: string): number;
  hold(path: string): void;
  reject(path: string): void;
  release(path: string): void;
  evidence(): WorkbenchObservationEvidence;
  restore(): void;
};

/** Exercise only the exact watch paths opted into by the debug fixture URL. */
export const controlWorkbenchObservation = async (
  action: 'close' | 'hold' | 'reject' | 'release',
  path: string,
): Promise<WorkbenchObservationEvidence & { readonly closed: number }> =>
  target.evaluate(
    ({ action, path }) => {
      const control = (globalThis as typeof globalThis & { __tauE2eObservationWatch?: WorkbenchObservationControl })
        .__tauE2eObservationWatch;
      if (!control) {
        throw new Error('The current fixture did not opt into observation watch controls.');
      }
      const closed = action === 'close' ? control.close(path) : 0;
      if (action !== 'close') {
        control[action](path);
      }
      return { ...control.evidence(), closed };
    },
    { action, path },
  );

/** Release actual captured watches and restore the production watch implementation. */
export const restoreWorkbenchObservation = async (): Promise<void> =>
  target.evaluate(() => {
    (
      globalThis as typeof globalThis & { __tauE2eObservationWatch?: WorkbenchObservationControl }
    ).__tauE2eObservationWatch?.restore();
  }, undefined);
