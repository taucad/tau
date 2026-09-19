/**
 * Turning one {@link ApiCorpus} plus authored doctrine into a skill bundle.
 *
 * A bundle is self-contained and host-neutral: a directory a host can drop into
 * `.agents/skills/` with no Tau runtime, whose every reference-map link is
 * relative to the directory itself.
 *
 * @module
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';
import type { SkillBundleDeclaration } from '#bundle/bundle.types.js';
import { apiIndexFile, skillBodyFile } from '#bundle/bundle.types.js';
import { renderIndex, renderReferenceMap, renderShard } from '#render/render-reference.js';
import { renderSkill } from '#render/render-skill.js';
import { planShards } from '#render/shard-plan.js';

/** Everything one bundle needs that cannot be derived from the corpus. @public */
export type BundleOptions = {
  readonly slug: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly version: string;
  readonly whenToUse: string;
  /** Authored workflow, canonical example and failure modes. Verbatim. */
  readonly doctrine: string;
  /** Grouping axis for T3 shards. Explicit, never inferred. */
  readonly groupBy: (entry: ApiEntry) => string;
  readonly maxShardTokens?: number;
  /** Groups materialized eagerly; the rest are generated but fetched on demand. */
  readonly eagerGroups?: readonly string[];
};

/** A written bundle: its declaration, and what it cost. @public */
export type WrittenBundle = {
  readonly declaration: SkillBundleDeclaration;
  readonly bodyTokens: number;
  readonly shardCount: number;
  readonly bytes: number;
};

/**
 * Render and write one corpus-backed bundle into `directory`.
 *
 * The directory is emptied first: a stale shard from a previous run would be a
 * file the index no longer names, which is exactly the dangling-pointer failure
 * the corpus contract exists to prevent.
 *
 * @param corpus - The extracted surface.
 * @param directory - Absolute path of the bundle directory.
 * @param options - Slug, doctrine and grouping.
 * @returns The declaration to record in `agent/skills.json`, plus measurements.
 * @public
 */
export const writeCorpusBundle = async (
  corpus: ApiCorpus,
  directory: string,
  options: BundleOptions,
): Promise<WrittenBundle> => {
  const shards = planShards(corpus, {
    groupBy: options.groupBy,
    ...(options.maxShardTokens === undefined ? {} : { maxShardTokens: options.maxShardTokens }),
    ...(options.eagerGroups === undefined ? {} : { eagerGroups: options.eagerGroups }),
  });

  const referenceMap = renderReferenceMap(shards, {
    indexFile: apiIndexFile,
    totalSymbols: corpus.metadata.totalEntries,
  });
  const skill = renderSkill({
    slug: options.slug,
    title: options.title,
    description: options.description,
    doctrine: options.doctrine,
    referenceMap,
  });

  const written = new Map<string, string>([
    [skillBodyFile, skill.markdown],
    [apiIndexFile, renderIndex(corpus, shards, { title: `${corpus.metadata.packageName} API index` })],
  ]);
  for (const shard of shards) {
    written.set(`${shard.slug}.md`, renderShard(shard, corpus));
  }

  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await Promise.all([...written].map(async ([file, contents]) => writeFile(join(directory, file), contents, 'utf8')));
  const bytes = [...written.values()].reduce((sum, contents) => sum + Buffer.byteLength(contents, 'utf8'), 0);

  return {
    declaration: {
      slug: options.slug,
      name: options.name,
      description: options.description,
      version: options.version,
      whenToUse: options.whenToUse,
      directory: options.slug,
      files: [...written.keys()],
      body: skill.markdown,
    },
    bodyTokens: skill.bodyTokens,
    shardCount: shards.length,
    bytes,
  };
};

/**
 * Write a bundle with no API corpus behind it — an authored procedure only.
 *
 * `create-skill` is the only such bundle: pure procedure, which is exactly what
 * the placement framework says belongs in a skill body.
 *
 * @param directory - Absolute path of the bundle directory.
 * @param options - Slug, title, description and the authored body.
 * @returns The declaration to record, plus measurements.
 * @public
 */
export const writeDoctrineBundle = async (
  directory: string,
  options: Omit<BundleOptions, 'groupBy' | 'eagerGroups' | 'maxShardTokens'>,
): Promise<WrittenBundle> => {
  const skill = renderSkill({
    slug: options.slug,
    title: options.title,
    description: options.description,
    doctrine: options.doctrine,
  });

  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, skillBodyFile), skill.markdown, 'utf8');

  return {
    declaration: {
      slug: options.slug,
      name: options.name,
      description: options.description,
      version: options.version,
      whenToUse: options.whenToUse,
      directory: options.slug,
      files: [skillBodyFile],
      body: skill.markdown,
    },
    bodyTokens: skill.bodyTokens,
    shardCount: 0,
    bytes: Buffer.byteLength(skill.markdown, 'utf8'),
  };
};

/**
 * Read an authored doctrine fragment.
 *
 * @param path - Absolute path to `doctrine.md`.
 * @returns Its contents.
 * @throws With the path named, when the owning package has not authored one.
 * @public
 */
export const readDoctrine = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new Error(`missing authored doctrine at ${path}. Every bundle needs one; it is not generated.`);
  }
};
