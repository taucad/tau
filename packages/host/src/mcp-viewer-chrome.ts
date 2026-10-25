/**
 * The viewer page's bar tools (workbench parity PAR-8): the render timeout Viewer settings offers, kept where the Tau
 * app keeps it (`entries[entry].renderTimeout` in `.tau/workbench/entries.json`), and Capture, which saves the page's
 * view as a PNG under the project's `exports/`.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';

import type { TauMcpViewerFailure } from '@taucad/mcp';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import { z } from 'zod';

/** The page-only tools' names. */
export const viewerChromeToolName = {
  /** Read or set the shown entry's render timeout. */
  settings: 'app_viewer_settings',
  /** Save the page's captured view under `exports/`. */
  saveCapture: 'app_save_capture',
} as const;

/** The longest render timeout the record takes. Milliseconds. */
const renderTimeoutLimit = 600_000;

/** The largest PNG a capture may save, in bytes. */
export const captureByteLimit = 8 * 1024 * 1024;

/** Arguments of `app_viewer_settings`: with `renderTimeout`, the entry's timeout is set first. */
export const viewerSettingsInputSchema = z
  .object({
    modelId: z.string().min(1).max(64),
    renderTimeout: z.number().int().min(0).max(renderTimeoutLimit).optional(),
  })
  .strict();

/** Arguments of `app_save_capture`. */
export const viewerSaveCaptureInputSchema = z
  .object({
    modelId: z.string().min(1).max(64),
    /** The PNG, base64. */
    data: z
      .string()
      .min(1)
      .max(Math.ceil(captureByteLimit / 3) * 4),
  })
  .strict();

/** Structured result of `app_viewer_settings`. */
export type ViewerSettingsResult = Readonly<{
  /** The entry's own render timeout, when it has one. Milliseconds; `0` disables it. */
  renderTimeout?: number | undefined;
  /** The timeout a render takes when the entry names none. Milliseconds. */
  defaultRenderTimeout: number;
}>;

/** Structured result of `app_save_capture`. */
export type ViewerSaveCaptureResult = Readonly<{ path: string; byteLength: number }>;

const failure = (errorCode: string, message: string): TauMcpViewerFailure => ({ errorCode, message });

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const readEntries = async (
  root: string,
): Promise<Readonly<{ text: string | undefined; entries: WorkbenchEntries | undefined }> | undefined> => {
  let text: string | undefined;
  try {
    text = await readFile(join(root, workbenchPaths.entries), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return { text: undefined, entries: undefined };
  }
  const read = workbenchRecords.entries.read(new TextEncoder().encode(text));
  /* An invalid record, or one from a newer Tau, is left alone. */
  return read.status === 'current' ? { text, entries: read.record } : undefined;
};

/**
 * The render timeout an entry's record names.
 *
 * @param root - The project folder.
 * @param entryPath - The entry, project-relative.
 * @returns The timeout in milliseconds, or `undefined` when the record names none or cannot be read.
 */
export const readRenderTimeout = async (root: string, entryPath: string): Promise<number | undefined> => {
  try {
    const read = await readEntries(root);
    return read?.entries?.entries[entryPath]?.renderTimeout;
  } catch {
    return undefined;
  }
};

/**
 * Set an entry's render timeout, keeping the rest of the record. The file is replaced only if it still holds what was
 * read; a record another writer changed meanwhile is read again once.
 *
 * @param root - The project folder.
 * @param entryPath - The entry, project-relative.
 * @param renderTimeout - The timeout in milliseconds; `0` disables it.
 * @returns Whether the record holds the timeout.
 */
const writeRenderTimeout = async (root: string, entryPath: string, renderTimeout: number): Promise<boolean> => {
  const absolute = join(root, workbenchPaths.entries);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a second read only after another writer won the first.
    const read = await readEntries(root);
    if (read === undefined) {
      return false;
    }
    const next = workbenchRecords.entries.serialize({
      version: 1,
      entries: {
        ...read.entries?.entries,
        [entryPath]: { ...read.entries?.entries[entryPath], renderTimeout },
      },
    });
    // oxlint-disable-next-line eslint/no-await-in-loop -- Ditto.
    await mkdir(dirname(absolute), { recursive: true });
    const temporary = `${absolute}.${randomBytes(6).toString('hex')}.tmp`;
    // oxlint-disable-next-line eslint/no-await-in-loop -- Ditto.
    await writeFile(temporary, next, 'utf8');
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Ditto.
      const current = await readFile(absolute, 'utf8').catch(() => undefined);
      if (current === read.text) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Ditto.
        await rename(temporary, absolute);
        return true;
      }
    } finally {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Ditto.
      await rm(temporary, { force: true });
    }
  }
  return false;
};

/**
 * Answer `app_viewer_settings` for one shown entry.
 *
 * @param input - The project, the entry, the server's default timeout and the request.
 * @returns The entry's settings, or why they could not be kept.
 */
export const viewerSettings = async ({
  root,
  entryPath,
  defaultRenderTimeout,
  request,
}: Readonly<{
  root: string;
  entryPath: string;
  defaultRenderTimeout: number;
  request: z.infer<typeof viewerSettingsInputSchema>;
}>): Promise<ViewerSettingsResult | TauMcpViewerFailure> => {
  if (request.renderTimeout !== undefined && !(await writeRenderTimeout(root, entryPath, request.renderTimeout))) {
    return failure(
      'RECORD_NOT_WRITTEN',
      `${workbenchPaths.entries} is invalid, from a newer Tau, or kept changing; the render timeout was not saved.`,
    );
  }
  const renderTimeout = await readRenderTimeout(root, entryPath);
  return { ...(renderTimeout === undefined ? {} : { renderTimeout }), defaultRenderTimeout };
};

/**
 * Save a captured view as `exports/<entry name>-capture-<n>.png`, the first `n` not taken.
 *
 * @param input - The project, the entry the view shows and the request.
 * @returns The saved file, or why it was refused.
 */
export const saveCapture = async ({
  root,
  entryPath,
  request,
}: Readonly<{
  root: string;
  entryPath: string;
  request: z.infer<typeof viewerSaveCaptureInputSchema>;
}>): Promise<ViewerSaveCaptureResult | TauMcpViewerFailure> => {
  const bytes = Buffer.from(request.data, 'base64');
  if (bytes.length > captureByteLimit) {
    return failure('RESULT_TOO_LARGE', 'The capture is larger than 8 MiB.');
  }
  if (bytes.length < pngSignature.length || pngSignature.some((byte, index) => bytes[index] !== byte)) {
    return failure('UNSUPPORTED_FORMAT', 'A capture is saved as PNG only.');
  }
  const stem =
    posix
      .basename(entryPath)
      .replace(/\.[^.]*$/u, '')
      .replaceAll(/[^\w.-]/gu, '_') || 'view';
  await mkdir(join(root, 'exports'), { recursive: true });
  for (let index = 1; index < 10_000; index += 1) {
    const path = `exports/${stem}-capture-${String(index)}.png`;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the first free name wins; `wx` never replaces a file.
      await writeFile(join(root, path), bytes, { flag: 'wx' });
      return { path, byteLength: bytes.length };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }
  return failure('NO_FREE_NAME', `exports/ has no free name for another ${stem} capture.`);
};
