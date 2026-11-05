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

type Sibling = Readonly<{ path: string; at: number }>;

/* When a file was last written, or `undefined` when it is not there. */
const modifiedAt = async (files: ControlPlaneFiles, path: string): Promise<number | undefined> => {
  try {
    const stat = await files.stat(path);
    return stat.mtimeMs;
  } catch (error) {
    ignoreMissing(error);
    return undefined;
  }
};

/* The `.writing` siblings of a record, with their modification times. */
const siblingsOf = async (files: ControlPlaneFiles, path: string): Promise<Sibling[]> => {
  const [directory, name] = splitPath(path);
  const listed = await files.readdir(directory).catch((error: unknown) => {
    ignoreMissing(error);
    return [] as string[];
  });
  return Promise.all(
    listed
      .filter((entry) => entry.startsWith(`${name}.`) && entry.endsWith('.writing'))
      .map(async (entry): Promise<Sibling> => {
        const stat = await files.stat(`${directory}/${entry}`).catch(() => undefined);
        return { path: `${directory}/${entry}`, at: stat?.mtimeMs ?? 0 };
      }),
  );
};

/*
 * Rename the sibling into place. `landed` when it is the record now;
 * `overtaken` when another hand moved it or another writer landed first —
 * either way a record stands that is this text or newer.
 */
const landRecord = async (files: ControlPlaneFiles, writing: string, path: string): Promise<'landed' | 'overtaken'> => {
  try {
    await files.rename(writing, path);
    return 'landed';
  } catch (error) {
    if (isMissing(error)) {
      return 'overtaken';
    }
    if (!isExisting(error)) {
      throw error;
    }
  }
  await files.unlink(path).catch(ignoreMissing);
  try {
    await files.rename(writing, path);
    return 'landed';
  } catch (error) {
    if (!isMissing(error) && !isExisting(error)) {
      throw error;
    }
    /* Another writer landed between the unlink and the rename: its record stands, and this sibling is not needed. */
    await files.unlink(writing).catch(() => undefined);
    return 'overtaken';
  }
};

/*
 * Remove the siblings written no later than the one that just landed: their
 * writers stopped, or lost to it. A sibling written after it belongs to a
 * newer writer still on its way, and is left to land.
 */
const sweepSiblings = async (files: ControlPlaneFiles, path: string, landedAt: number): Promise<void> => {
  const siblings = await siblingsOf(files, path);
  const stale = siblings.filter((sibling) => sibling.at <= landedAt);
  await Promise.all(stale.map(async (sibling) => files.unlink(sibling.path).catch(() => undefined)));
};

/**
 * Replace one record whole.
 *
 * The new text is written to a sibling no other writer names
 * (`<path>.<uuid>.writing`) and renamed over the record. A provider that will
 * not rename over a file (the browser providers) refuses with `EEXIST`; the
 * record is unlinked and the sibling renamed into its place. A host that dies
 * between the two leaves no record and one whole sibling, which
 * {@link readControlRecord} answers from. Whichever step a writer stops at, a
 * reader sees the old text or the new one, never part of either.
 *
 * A writer that lands removes the siblings written no later than its own, so a
 * stopped writer's sibling lasts only until the next write. A rename that
 * finds its sibling gone (`ENOENT`) or loses to another writer (`EEXIST`
 * after the unlink) was overtaken by a newer write, which stands: the writer
 * writes again only when no record is there at all.
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
    const writtenAt = await modifiedAt(files, writing);
    // oxlint-disable-next-line no-await-in-loop -- one attempt after another.
    if ((await landRecord(files, writing, path)) === 'landed') {
      if (writtenAt !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- the one sweep, once landed.
        await sweepSiblings(files, path, writtenAt);
      }
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- one attempt after another.
    if ((await modifiedAt(files, path)) !== undefined) {
      return;
    }
  }
  throw new Error(`The control record ${path} could not be put in place.`);
};

/** How {@link readControlRecord} tells a whole record from a torn one. */
export type ControlRecordReading = Readonly<{
  /** Whether a text is a whole record: only a sibling that is one is answered. */
  accepts: (text: string) => boolean;
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

/**
 * Read one record, or `undefined` when there is none.
 *
 * A missing record is answered from the newest `.writing` sibling the caller
 * accepts as whole: its writer is about to land that text, or stopped between
 * unlinking the record and renaming it into place. A reader never moves or
 * removes a sibling — a live writer may still be renaming it, and a newer
 * record may land meanwhile — so the next writer that lands clears them.
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
  const readRecord = async (): Promise<string | undefined> => {
    try {
      return await files.readFile(path, 'utf8');
    } catch (error) {
      ignoreMissing(error);
      return undefined;
    }
  };
  const record = await readRecord();
  if (record !== undefined) {
    return record;
  }
  const siblings = await siblingsOf(files, path);
  const newestFirst = siblings.toSorted((left, right) => right.at - left.at || (left.path < right.path ? 1 : -1));
  for (const sibling of newestFirst) {
    // oxlint-disable-next-line no-await-in-loop -- newest first, until one is whole.
    const text = await files.readFile(sibling.path, 'utf8').catch(() => undefined);
    if (text !== undefined && reading.accepts(text)) {
      return text;
    }
  }
  /* A writer may have landed while the siblings were read, and swept them. */
  return readRecord();
};
