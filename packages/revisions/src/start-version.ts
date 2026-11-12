/**
 * The Start version: every project's first entry, V1 (blueprint A6, Q8).
 *
 * Tau mints it when it creates the project's store, so History shows V1 · Start
 * before any turn. The creation flows say how the project came to be in one
 * small unversioned record, {@link startRecordPath}; the first open that
 * creates the store reads it, mints the entry with capture `create` or
 * `import`, and removes it. A GitHub link mints its own at bootstrap.
 *
 * Read side: an entry with capture `create` or `import` reads as Start, and so
 * does the root entry of a project an older build made, which is usually a
 * turn's base cut. No tag is needed (blueprint "What version numbers need").
 */

import type { RecordedProvenance, RevisionSummary } from '#revision-authority.js';

/** How a project came to be, as its creation flow records it. @public */
export type StartOrigin = 'created' | 'github' | 'folder' | 'zip';

/**
 * What a row's Start reads as: one of {@link StartOrigin}, or `imported` for
 * an `import` entry whose summary Tau did not write.
 *
 * @public
 */
export type StartReading = StartOrigin | 'imported';

/**
 * The record a creation flow writes beside the project's files: a member of
 * `.tau` that no registry row names, so it is never versioned.
 *
 * @public
 */
export const startRecordPath = '.tau/start.json';

/* The summaries the Start entry is written with, and read back by. One table, so writer and reader agree (I7). */
const startSummaries: Readonly<Record<StartOrigin, string>> = Object.freeze({
  created: 'Project created',
  github: 'Imported from GitHub',
  folder: 'Imported from a folder',
  zip: 'Imported from a zip',
});

const origins = Object.keys(startSummaries) as readonly StartOrigin[];

const isStartOrigin = (value: unknown): value is StartOrigin =>
  typeof value === 'string' && (origins as readonly string[]).includes(value);

/**
 * The generated summary of a Start entry.
 *
 * @param origin - How the project came to be.
 * @returns The commit title `git log` shows.
 * @public
 */
export const startSummary = (origin: StartOrigin): string => startSummaries[origin];

/**
 * The trigger a Start entry records.
 *
 * @param origin - How the project came to be.
 * @returns `create` for a project made in Tau, `import` for one brought in.
 * @public
 */
export const startTrigger = (origin: StartOrigin): 'create' | 'import' => (origin === 'created' ? 'create' : 'import');

/**
 * Encode the creation record.
 *
 * @param origin - How the project came to be.
 * @returns The bytes of {@link startRecordPath}.
 * @public
 */
export const serializeStartRecord = (origin: StartOrigin): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(`${JSON.stringify({ version: 1, origin })}\n`);

/**
 * Decode the creation record, refusing anything else.
 *
 * @param bytes - The bytes of {@link startRecordPath}.
 * @returns The origin, or `undefined` for a record this build did not write.
 * @public
 */
export const parseStartRecord = (bytes: Uint8Array<ArrayBuffer>): StartOrigin | undefined => {
  if (bytes.byteLength > 1024) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const { version, origin, ...rest } = parsed as Readonly<Record<string, unknown>>;
  return version === 1 && Object.keys(rest).length === 0 && isStartOrigin(origin) ? origin : undefined;
};

/**
 * Whether one entry reads as the Start version, and how.
 *
 * An entry Tau minted as Start (`create` or `import`) says so. The root entry
 * of an older project reads as Start too, unless it is a commit Tau did not
 * write (an imported repository's own first commit: `import`, no capture).
 *
 * @param entry - The entry's parents, provenance and summary.
 * @returns How it reads, or `undefined` when it is not Start.
 * @public
 */
export const startReadingOf = (
  entry: Readonly<{
    parents: readonly string[];
    provenance: Pick<RecordedProvenance, 'source' | 'capture'>;
    summary: RevisionSummary;
  }>,
): StartReading | undefined => {
  const { capture, source } = entry.provenance;
  if (capture === 'create') {
    return 'created';
  }
  if (capture === 'import') {
    return origins.find((origin) => startSummaries[origin] === entry.summary.generated) ?? 'imported';
  }
  if (entry.parents.length > 0 || (source === 'import' && capture === undefined)) {
    return undefined;
  }
  return 'created';
};
