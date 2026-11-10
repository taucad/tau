/**
 * The durable half of the prefix stamp (provider reasoning replay contract, P1 and P2): what an assistant row records
 * about the request that produced it, as `metadata.prefix`. The transport computes it (`#transport/prefix-stamp.js`);
 * the ledger and the transport read it back here, with no model codec in the import graph.
 */
import type { JsonValue } from '#log/event-types.js';

/**
 * Why a request did not reproduce the previous request's prefix. Every sanctioned break is one of these; anything
 * else is `unsanctioned`.
 *
 * @public
 */
export const prefixBreakCauses = [
  /** A summary replaced the head of the history. */
  'compaction',
  /** Old tool results were cleared in place. */
  'clearing',
  /** The attachment budget omitted older attachments. */
  'attachment-eviction',
  /** The model changed. */
  'model',
  /** The prompt or tool text differs under another release. */
  'definitions',
  /** The system text changed under the same release: mode, testing flag or kernel. */
  'instructions',
  /** The tool set changed under the same release. */
  'tools',
  /** The reasoning level changed. */
  'settings',
  /** The prefix changed and nothing above explains it. */
  'unsanctioned',
] as const;

/** One {@link prefixBreakCauses} value. @public */
export type PrefixBreakCause = (typeof prefixBreakCauses)[number];

/**
 * `metadata.prefix` on an assistant row: what the request that produced the row sent before it.
 *
 * @public
 */
export type PrefixStamp = {
  /** Chained digest of the whole request prefix; native reasoning excluded. */
  readonly digest: string;
  /** Digest of the system text. */
  readonly system: string;
  /** Digest of the tool definitions, by name. */
  readonly tools: string;
  /** The reasoning level the request ran at. */
  readonly settings: string;
  /** The composing build's release label, when it has one. */
  readonly release?: string;
  /** The newest compaction summary the request held. */
  readonly summary?: string;
  /** How many cleared tool results the request held. */
  readonly cleared?: number;
  /** How many attachments the request's budget omitted. */
  readonly evicted?: number;
  /** How many native reasoning payloads of this model the request replayed: their rows' prefixes still matched. */
  readonly replayed?: number;
  /** Why this request did not reproduce the previous one's prefix; absent when it did. */
  readonly break?: PrefixBreakCause;
  /** How many native reasoning payloads the break took out of what the model reads, stale or summarised away. */
  readonly dropped?: number;
};

/**
 * Read a stamp back from a durable row's metadata.
 *
 * @internal
 * @param value - `metadata.prefix` of an assistant row.
 * @returns The stamp, or `undefined` for a row written before stamps or one this build cannot read.
 */
export const readPrefixStamp = (value: unknown): PrefixStamp | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Readonly<Record<string, JsonValue | undefined>>;
  const { digest, system, tools, settings, release, summary, cleared, evicted, replayed, dropped } = record;
  const cause = prefixBreakCauses.find((candidate) => candidate === record['break']);
  if (
    typeof digest !== 'string' ||
    typeof system !== 'string' ||
    typeof tools !== 'string' ||
    typeof settings !== 'string'
  ) {
    return undefined;
  }
  return {
    digest,
    system,
    tools,
    settings,
    ...(typeof release === 'string' ? { release } : {}),
    ...(typeof summary === 'string' ? { summary } : {}),
    ...(typeof cleared === 'number' ? { cleared } : {}),
    ...(typeof evicted === 'number' ? { evicted } : {}),
    ...(typeof replayed === 'number' ? { replayed } : {}),
    ...(cause === undefined ? {} : { break: cause }),
    ...(typeof dropped === 'number' ? { dropped } : {}),
  };
};
