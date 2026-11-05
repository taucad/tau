/**
 * The device's own records under `.git`: the sync queue, the record devices
 * and the removed checkouts.
 *
 * They are the store's, not the project's, so they are read and written
 * through the rooted view's private store — no claim, no change event, no
 * index entry (charter D7, I6) — and only a filesystem without one (a bare
 * provider) is written directly.
 *
 * @module
 */

import type { PrivateStore } from '@taucad/filesystem';
import type { RevisionFileSystem } from '#revision-effects.types.js';

/** What a control-plane record is read and written with. */
export type ControlPlaneFiles = Pick<PrivateStore, 'readFile' | 'writeFile' | 'rename' | 'exists'>;

/**
 * The files a project's `.git` records live in.
 *
 * @param records - The project's records filesystem.
 * @returns Its private store, or the filesystem itself when it has none.
 */
export const controlPlaneFiles = (records: RevisionFileSystem): ControlPlaneFiles => records.privateStore ?? records;

/**
 * Replace one record whole: written beside it, then renamed over it, so a
 * reader never sees half of it. A provider that will not rename over a file
 * (the browser providers) has its record written in place, which those
 * providers commit atomically.
 *
 * @param files - Where the record lives.
 * @param path - The record's path, under `.git`.
 * @param body - Its whole new text.
 */
export const writeControlRecord = async (files: ControlPlaneFiles, path: string, body: string): Promise<void> => {
  try {
    await files.writeFile(`${path}.writing`, body);
    await files.rename(`${path}.writing`, path);
  } catch {
    await files.writeFile(path, body);
  }
};
