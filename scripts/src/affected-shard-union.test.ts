import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * C5 shard-union assertions for the sharded affected lanes of ci.yml (tau-brain
 * research/ci-scaling-best-practice-review.md C5; research/ci-structural-decomposition-blueprint.md ST-3). Each lane's
 * own script runs against one task graph with `pnpm` stubbed, once per shard, and the Nx tasks the shards ask for
 * together must be every task of the lane, each asked for by exactly one shard: lint, typecheck and build over two
 * shards each. The test shards keep their own union proof (test-shard-dealer.test.ts).
 */

const root = resolve(import.meta.dirname, '../..');
type Step = { readonly name?: string; readonly run?: string };
type Job = {
  readonly env?: Record<string, string>;
  readonly strategy?: { readonly matrix?: { lane?: string[] } };
};
const ci = load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')) as {
  readonly jobs: Record<string, Job & { readonly steps?: readonly Step[] }>;
};
const lane = ci.jobs['affected-lane'];
const script = lane?.steps?.find((step) => step.name === "Run the lane's tasks")?.run ?? '';
const buildTargets = lane?.env?.['BUILD_TARGETS'] ?? '';

const directory = mkdtempSync(join(tmpdir(), 'affected-shard-union-'));
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});
writeFileSync(join(directory, 'pnpm'), '#!/usr/bin/env bash\necho "$*" >> "$RUNNER_TEMP/calls"\n', { mode: 0o700 });

type Node = {
  readonly tags?: readonly string[];
  readonly targets?: Record<string, unknown>;
};

/** A graph file as `nx affected -t … --graph=<file>` writes it. */
const graphFile = (nodes: Record<string, Node>, dependencies: Record<string, readonly string[]>): string =>
  JSON.stringify({
    graph: {
      nodes: Object.fromEntries(
        Object.entries(nodes).map(([name, node]) => [
          name,
          {
            name,
            data: { tags: node.tags ?? [], targets: node.targets ?? {} },
          },
        ]),
      ),
    },
    tasks: {
      tasks: Object.fromEntries(
        [...new Set([...Object.keys(dependencies), ...Object.values(dependencies).flat()])].map((id) => {
          const [project, ...target] = id.split(':');
          return [id, { id, target: { project, target: target.join(':') } }];
        }),
      ),
      dependencies,
    },
  });

/** Run one shard of the lane script; returns the `pnpm` invocations it made. */
const runShard = (laneName: string, graph: string): string[] => {
  const temporary = mkdtempSync(join(directory, `${laneName}-`));
  writeFileSync(join(temporary, 'lane-graph.json'), graph);
  writeFileSync(join(temporary, 'calls'), '');
  const result = spawnSync('bash', ['-e', '-c', script], {
    cwd: root,
    encoding: 'utf8',
    env: Object.fromEntries([
      ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
      ['RUNNER_TEMP', temporary],
      ['LANE', laneName],
      ['BUILD_TARGETS', buildTargets],
    ]),
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(join(temporary, 'calls'), 'utf8').split('\n').filter(Boolean);
};

/** The `project:target` tasks one `nx run-many -t <targets> --projects <list>` call asks for. */
const tasksOf = (call: string): string[] => {
  const targets = /-t (\S+)/u.exec(call)?.[1]?.split(',') ?? [];
  const projects = /--projects (\S+)/u.exec(call)?.[1]?.split(',') ?? [];
  return projects.flatMap((project) => targets.map((target) => `${project}:${target}`));
};

const expectUnion = (perShard: ReadonlyArray<readonly string[]>, expected: readonly string[]): void => {
  const union = perShard.flat();
  expect(union.toSorted()).toEqual([...expected].toSorted());
  expect(new Set(union).size).toBe(union.length);
};

describe('affected lint, typecheck and build shards', () => {
  const projects = ['ui', 'desktop', 'docs', 'cli', 'runtime', 'host', 'viewer'];

  it.each(['lint', 'typecheck'])('runs every %s task in exactly one of the two shards', (kind) => {
    const graph = graphFile(
      Object.fromEntries(projects.map((project) => [project, {}])),
      Object.fromEntries<readonly string[]>([
        ...projects.map((project): [string, readonly string[]] => [`${project}:${kind}`, []]),
        ['ui:typegen', []],
      ]),
    );
    expect(lane?.strategy?.matrix?.lane?.filter((name) => name.startsWith(`${kind}-`))).toEqual([
      `${kind}-1`,
      `${kind}-2`,
    ]);
    const shards = [1, 2].map((shard) => runShard(`${kind}-${shard}`, graph).flatMap((call) => tasksOf(call)));
    expectUnion(
      shards,
      projects.map((project) => `${project}:${kind}`),
    );
    expect(shards.every((shard) => shard.length > 0)).toBe(true);
  });

  it('runs every build-lane task of every project in exactly one of the two shards', () => {
    const targets = buildTargets.split(' ');
    const graph = graphFile(Object.fromEntries(projects.map((project) => [project, {}])), {
      'ui:build': [],
      'ui:size': ['ui:build'],
      'ui:check-desktop-payload': ['desktop:build'],
      'ui:check-server-output': ['ui:build'],
      'desktop:build': ['desktop:typecheck'],
      'desktop:typecheck': [],
      'docs:build': [],
      'docs:check-server-output': ['docs:build'],
      'cli:build': ['runtime:build'],
      'runtime:build': [],
      'host:build': ['runtime:build'],
      'viewer:build': [],
    });
    const shards = [1, 2].map((shard) => runShard(`build-${shard}`, graph));
    // Each shard asks for all six targets of its projects; Nx runs the ones a project has.
    for (const calls of shards) {
      for (const call of calls) {
        expect(/-t (\S+)/u.exec(call)?.[1]).toBe(targets.join(','));
      }
    }
    expectUnion(
      shards.map((calls) => calls.flatMap((call) => /--projects (\S+)/u.exec(call)?.[1]?.split(',') ?? [])),
      projects,
    );
  });
});
