/**
 * Assembly and traversal helpers for {@link ApiCorpus}.
 *
 * Extractors describe symbols; this module makes a corpus out of them. Ids are
 * assigned here rather than by each front-end so uniqueness is a property of the
 * model, not of five independent implementations remembering to check.
 *
 * @module
 */

import type { ApiCorpus, ApiCorpusMetadata, ApiEntry, ApiEntryKind, ApiLanguage } from '#model/api-corpus.types.js';

/** An entry as a front-end supplies it: no id, members not yet threaded. @public */
export type ApiEntryDraft = Omit<ApiEntry, 'id' | 'members'> & {
  readonly members?: readonly ApiEntryDraft[];
};

/** Metadata a front-end supplies. Totals are derived, never hand-counted. @public */
export type ApiCorpusMetadataDraft = Omit<ApiCorpusMetadata, 'totalEntries' | 'breakdown'>;

const idSegment = (value: string): string => value.replaceAll(/\s+/gu, '');

/**
 * The id a draft entry wants, before collision handling.
 *
 * Overloads never collide here: they are signatures of one entry, not separate
 * entries. A genuine collision is a name declared twice in one container under
 * different kinds — a TypeScript type and value sharing a name, say.
 */
const preferredId = (language: ApiLanguage, path: string | undefined, name: string): string =>
  path === undefined || path === ''
    ? `${language}:${idSegment(name)}`
    : `${language}:${idSegment(path)}.${idSegment(name)}`;

type IdContext = { readonly language: ApiLanguage; readonly taken: Set<string>; readonly parentPath?: string };

const assignIds = (drafts: readonly ApiEntryDraft[], context: IdContext): ApiEntry[] =>
  drafts.map((draft) => {
    const { members: draftMembers, ...rest } = draft;
    const { language, taken } = context;
    const path = draft.path ?? context.parentPath;
    const base = preferredId(language, path, draft.name);
    let id = base;
    if (taken.has(id)) {
      id = `${base}#${draft.kind}`;
      for (let index = 2; taken.has(id); index += 1) {
        id = `${base}#${draft.kind}-${index}`;
      }
    }
    taken.add(id);

    const memberPath = path === undefined || path === '' ? draft.name : `${path}.${draft.name}`;
    const members =
      draftMembers === undefined ? undefined : assignIds(draftMembers, { language, taken, parentPath: memberPath });

    return { ...rest, id, ...(members === undefined ? {} : { members }) } satisfies ApiEntry;
  });

/**
 * Every entry in the corpus, containers before their members.
 *
 * The coverage gate and the index renderer both walk this, so "addressable"
 * means exactly one thing across the substrate.
 *
 * @param corpus - The corpus to walk.
 * @returns Each entry once, in declaration order, depth-first.
 * @public
 *
 * @example <caption>Count every symbol a kernel exposes</caption>
 * ```typescript
 * import { flattenEntries } from '@taucad/api-extractor';
 * import type { ApiCorpus } from '@taucad/api-extractor';
 *
 * declare const corpus: ApiCorpus;
 * const total = [...flattenEntries(corpus)].length;
 * ```
 */
export function* flattenEntries(corpus: ApiCorpus): Generator<ApiEntry> {
  const walk = function* (entries: readonly ApiEntry[]): Generator<ApiEntry> {
    for (const entry of entries) {
      yield entry;
      if (entry.members !== undefined) {
        yield* walk(entry.members);
      }
    }
  };
  yield* walk(corpus.entries);
}

/**
 * How many entries of each kind the corpus holds, members included.
 *
 * The accumulator has a null prototype deliberately: `constructor` is a real
 * {@link ApiEntryKind}, and on a plain object it would read
 * `Object.prototype.constructor` instead of a count.
 *
 * @param corpus - The corpus to count.
 * @returns Counts keyed by {@link ApiEntryKind}.
 * @public
 */
export const countByKind = (corpus: ApiCorpus): Record<string, number> => {
  const breakdown = Object.create(null) as Record<string, number>;
  for (const entry of flattenEntries(corpus)) {
    breakdown[entry.kind] = (breakdown[entry.kind] ?? 0) + 1;
  }
  return { ...breakdown };
};

/**
 * Build a corpus, assigning stable unique ids and deriving the totals.
 *
 * @param metadata - Provenance minus the derived counts.
 * @param entries - Draft entries from one front-end, in declaration order.
 * @returns A corpus whose every entry has a unique id.
 * @public
 *
 * @example <caption>A one-entry corpus</caption>
 * ```typescript
 * import { createApiCorpus } from '@taucad/api-extractor';
 *
 * const corpus = createApiCorpus(
 *   {
 *     language: 'typescript',
 *     packageName: 'replicad',
 *     packageVersion: '0.19.2',
 *     extractor: 'TypeScript 5.9.3',
 *     extractionDate: '2026-09-10T00:00:00.000Z',
 *   },
 *   [{ name: 'drawCircle', kind: 'function', signatures: [{ parameters: [], text: 'drawCircle(): Drawing' }] }],
 * );
 * ```
 */
export const createApiCorpus = (metadata: ApiCorpusMetadataDraft, entries: readonly ApiEntryDraft[]): ApiCorpus => {
  const identified = assignIds(entries, { language: metadata.language, taken: new Set<string>() });
  const corpus = { metadata: { ...metadata, totalEntries: 0, breakdown: {} }, entries: identified } satisfies ApiCorpus;
  const breakdown = countByKind(corpus);
  const totalEntries = Object.values(breakdown).reduce((sum, count) => sum + count, 0);
  return { metadata: { ...metadata, totalEntries, breakdown }, entries: identified };
};

/** Kinds that carry callable signatures. @public */
export const callableKinds: ReadonlySet<ApiEntryKind> = new Set(['function', 'method', 'constructor']);
