import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MutantSeconds } from '#mutant-shard.js';
import { dealMutants, mutantKey, parseMutantShard, readMutantSeconds } from '#mutant-shard.js';
import type { Mutant, MutantResult } from '#mutants.js';
import { runMutants } from '#mutants.js';
import { workspaceRoot } from '#toolchain.js';

/*
 * ST-3 (lane budget): agent-host's 75 mutants run as three `formal:nightly:mutants` jobs, each
 * `formal nightly --mutants-only --shard k/3`. These tests pin that the shards partition the mutants,
 * keep each control with its mutants, and give every mutant the verdict an unsharded run gives it.
 */

const agentHostMutants = 'packages/agent-host/specs/lean/mutants.json';
const readMutants = (file: string): Mutant[] =>
  JSON.parse(readFileSync(path.join(workspaceRoot, file), 'utf8')) as Mutant[];

describe('parseMutantShard', () => {
  it('should read k/N with 1 ≤ k ≤ N and refuse anything else', () => {
    expect(parseMutantShard('2/3')).toEqual({ index: 2, count: 3 });
    expect(parseMutantShard('1/1')).toEqual({ index: 1, count: 1 });
    for (const text of ['0/3', '4/3', '1/0', '1', '1/3/4', 'a/3', '-1/3', '']) {
      expect(parseMutantShard(text), text).toBeUndefined();
    }
  });
});

describe('agent-host mutant shards', () => {
  const table = readMutantSeconds();
  const mutants = readMutants(agentHostMutants);
  const files = [{ file: agentHostMutants, mutants }];
  const weight = (mutant: Mutant): number => table.mutants[agentHostMutants]?.[mutant.id] ?? table.defaultSeconds;
  const controlOf = (mutant: Mutant): string => `${mutant.file}|${mutant.test ?? ''}`;

  it('should measure every agent-host mutant and nothing else', () => {
    expect(mutants).toHaveLength(75);
    expect(Object.keys(table.mutants)).toEqual([agentHostMutants]);
    expect(Object.keys(table.mutants[agentHostMutants] ?? {}).sort()).toEqual(
      mutants.map((mutant) => mutant.id).sort(),
    );
  });

  it('should deal all 75 mutants to exactly one of three shards, the same way every time', () => {
    const dealt = dealMutants(files, 3, table);
    const all = mutants.map((_mutant, index) => mutantKey(agentHostMutants, index));

    expect(dealt).toHaveLength(3);
    expect(dealt.flat().sort()).toEqual([...all].sort());
    expect(new Set(dealt.flat()).size).toBe(75);
    expect(dealMutants(files, 3, table)).toEqual(dealt);
  });

  it('should keep each control with every mutant that shares it', () => {
    const dealt = dealMutants(files, 3, table);
    const shardOf = (index: number): number =>
      dealt.findIndex((keys) => keys.includes(mutantKey(agentHostMutants, index)));
    const controls = new Map<string, Set<number>>();
    for (const [index, mutant] of mutants.entries()) {
      if (mutant.test !== undefined) {
        controls.set(controlOf(mutant), (controls.get(controlOf(mutant)) ?? new Set()).add(shardOf(index)));
      }
    }

    expect(controls.size).toBe(12);
    for (const [control, shards] of controls) {
      expect(shards.size, control).toBe(1);
    }
  });

  it('should balance the three shards to within a minute of a third of the serial 17 minutes', () => {
    const dealt = dealMutants(files, 3, table);
    const byKey = new Map(mutants.map((mutant, index) => [mutantKey(agentHostMutants, index), mutant]));
    const loads = dealt.map((keys) => {
      const members = keys.flatMap((key) => byKey.get(key) ?? []);
      const controls = new Map<string, number>();
      for (const mutant of members.filter((candidate) => candidate.test !== undefined)) {
        controls.set(controlOf(mutant), Math.max(controls.get(controlOf(mutant)) ?? 0, weight(mutant)));
      }
      return (
        members.reduce((sum, mutant) => sum + weight(mutant), 0) +
        [...controls.values()].reduce((sum, value) => sum + value, 0)
      );
    });
    const total = loads.reduce((sum, value) => sum + value, 0);

    expect(total / 60).toBeGreaterThan(16);
    expect(total / 60).toBeLessThan(19);
    expect(Math.max(...loads) - total / 3).toBeLessThan(60);
  });
});

