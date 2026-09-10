/**
 * Deciding which entries land in which T3 shard.
 *
 * The grouping axis is an explicit input, never inferred. That is the design
 * decision the previous renderer never made: `generateCompactMarkdown` sorted by
 * name alone while `generateMarkdown` grouped by module, and the three sources
 * disagreed about which field even existed — replicad populated `category` and
 * never `module`, jscad the reverse. A renderer that guesses produces ungrouped
 * output for two of every three inputs.
 *
 * @module
 */

import { flattenEntries } from '#model/api-corpus.js';
import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';

/** The repo's estimate: four characters to a token. @public */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/** How a corpus is divided into shards. @public */
export type ShardPlanOptions = {
  /**
   * The grouping axis. Explicit, because no single field is populated across
   * every language.
   */
  readonly groupBy: (entry: ApiEntry) => string;
  /** Token ceiling for one shard before it splits. Corpus spec: 8k. */
  readonly maxShardTokens?: number;
  /**
   * Groups materialized eagerly. Everything else is generated but fetched on
   * demand. R14 uses this for libcascade's authoring core.
   */
  readonly eagerGroups?: readonly string[];
};

/** One rendered shard's contents and tier. @public */
export type ShardPlanEntry = {
  /** Shard file basename without extension, e.g. `api-sketching`. */
  readonly slug: string;
  readonly title: string;
  readonly entries: readonly ApiEntry[];
  readonly tier: 'eager' | 'cold';
};

const defaultMaxShardTokens = 8000;

const slugify = (value: string): string =>
  value
    .replaceAll(/[^\dA-Za-z]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .toLowerCase() || 'other';

/**
 * Top-level entries only: members render inside their container's shard, so
 * counting them here would place one symbol in two shards and break the
 * "every member in exactly one shard" half of the completeness rule.
 */
const topLevel = (corpus: ApiCorpus): readonly ApiEntry[] => corpus.entries;

const entryWeight = (entry: ApiEntry): number => {
  const own = (entry.signatures ?? []).reduce((sum, signature) => sum + estimateTokens(signature.text), 0);
  const docs = estimateTokens(entry.docs?.summary ?? '');
  const members = (entry.members ?? []).reduce((sum, member) => sum + entryWeight(member), 0);
  return own + docs + members + 8;
};

/**
 * Group a corpus into shards, splitting any group over the token ceiling.
 *
 * A split group keeps its name and gains an ordinal (`api-ncollection-2`), so a
 * pointer in the index always names a file that exists.
 *
 * @param corpus - The corpus to divide.
 * @param options - Grouping axis, ceiling and eager set.
 * @returns Shards in stable order, each non-empty.
 * @public
 *
 * @example <caption>Group by curated category, 8k ceiling</caption>
 * ```typescript
 * import { planShards } from '@taucad/api-extractor';
 * import type { ApiCorpus, ApiEntry } from '@taucad/api-extractor';
 *
 * declare const corpus: ApiCorpus;
 * const shards = planShards(corpus, { groupBy: (entry: ApiEntry) => entry.category ?? 'other' });
 * ```
 */
export const planShards = (corpus: ApiCorpus, options: ShardPlanOptions): readonly ShardPlanEntry[] => {
  const ceiling = options.maxShardTokens ?? defaultMaxShardTokens;
  const eager = new Set(options.eagerGroups ?? []);

  const grouped = new Map<string, ApiEntry[]>();
  for (const entry of topLevel(corpus)) {
    const title = options.groupBy(entry);
    const bucket = grouped.get(title);
    if (bucket === undefined) {
      grouped.set(title, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  const shards: ShardPlanEntry[] = [];
  for (const [title, entries] of grouped) {
    const tier = eager.size === 0 || eager.has(title) ? 'eager' : 'cold';
    const base = slugify(title);

    let current: ApiEntry[] = [];
    let weight = 0;
    let ordinal = 1;
    const flush = (): void => {
      if (current.length === 0) {
        return;
      }
      shards.push({
        slug: ordinal === 1 ? `api-${base}` : `api-${base}-${ordinal}`,
        title: ordinal === 1 ? title : `${title} (${ordinal})`,
        entries: current,
        tier,
      });
      ordinal += 1;
      current = [];
      weight = 0;
    };

    for (const entry of entries) {
      const cost = entryWeight(entry);
      if (current.length > 0 && weight + cost > ceiling) {
        flush();
      }
      current.push(entry);
      weight += cost;
    }
    flush();
  }

  return shards;
};

/** Map every entry id to the shard that renders it. @public */
export const shardIndexById = (shards: readonly ShardPlanEntry[]): ReadonlyMap<string, ShardPlanEntry> => {
  const byId = new Map<string, ShardPlanEntry>();
  for (const shard of shards) {
    for (const entry of shard.entries) {
      const walk = (current: ApiEntry): void => {
        byId.set(current.id, shard);
        for (const member of current.members ?? []) {
          walk(member);
        }
      };
      walk(entry);
    }
  }
  return byId;
};

/** Every addressable entry, for the coverage gate. @public */
export const addressableEntries = (corpus: ApiCorpus): readonly ApiEntry[] => [...flattenEntries(corpus)];
