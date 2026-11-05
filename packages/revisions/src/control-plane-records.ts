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

const isExisting = (error: unknown): boolean => (error as { code?: unknown } | undefined)?.code === 'EEXIST';

/** How long a `.writing` sibling is left to its writer before a reader may promote it. */
export const controlRecordGrace = 2000;

/* Rename the sibling into place: true when it landed, false when another hand moved it or the record. */
const landRecord = async (files: ControlPlaneFiles, writing: string, path: string): Promise<boolean> => {
  try {
    await files.rename(writing, path);
    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }
    if (!isExisting(error)) {
      throw error;
    }
  }
  await files.unlink(path).catch(ignoreMissing);
  try {
    await files.rename(writing, path);
    return true;
  } catch (error) {
    if (!isMissing(error) && !isExisting(error)) {
      throw error;
    }
    /* Another writer landed between the unlink and the rename: this sibling is not needed. */
    await files.unlink(writing).catch(() => undefined);
    return false;
  }
};

/**
 * Replace one record whole.
 *
 * The new text is written to a sibling no other writer names
 * (`<path>.<uuid>.writing`) and renamed over the record. A provider that will
 * not rename over a file (the browser providers) refuses with `EEXIST`; the
 * record is unlinked and the sibling renamed into its place. A host that dies
 * between the two leaves no record and one whole sibling, which
 * {@link readControlRecord} promotes once its writer has had
 * {@link controlRecordGrace} to finish. Whichever step a writer stops at, a
 * reader sees the old text or the new one, never part of either.
 *
 * A rename that finds its sibling gone (`ENOENT`) lost it to a reader that
 * promoted it, so the write may have landed: the record is read back, and
 * written again only when it is not this text.
 *
 * @param files - Where the record lives.
 * @param path - The record's path, under `.git`.
 * @param body - Its whole new text.
 */
export const writeControlRecord = async (files: ControlPlaneFiles, path: string, body: string): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const writing = `${path}.${randomUuid()}.writing`;
    // oxlint-disable-next-line no-await-in-loop -- one attempt after another.
    await files.writeFile(writing, body);
    // oxlint-disable-next-line no-await-in-loop -- one attempt after another.
    if (await landRecord(files, writing, path)) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- one attempt after another.
    const landed = await files.readFile(path, 'utf8').catch((error: unknown) => {
      ignoreMissing(error);
      return undefined;
    });
    if (landed === body) {
      return;
    }
  }
  throw new Error(`The control record ${path} was replaced by another writer on every attempt.`);
};

/** How {@link readControlRecord} tells a whole record from a torn one. */
export type ControlRecordReading = Readonly<{
  /** Whether a text is a whole record: only a sibling that is one is answered or promoted. */
  accepts: (text: string) => boolean;
  /** The clock sibling ages are measured on. */
  now?: () => number;
}>;

/**
 * Whether a text parses as JSON this check accepts.
 *
 * @param check - What the parsed value must be.
 * @returns A validator for {@link readControlRecord}.
 */
export const jsonRecord =
  (check: (value: unknown) => boolean): ((text: string) => boolean) =>
  (text) => {
    try {
      return check(JSON.parse(text));
    } catch {
      return false;
    }
  };

type Sibling = Readonly<{ path: string; at: number }>;

/* Promote a stopped writer's sibling and remove the siblings older than it. */
const promote = async (
  files: ControlPlaneFiles,
  sibling: string,
  into: Readonly<{ path: string; older: readonly Sibling[] }>,
): Promise<void> => {
  try {
    await files.rename(sibling, into.path);
  } catch {
    /* Another reader or a writer put a record in place first: it answers next time. */
  }
  await Promise.all(into.older.map(async (stale) => files.unlink(stale.path).catch(() => undefined)));
};

/**
 * Read one record, or `undefined` when there is none.
 *
 * A missing record is answered from the newest `.writing` sibling the caller
 * accepts as whole: a writer between writing it and renaming it into place is
 * about to land that text. A sibling older than {@link controlRecordGrace} is
 * one whose writer stopped, and is promoted to the record; the siblings older
 * than it are removed. A sibling still within its grace is never moved, so a
 * writer that is still writing never loses its sibling.
 *
 * @param files - Where the record lives.
 * @param path - The record's path, under `.git`.
 * @param reading - How a whole record is told from a torn one.
 * @returns Its text.
 */
export const readControlRecord = async (
  files: ControlPlaneFiles,
  path: string,
  reading: ControlRecordReading,
): Promise<string | undefined> => {
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
  const dated = await Promise.all(
    siblings.map(async (entry): Promise<Sibling> => {
      const stat = await files.stat(`${directory}/${entry}`).catch(() => undefined);
      return { path: `${directory}/${entry}`, at: stat?.mtimeMs ?? 0 };
    }),
  );
  const newestFirst = dated.toSorted((left, right) => right.at - left.at || (left.path < right.path ? 1 : -1));
  const settled = (reading.now ?? Date.now)() - controlRecordGrace;
  for (const [position, sibling] of newestFirst.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- newest first, until one is whole.
    const text = await files.readFile(sibling.path, 'utf8').catch(() => undefined);
    if (text === undefined || !reading.accepts(text)) {
      continue;
    }
    if (sibling.at <= settled) {
      // oxlint-disable-next-line no-await-in-loop -- the one promotion.
      await promote(files, sibling.path, { path, older: newestFirst.slice(position + 1) });
    }
    return text;
  }
  return undefined;
};