describe('readMutantSeconds', () => {
  it('should refuse a missing default or a non-positive weight', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'formal-mutant-seconds-'));
    try {
      const file = path.join(directory, 'seconds.json');
      writeFileSync(file, JSON.stringify({ mutants: {} }));

      expect(() => readMutantSeconds(file)).toThrow(/defaultSeconds/u);

      writeFileSync(file, JSON.stringify({ defaultSeconds: 13, mutants: { 'a/mutants.json': { zero: 0 } } }));

      expect(() => readMutantSeconds(file)).toThrow(/zero has a non-positive weight/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

/**
 * A project with Lean mutants (a fake oracle) and machine mutants (a fake `vitest` that fails when the
 * mutated copy says BROKEN, and whose `bad.test.ts` control always fails), so the runner's own selection,
 * control and stale paths decide each verdict.
 */
const fixture = (): { readonly root: string; readonly projectRoot: string; readonly seconds: MutantSeconds } => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-mutant-shards-'));
  const projectRoot = path.join(root, 'packages/owner');
  mkdirSync(path.join(projectRoot, 'specs/lean'), { recursive: true });
  mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  mkdirSync(path.join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(path.join(projectRoot, 'specs/lean/Model.lean'), 'def ok := 1\n');
  writeFileSync(path.join(projectRoot, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(path.join(projectRoot, 'src/b.ts'), 'export const b = 2;\n');
  const vitest = path.join(root, 'node_modules/.bin/vitest');
  writeFileSync(
    vitest,
    [
      '#!/bin/sh',
      '# fake vitest: run --config <config>',
      'config="$3"',
      'if grep -q "bad.test.ts" "$config"; then echo " FAIL bad"; exit 1; fi',
      'if grep -rqs BROKEN "$(dirname "$config")"/*.ts; then echo " FAIL caught"; exit 1; fi',
      'exit 0',
      '',
    ].join('\n'),
  );
  chmodSync(vitest, 0o755);
  const lean = (id: string): Mutant => ({
    id,
    drift: `lean ${id}`,
    file: 'specs/lean/Model.lean',
    find: 'def ok := 1',
    replace: id.endsWith('survives') ? 'def ok := 1 ' : 'def ok := 2',
  });
  const machine = (id: string, file: string, [test, find, replace]: readonly [string, string, string]): Mutant => ({
    id,
    drift: `machine ${id}`,
    file,
    find,
    replace,
    test,
  });
  const mutants: Mutant[] = [
    ...Array.from({ length: 9 }, (_unused, index) => lean(`L${String(index + 1)}`)),
    lean('L-survives'),
    { ...lean('L-stale'), find: 'no such text' },
    machine('A1', 'src/a.ts', ['src/a.test.ts', '= 1', '= 1; // BROKEN']),
    machine('A2', 'src/a.ts', ['src/a.test.ts', 'const a', 'const a /* BROKEN */']),
    machine('A-survives', 'src/a.ts', ['src/a.test.ts', '= 1', '= 1 ']),
    machine('B1', 'src/b.ts', ['src/b.test.ts', '= 2', '= 2; // BROKEN']),
    machine('B-bad1', 'src/b.ts', ['src/bad.test.ts', '= 2', '= 2; // BROKEN']),
    machine('B-bad2', 'src/b.ts', ['src/bad.test.ts', 'const b', 'const b /* BROKEN */']),
    machine('A-stale', 'src/a.ts', ['src/a.test.ts', 'missing', 'BROKEN']),
  ];
  writeFileSync(path.join(projectRoot, 'specs/lean/mutants.json'), JSON.stringify(mutants));
  return { root, projectRoot, seconds: { defaultSeconds: 13, mutants: {} } };
};

describe('runMutants with a shard', () => {
  it('should run every mutant once over its shards, each with the unsharded verdict', async () => {
    const { root, projectRoot, seconds } = fixture();
    try {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable
      const context = { root, env: { PATH: process.env['PATH'] ?? '' } };
      const lean = async (mutant: Mutant, mutated: string): Promise<MutantResult> => {
        await Promise.resolve();
        return mutated.includes('def ok := 2')
          ? { id: mutant.id, verdict: 'caught' }
          : { id: mutant.id, verdict: 'survived' };
      };
      const verdicts = (results: readonly MutantResult[]): string[] =>
        results.map((result) => `${result.id} ${result.verdict}`).sort();
      const quiet = (): void => undefined;

      const whole = await runMutants(context, { projectRoot, lean, log: quiet, seconds });
      const shards = await Promise.all(
        [1, 2, 3].map(async (index) =>
          runMutants(context, { projectRoot, lean, log: quiet, seconds, shard: { index, count: 3 } }),
        ),
      );
      const union = shards.flatMap((shard) => shard.results);

      expect(whole.results).toHaveLength(18);
      expect(verdicts(whole.results)).toEqual(
        expect.arrayContaining(['A1 caught', 'A-survives survived', 'A-stale stale', 'B-bad1 stale', 'L-stale stale']),
      );
      expect(shards.every((shard) => shard.results.length > 0)).toBe(true);
      expect(new Set(union.map((result) => result.id)).size).toBe(union.length);
      expect(verdicts(union)).toEqual(verdicts(whole.results));
      expect(shards.reduce((sum, shard) => sum + shard.failures, 0)).toBe(whole.failures);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
