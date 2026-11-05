/**
 * The device's own records under `.git`: the sync queue, the record devices,
 * the removed checkouts and the object store's retirement record.
 *
 * They are the store's, not the project's, so they are read and written
 * through the rooted view's private store — no claim, no change event, no
 * index entry (charter D7, I6) — and only a filesystem without one (a bare
 * provider) is written directly.
 *
 * @module
 */

import type { PrivateStore } from '@taucad/filesystem';
import { randomUuid } from '@taucad/utils/id';
import type { RevisionFileSystem } from '#revision-effects.types.js';

/** What a control-plane record is read and written with. */
export type ControlPlaneFiles = Pick<PrivateStore, 'readFile' | 'writeFile' | 'rename' | 'unlink' | 'readdir' | 'stat'>;

/**
 * The files a project's `.git` records live in.
 *
 * @param records - The project's records filesystem.
 * @returns Its private store, or the filesystem itself when it has none.
 */
export const controlPlaneFiles = (records: RevisionFileSystem): ControlPlaneFiles => records.privateStore ?? records;

const isMissing = (error: unknown): boolean => {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  return code === 'ENOENT' || code === 'ENOTDIR' || name === 'NotFoundError';
};

const ignoreMissing = (error: unknown): void => {
  if (!isMissing(error)) {
    throw error;
  }
};

const splitPath = (path: string): readonly [directory: string, name: string] => {
  const slash = path.lastIndexOf('/');
  return [path.slice(0, slash), path.slice(slash + 1)];
};

/**
 * Replace one record whole.
 *
 * The new text is written to a sibling no other writer names
 * (`<path>.<uuid>.writing`) and renamed over the record. A provider that will
 * not rename over a file (the browser providers) has the record unlinked
 * first and the sibling renamed into its place; a host that dies between the
 * two leaves no record and one whole sibling, which {@link readControlRecord}
 * promotes. Whichever step a writer stops at, a reader sees the old text or
 * the new one, never part of either.
 *
 * @param files - Where the record lives.
 * @param path - The record's path, under `.git`.
 * @param body - Its whole new text.
 */
export const writeControlRecord = async (files: ControlPlaneFiles, path: string, body: string): Promise<void> => {
  const writing = `${path}.${randomUuid()}.writing`;
  await files.writeFile(writing, body);
  try {
    await files.rename(writing, path);
  } catch {
    await files.unlink(path).catch(ignoreMissing);
    await files.rename(writing, path);
  }
};

/**
 * Read one record, or `undefined` when there is none.
 *
 * A missing record whose writer stopped between unlinking it and renaming its
 * replacement into place is recovered: the newest whole `.writing` sibling is
 * promoted to the record and the older ones are removed.
 *
 * @param files - Where the record lives.
 * @param path - The record's path, under `.git`.
 * @returns Its text.
 */
export const readControlRecord = async (files: ControlPlaneFiles, path: string): Promise<string | undefined> => {
  try {
    return await files.readFile(path, 'utf8');
  } catch (error) {
    ignoreMissing(error);
  }
  const [directory, name] = splitPath(path);
  const listed = await files.readdir(directory).catch((error: unknown) => {
    ignoreMissing(error);
    return [] as string[];
  });
  const siblings = listed.filter((entry) => entry.startsWith(`${name}.`) && entry.endsWith('.writing'));
  if (siblings.length === 0) {
    return undefined;
  }
  const dated = await Promise.all(
    siblings.map(async (entry) => {
      const stat = await files.stat(`${directory}/${entry}`).catch(() => undefined);
      return { entry, at: stat?.mtimeMs ?? 0 };
    }),
  );
  const [newest, ...stale] = dated.toSorted((left, right) => right.at - left.at || (left.entry < right.entry ? 1 : -1));
  try {
    await files.rename(`${directory}/${newest!.entry}`, path);
  } catch {
    /* Another reader or a writer put a record in place first: it answers. */
  }
  await Promise.all(stale.map(async ({ entry }) => files.unlink(`${directory}/${entry}`).catch(() => undefined)));
  try {
    return await files.readFile(path, 'utf8');
  } catch (error) {
    ignoreMissing(error);
    return undefined;
  }
};
