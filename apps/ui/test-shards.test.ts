// @vitest-environment node
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestSpecification, Vitest } from 'vitest/node';
/* oxlint-disable eslint/no-restricted-imports -- The shard sequencer lives beside the Vitest configuration, outside the app aliases. */
import {
  DurationShardSequencer,
  dealFiles,
  isTypeTest,
  parseShardSeconds,
  shardSeconds,
} from './test-shards.test.sequencer.js';
/* oxlint-enable eslint/no-restricted-imports */

/*
 * The CI test shards of `ui:test` (CI throughput review ST-1): `ui:test:shard-<n>` must together run every file of
 * `ui:test` exactly once, cache like `ui:test`, and leave coverage thresholds to an unsharded run.
 */

const root = import.meta.dirname;

type Target = {
  readonly executor?: string;
  readonly cache?: boolean;
  readonly dependsOn?: readonly unknown[];
  readonly inputs?: readonly unknown[];
  readonly outputs?: readonly unknown[];
  readonly options?: { readonly cwd?: string; readonly command?: string };
};
const { targets } = JSON.parse(readFileSync(path.join(root, 'project.json'), 'utf8')) as {
  readonly targets: Readonly<Record<string, Target>>;
};
const shardTargets = Object.keys(targets).filter((name) => name.startsWith('test:shard-'));
const count = shardTargets.length;

/** `ui:test`'s files: Vitest's default include and the typecheck include, less vite.config.ts's exclude. */
const testFiles = globSync(['**/*.{test,spec}.{ts,tsx,js,jsx,mts,mjs,cts,cjs}', '**/*.test-d.ts'], {
  cwd: root,
  exclude: ['**/node_modules/**', '**/dist/**', '**/*.browser.test.ts', '**/*.browser.test.tsx'],
})
  .map((file) => file.split(path.sep).join('/'))
  .toSorted();

const shardOf = async (files: readonly string[], index: number, total = count): Promise<string[]> => {
  const context = { config: { root, shard: { index, count: total } } } as unknown as Vitest;
  const specs = files.map((file) => {
    const spec: Pick<TestSpecification, 'moduleId'> = { moduleId: path.join(root, file) };
    return spec as TestSpecification;
  });
  const mine = await new DurationShardSequencer(context).shard(specs);
  return mine.map((spec) => path.relative(root, spec.moduleId).split(path.sep).join('/'));
};

describe('ui:test shards', () => {
  it('should declare the shards 1 to N, each running its own slice of the same Vitest suite', () => {
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(6);
    expect(shardTargets.toSorted()).toEqual(Array.from({ length: count }, (_, index) => `test:shard-${index + 1}`));
    for (const [index, name] of shardTargets.entries()) {
      expect(targets[name]?.options).toEqual({
        cwd: '{projectRoot}',
        command: `vitest run --config test-shards.test.config.ts --shard=${index + 1}/${count}`,
      });
    }
  });

  it('should cache each shard as its own task with the inputs and dependencies of ui:test', () => {
    for (const name of shardTargets) {
      expect(targets[name]?.executor).toBe('nx:run-commands');
      expect(targets[name]?.cache).toBe(true);
      // The inferred `test` takes `dependsOn` from nx.json's targetDefaults and `inputs` from this file.
      expect(targets[name]?.dependsOn).toEqual(['copy-assets', '^copy-assets']);
      expect(targets[name]?.inputs).toEqual(targets['test']?.inputs);
      // No coverage output: a shard never measures coverage (see the thresholds test below).
      expect(targets[name]?.outputs).toBeUndefined();
    }
  });

  it('should find the suite', () => {
    expect(testFiles.length).toBeGreaterThan(count);
    expect(testFiles).toContain('test-shards.test.ts');
    expect(testFiles.some((file) => file.endsWith('.browser.test.ts'))).toBe(false);
  });

  it('should run every file of ui:test in exactly one shard', async () => {
    const shards = await Promise.all(Array.from({ length: count }, async (_, index) => shardOf(testFiles, index + 1)));
    const union = shards.flat();
    expect(union.toSorted()).toEqual(testFiles);
    expect(new Set(union).size).toBe(union.length);
    for (const shard of shards) {
      expect(shard.length).toBeGreaterThan(0);
    }
  });

  it('should deal a file the snapshot does not list, and drop none when a listed file is gone', async () => {
    const files = ['new-a.test.ts', 'new-b.test.ts', ...testFiles.slice(1)];
    const shards = await Promise.all(Array.from({ length: count }, async (_, index) => shardOf(files, index + 1)));
    expect(shards.flat().toSorted()).toEqual(files.toSorted());
  });

  it('should partition for any shard count, whatever the input order', () => {
    for (const total of [1, 2, 3, 4, 5, 6, 7]) {
      const dealt = dealFiles(testFiles, total, shardSeconds);
      expect(dealt).toHaveLength(total);
      expect(dealt.flat().toSorted()).toEqual(testFiles);
      expect(dealFiles(testFiles.toReversed(), total, shardSeconds)).toEqual(dealt);
    }
  });

  it('should deal heaviest first to the lightest shard, unknown files at the default weight', () => {
    const durations = parseShardSeconds({ defaultSeconds: 5, seconds: { a: 9, b: 7, c: 3, d: 2 } });
    expect(dealFiles(['d', 'c', 'b', 'a', 'e'], 2, durations)).toEqual([
      ['a', 'c', 'd'],
      ['b', 'e'],
    ]);
  });

  it('should deal every type test to one shard, so one tsc run checks them all', () => {
    const typeTests = testFiles.filter((file) => isTypeTest(file));
    expect(typeTests.length).toBeGreaterThan(1);
    const holders = dealFiles(testFiles, count, shardSeconds).filter((files) => files.some((file) => isTypeTest(file)));
    expect(holders).toHaveLength(1);
    expect(holders[0]?.filter((file) => isTypeTest(file)).toSorted()).toEqual(typeTests);
  });

  it('should balance the measured suite within one unit of the even share', () => {
    const weight = (file: string): number => shardSeconds.seconds[file] ?? shardSeconds.defaultSeconds;
    const loads = dealFiles(testFiles, count, shardSeconds).map((files) =>
      files.reduce((sum, file) => sum + weight(file), 0),
    );
    const heaviestUnit = Math.max(
      ...testFiles.map((file) => weight(file)),
      testFiles.filter((file) => isTypeTest(file)).reduce((sum, file) => sum + weight(file), 0),
    );
    const even = loads.reduce((sum, load) => sum + load, 0) / count;
    expect(Math.max(...loads)).toBeLessThanOrEqual(even + heaviestUnit);
  });

  it('should reject a snapshot with a missing or non-positive weight', () => {
    expect(() => parseShardSeconds({ seconds: {} })).toThrow(/defaultSeconds/u);
    expect(() => parseShardSeconds({ defaultSeconds: 1, seconds: { a: 0 } })).toThrow(/a/u);
    expect(() => parseShardSeconds({ defaultSeconds: 1, seconds: [] })).toThrow(/seconds object/u);
  });

  it('should leave coverage thresholds out of the shared config, which a shard cannot check alone', () => {
    // A threshold on a shard's slice fails or passes on a fraction of the suite. Coverage runs unsharded
    // (`ui:test --coverage`); a threshold, if one is added, needs the merged report of every shard.
    expect(readFileSync(path.join(root, 'vite.config.ts'), 'utf8')).not.toMatch(/\bthresholds\b/u);
    expect(readFileSync(path.join(root, 'test-shards.test.config.ts'), 'utf8')).not.toMatch(/\bcoverage\b/u);
  });
});
