/**
 * The C# front-end's TypeScript half: a Roslyn surface payload becomes an {@link ApiCorpus}.
 *
 * The parsing lives in Roslyn (R3), so this module is deliberately thin — it
 * validates the payload's shape and hands the drafts to {@link createApiCorpus},
 * which owns id assignment and the derived totals. Anything that needs a C#
 * compiler belongs on the other side of the JSON.
 *
 * @module
 */

import { createApiCorpus } from '#model/api-corpus.js';
import type { ApiCorpus, ApiEntry, ApiEntryKind, ApiLanguageSpecific } from '#model/api-corpus.types.js';
import type { ApiEntryDraft } from '#model/api-corpus.js';

/** One entry as `Tau.PicoGK.Worker --emit-api` writes it. @public */
export type CsharpEntryPayload = Omit<ApiEntry, 'id' | 'members' | 'languageSpecific'> & {
  readonly members?: readonly CsharpEntryPayload[];
  readonly languageSpecific?: Extract<ApiLanguageSpecific, { language: 'csharp' }>;
};

/** The JSON document `Tau.PicoGK.Worker --emit-api` writes. @public */
export type CsharpSurfacePayload = {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly extractor: string;
  readonly diagnosticErrors: number;
  readonly entries: readonly CsharpEntryPayload[];
};

const entryKinds = new Set<string>([
  'module',
  'namespace',
  'class',
  'interface',
  'struct',
  'function',
  'method',
  'constructor',
  'property',
  'field',
  'type',
  'enum',
  'enumMember',
  'constant',
] satisfies ApiEntryKind[]);

/**
 * Read a Roslyn surface payload, rejecting anything the model cannot hold.
 *
 * The payload is produced by a tool in this repository, so this is a shape check
 * against drift, not a trust boundary: a renamed field must fail loudly here
 * rather than silently produce a corpus missing a third of its fields.
 *
 * @param value - Parsed JSON from `Tau.PicoGK.Worker --emit-api`.
 * @returns The payload, typed.
 * @throws When a required field is missing or an entry kind is unknown.
 * @public
 */
export const parseCsharpSurface = (value: unknown): CsharpSurfacePayload => {
  const fail = (reason: string): never => {
    throw new Error(`Malformed C# API surface payload: ${reason}`);
  };
  if (typeof value !== 'object' || value === null) {
    return fail('not an object');
  }
  const payload = value as Partial<Record<keyof CsharpSurfacePayload, unknown>>;
  for (const field of ['packageName', 'packageVersion', 'extractor'] as const) {
    if (typeof payload[field] !== 'string') {
      fail(`${field} is not a string`);
    }
  }
  const entries: readonly unknown[] = Array.isArray(payload.entries) ? (payload.entries as readonly unknown[]) : [];
  if (entries.length === 0) {
    fail('entries is empty');
  }
  const check = (candidate: unknown, path: string): CsharpEntryPayload => {
    if (typeof candidate !== 'object' || candidate === null) {
      fail(`${path} is not an object`);
    }
    const entry = candidate as CsharpEntryPayload;
    if (typeof entry.name !== 'string' || entry.name === '') {
      fail(`${path} has no name`);
    }
    if (!entryKinds.has(entry.kind)) {
      fail(`${path} has unknown kind ${String(entry.kind)}`);
    }
    for (const member of entry.members ?? []) {
      check(member, `${path}.${entry.name}`);
    }
    return entry;
  };
  return {
    ...(payload as CsharpSurfacePayload),
    entries: entries.map((entry) => check(entry, (entry as CsharpEntryPayload).path ?? '')),
  };
};

/**
 * Build the corpus for one C# surface.
 *
 * @param payload - A validated Roslyn surface payload.
 * @param extractionDate - ISO 8601 timestamp for the run.
 * @returns The corpus, with ids assigned and totals derived.
 * @public
 *
 * @example <caption>Regenerate the PicoGK corpus from a payload on disk</caption>
 * ```typescript
 * import { readFileSync } from 'node:fs';
 * import { parseCsharpSurface, toCsharpCorpus } from '#languages/csharp/csharp-corpus.js';
 *
 * const payload = parseCsharpSurface(JSON.parse(readFileSync('surface.json', 'utf8')));
 * const corpus = toCsharpCorpus(payload, new Date().toISOString());
 * ```
 */
export const toCsharpCorpus = (payload: CsharpSurfacePayload, extractionDate: string): ApiCorpus =>
  createApiCorpus(
    {
      language: 'csharp',
      packageName: payload.packageName,
      packageVersion: payload.packageVersion,
      extractor: payload.extractor,
      extractionDate,
    },
    payload.entries as readonly ApiEntryDraft[],
  );
