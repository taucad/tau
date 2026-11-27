import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseSequencer } from 'vitest/node';
import type { TestSpecification } from 'vitest/node';

/**
 * Deals `ui`'s test files across the CI test shards by measured seconds (CI throughput review ST-1, decomposition
 * rows DC-9/DC-10).
 *
 * Vitest's own `--shard=<index>/<count>` splits the files into equal counts by path hash, so one shard can draw the
 * slow suites together. This sequencer keeps Vitest's file split, `--shard` and its sort, and replaces only the deal:
 * every file, heaviest first by `test-shards.test.seconds.json` (ties by path), goes to the shard with the least load
 * so far (ties to the lowest), the rule of `scripts/src/test-shard-dealer.ts`, kept here so `ui` does not depend on
 * `scripts`. A file the snapshot does not list weighs `defaultSeconds`, the snapshot's mean. The type tests
 * (`*.test-d.ts`) are dealt as one unit: Vitest checks a shard's type tests with one `tsc` run, so keeping them
 * together pays that start-up once rather than on every shard. Every shard computes
 * the same deal from the same file list, so the shards partition it: each file runs exactly once
 * (`test-shards.test.ts` pins it). Vitest calls `shard` only under `--shard`, so an unsharded run is unchanged.
 */

/** The checked-in duration snapshot: seconds per test file, relative to `apps/ui`. */
export type ShardSeconds = {
  readonly defaultSeconds: number;
  readonly seconds: Readonly<Record<string, number>>;
};

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Validate a parsed snapshot.
 *
 * @param raw - The parsed JSON.
 * @returns The snapshot.
 * @throws When `defaultSeconds` or a weight is not a positive number.
 */
export const parseShardSeconds = (raw: unknown): ShardSeconds => {
  const { defaultSeconds, seconds } = (raw ?? {}) as Record<string, unknown>;
  if (!isPositive(defaultSeconds)) {
    throw new TypeError('test shard seconds need a positive defaultSeconds');
  }
  if (typeof seconds !== 'object' || seconds === null || Array.isArray(seconds)) {
    throw new TypeError('test shard seconds need a seconds object');
  }
  for (const [file, value] of Object.entries(seconds)) {
    if (!isPositive(value)) {
      throw new TypeError(`test shard seconds have a non-positive weight for ${file}`);
    }
  }
  return { defaultSeconds, seconds: seconds as Record<string, number> };
};

/** The snapshot beside this file. */
export const shardSeconds: ShardSeconds = parseShardSeconds(
  JSON.parse(readFileSync(path.join(import.meta.dirname, 'test-shards.test.seconds.json'), 'utf8')),
);

/** Whether Vitest checks a file with `tsc` (`typecheck.include`); these are dealt together as one unit. */
export const isTypeTest = (file: string): boolean => file.endsWith('.test-d.ts');

/**
 * Deal files into `count` lists: units heaviest first, ties by name, each to the least-loaded list, ties to the
 * lowest. A unit is one file, or every type test together.
 *
 * @param files - The files, relative to `apps/ui`; duplicates are dealt once.
 * @param count - The number of shards.
 * @param durations - The weights.
 * @returns Each shard's files, independent of the input order.
 */
export const dealFiles = (files: readonly string[], count: number, durations: ShardSeconds): string[][] => {
  const weight = (file: string): number =>
    Object.hasOwn(durations.seconds, file) ? durations.seconds[file]! : durations.defaultSeconds;
  const units = new Map<string, string[]>();
  for (const file of [...new Set(files)].toSorted()) {
    const key = isTypeTest(file) ? '*.test-d.ts' : file;
    units.set(key, [...(units.get(key) ?? []), file]);
  }
  const ordered = [...units]
    .map(([key, members]) => ({ key, members, weight: members.reduce((sum, file) => sum + weight(file), 0) }))
    .toSorted((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const load = Array.from({ length: count }, () => 0);
  const dealt = Array.from({ length: count }, (): string[] => []);
  for (const unit of ordered) {
    let lightest = 0;
    for (let shard = 1; shard < count; shard++) {
      if (load[shard]! < load[lightest]!) {
        lightest = shard;
      }
    }
    load[lightest]! += unit.weight;
    dealt[lightest]!.push(...unit.members);
  }
  return dealt;
};

/** A spec's file relative to the Vitest root, with forward slashes, the snapshot's key. */
const relativeFile = (root: string, moduleId: string): string =>
  path.relative(root, moduleId).split(path.sep).join('/');

/** Vitest's sequencer with a duration deal for `--shard`; `sort` is Vitest's own. */
export class DurationShardSequencer extends BaseSequencer {
  public override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config;
    if (!shard) {
      return files;
    }
    const mine = new Set(
      dealFiles(
        files.map((spec) => relativeFile(root, spec.moduleId)),
        shard.count,
        shardSeconds,
      )[shard.index - 1],
    );
    return files.filter((spec) => mine.has(relativeFile(root, spec.moduleId)));
  }
}
