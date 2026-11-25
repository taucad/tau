import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * C5 for the API lane of ci.yml, split into two shards (tau-brain research/ci-structural-decomposition-blueprint.md
 * ST-3; research/ci-scaling-best-practice-review.md C5): Vitest's `--shard=1/2` and `--shard=2/2` together collect
 * every file of an API suite once, and every step the single API job ran runs in exactly one shard.
 */

const root = resolve(import.meta.dirname, '../..');
type Step = { readonly name?: string; readonly if?: string; readonly run?: string };
type Job = {
  readonly name?: string;
  readonly needs?: readonly string[];
  readonly steps?: readonly Step[];
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
};
const ci = load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')) as {
  readonly jobs: Record<string, Job>;
};

const directory = mkdtempSync(join(tmpdir(), 'api-shard-union-'));
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

/*
 * The files `vitest run [--shard=<n>/2]` runs in a project: its collected files, through the configured sequencer's
 * `shard`, which is what `vitest run --shard` applies (`vitest list` ignores `--shard`). Run in a child process so
 * this suite's own Vitest stays out of it.
 */
const shardScript = `
import { writeFileSync } from 'node:fs';
import { createVitest } from 'vitest/node';
const [root, shard, output] = process.argv.slice(1);
const vitest = await createVitest('test', { root, dir: root, watch: false, passWithNoTests: true, ...(shard === 'all' ? {} : { shard }) }, {}, {});
const specs = await vitest.getRelevantTestSpecifications();
const Sequencer = vitest.config.sequence.sequencer;
const selected = shard === 'all' ? specs : await new Sequencer(vitest).shard(specs);
writeFileSync(output, JSON.stringify(selected.map((spec) => spec.moduleId)));
await vitest.close();
`;

const collected = (projectRoot: string, shard: string): string[] => {
  const output = join(directory, `${projectRoot.replaceAll('/', '-')}-${shard.replaceAll('/', '-')}.json`);
  execFileSync(
    process.execPath,
    ['--input-type=module', '-e', shardScript, resolve(root, projectRoot), shard, output],
    { cwd: root, stdio: 'ignore' },
  );
  return (JSON.parse(readFileSync(output, 'utf8')) as string[]).toSorted();
};

describe('API test shards', () => {
  it.each(['apps/api', 'apps/libs/api-billing'])(
    'collect every file of %s in exactly one of the two Vitest shards',
    (projectRoot) => {
      const all = collected(projectRoot, 'all');
      const shards = ['1/2', '2/2'].map((shard) => collected(projectRoot, shard));
      const union = shards.flat();
      expect(all.length).toBeGreaterThan(1);
      expect(union.toSorted()).toEqual(all);
      expect(new Set(union).size).toBe(union.length);
      expect(shards.every((shard) => shard.length > 0)).toBe(true);
    },
    120_000,
  );

  it('runs every step of the API lane in exactly one shard, and requires both shards', () => {
    const lane = ci.jobs['api-shard'];
    expect(lane?.strategy?.matrix?.['shard']).toEqual([1, 2]);
    const steps = lane?.steps ?? [];
    const shardOf = (step: Step): readonly number[] => {
      const only = /matrix\.shard == ([12])/u.exec(step.if ?? '')?.[1];
      return only === undefined ? [1, 2] : [Number(only)];
    };
    // The suites run in both shards, each its half; every other test step runs in one.
    const suites = steps.filter((step) => /--shard=\$\{\{ matrix\.shard \}\}\/2/u.test(step.run ?? ''));
    expect(suites).toHaveLength(1);
    expect(shardOf(suites[0]!)).toEqual([1, 2]);
    const tests = steps.filter((step) => /\bnx run-many -t test:/u.test(step.run ?? ''));
    expect(tests.map((step) => step.run?.match(/-t (test:[\w-]+)/u)?.[1])).toEqual([
      'test:server-modes',
      'test:billing-composition',
      'test:models',
      'test:models',
      'test:models',
      'test:models',
      'test:git',
    ]);
    for (const step of tests) {
      expect(shardOf(step), step.name).toHaveLength(1);
    }
    // Each shard starts its own PostgreSQL, Redis and MinIO and migrates before any suite.
    const services = steps.find((step) => /\bdocker compose\b[^\n]*\bup\b/u.test(step.run ?? ''));
    expect(services && shardOf(services)).toEqual([1, 2]);
    // The required check `API tests (Postgres + MinIO)` needs both shards.
    expect(ci.jobs['api']?.name).toBe('API tests (Postgres + MinIO)');
    expect(ci.jobs['api']?.needs).toEqual(['plan', 'api-shard']);
  });
});
