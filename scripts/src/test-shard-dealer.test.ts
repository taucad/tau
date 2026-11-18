import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import {
  deal,
  dealUnits,
  parseDurations,
  parseProjects,
  run,
  shardCount,
  unitsFromGraph,
  weightOf,
} from '#test-shard-dealer.js';
import type { DurationTable } from '#test-shard-dealer.js';

const root = resolve(import.meta.dirname, '../..');
const snapshot = parseDurations(
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'test-shard-durations.json'), 'utf8')),
);

const table = (seconds: Record<string, number>, defaultSeconds = 10): DurationTable => ({ defaultSeconds, seconds });

/** Every lane's deal for one input; the union must be the input and the shards disjoint. */
const dealAll = (projects: readonly string[], durations: DurationTable = snapshot, shards = 3): string[][] =>
  deal(projects, shards, durations);

/** The `test:shard-<n>` tasks of ui, which the `test-<n>` lanes deal in place of `ui` (CI throughput review ST-1). */
const uiShards = Object.keys(
  (JSON.parse(readFileSync(resolve(root, 'apps/ui/project.json'), 'utf8')) as { targets: Record<string, unknown> })
    .targets,
)
  .filter((target) => /^test:shard-\d+$/u.test(target))
  .map((target) => `ui:${target}`);

const expectPartition = (projects: readonly string[], dealt: readonly string[][]): void => {
  const union = dealt.flat();
  expect(union.toSorted()).toEqual([...projects].toSorted());
  expect(new Set(union).size).toBe(union.length);
};

// An era-D broad landing (blueprint F2): the measured heavy projects plus a spread of small ones.
const broad = [
  'agent-plugin',
  'agent-tools',
  'api-extractor',
  'bambu',
  'build123d',
  'chat',
  'cli',
  'desktop',
  'desktop-e2e',
  'docs',
  'host',
  'picogk',
  'runtime',
  'scripts',
  'skills',
  'taucad-ui',
  'tau-examples',
  'telemetry',
  'ui',
  'ui-e2e',
  'viewer',
  'warehouse',
  'workbench-panes',
  'www',
  'zoo',
];

describe('deal', () => {
  it('returns empty shards for an empty selection', () => {
    expect(dealAll([])).toEqual([[], [], []]);
  });

  it('puts a single project on the first shard', () => {
    expect(dealAll(['ui'])).toEqual([['ui'], [], []]);
  });

  it('puts ui alone on a broad landing and keeps the other shards within one small project', () => {
    const dealt = dealAll(broad);
    expectPartition(broad, dealt);
    expect(dealt.map((shard) => shard[0])).toEqual(['ui', 'host', 'build123d']);
    expect(dealt[0]).toEqual(['ui']);
    const loads = dealt.map((shard) => shard.reduce((sum, project) => sum + weightOf(project, snapshot), 0));
    // The ui suite alone sets the floor; the breadth splits evenly beside it.
    expect(loads).toEqual([952, 498, 500]);
    expect(Math.abs((loads[1] ?? 0) - (loads[2] ?? 0))).toBeLessThanOrEqual(snapshot.defaultSeconds);
  });

  it('deals a skewed set heaviest first to the lightest shard', () => {
    const durations = table({ a: 100, b: 60, c: 50, d: 40, e: 30, f: 20 });
    const dealt = dealAll(['a', 'b', 'c', 'd', 'e', 'f'], durations);
    expect(dealt).toEqual([['a'], ['b', 'e', 'f'], ['c', 'd']]);
  });

  it('is independent of input order', () => {
    expect(dealAll([...broad].reverse())).toEqual(dealAll(broad));
  });

  it('breaks weight ties by name and load ties by the lowest shard', () => {
    const durations = table({}, 5);
    expect(dealAll(['d', 'c', 'b', 'a'], durations)).toEqual([['a', 'd'], ['b'], ['c']]);
  });

  it('weighs a project missing from the snapshot at the default', () => {
    expect(weightOf('brand-new-project', snapshot)).toBe(snapshot.defaultSeconds);
    expect(weightOf('constructor', snapshot)).toBe(snapshot.defaultSeconds);
    expect(weightOf('cli', snapshot)).toBe(104);
    const dealt = dealAll(['brand-new-project', 'ui']);
    expect(dealt).toEqual([['ui'], ['brand-new-project'], []]);
  });

  it('ignores snapshot entries for renamed or deleted projects', () => {
    const dealt = dealAll(['ui-core', 'ui-e2e']);
    expectPartition(['ui-core', 'ui-e2e'], dealt);
    expect(dealt).toEqual([['ui-core'], ['ui-e2e'], []]);
  });

  it('spreads ui over the six test lanes as its shard tasks, which a broad landing deals in place of ui', () => {
    const units = [...broad.filter((project) => project !== 'ui'), ...uiShards];
    const dealt = dealAll(units, snapshot, 6);
    expectPartition(units, dealt);
    const loads = dealt.map((shard) => shard.reduce((sum, unit) => sum + weightOf(unit, snapshot), 0));
    const heaviest = Math.max(...units.map((unit) => weightOf(unit, snapshot)));
    // The longest-processing-time bound: no lane passes the even share by more than its heaviest unit.
    expect(Math.max(...loads)).toBeLessThanOrEqual(loads.reduce((sum, load) => sum + load, 0) / 6 + heaviest);
    // No lane carries more than its share of ui's shards.
    for (const shard of dealt) {
      expect(shard.filter((unit) => uiShards.includes(unit)).length).toBeLessThanOrEqual(
        Math.ceil(uiShards.length / 5),
      );
    }
    // A ui-only landing: one shard per lane.
    expect(dealAll(uiShards, snapshot, 6).map((shard) => shard.length)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('honours another shard count', () => {
    const dealt = dealAll(broad, snapshot, 2);
    expect(dealt).toHaveLength(2);
    expectPartition(broad, dealt);
  });
});

describe('parseDurations', () => {
  it('accepts the checked-in snapshot and its project names are real projects', () => {
    // A `project:test:shard-<k>` unit is a split-by-file part (its project's test-shards.test.ts checks it); every
    // whole project the snapshot weighs must still be a test project.
    for (const project of Object.keys(snapshot.seconds).filter((unit) => !unit.includes(':'))) {
      expect(broad).toContain(project);
    }
    // Every shard task of ui is weighed, so the deal never falls back to the default for them.
    for (const task of uiShards) {
      expect(Object.keys(snapshot.seconds)).toContain(task);
    }
    expect(snapshot.defaultSeconds).toBeGreaterThan(0);
  });

  it.each([
    ['not an object', null],
    ['missing default', { seconds: {} }],
    ['zero default', { defaultSeconds: 0, seconds: {} }],
    ['missing seconds', { defaultSeconds: 1 }],
    ['array seconds', { defaultSeconds: 1, seconds: [] }],
    ['negative weight', { defaultSeconds: 1, seconds: { ui: -1 } }],
    ['string weight', { defaultSeconds: 1, seconds: { ui: '804' } }],
    ['infinite weight', { defaultSeconds: 1, seconds: { ui: Number.POSITIVE_INFINITY } }],
  ])('rejects a corrupt snapshot: %s', (_name, raw) => {
    expect(() => parseDurations(raw)).toThrow(/duration snapshot/u);
  });
});

describe('parseProjects', () => {
  it('accepts an array of names', () => {
    expect(parseProjects(['ui', 'cli'])).toEqual(['ui', 'cli']);
  });

  it.each([
    ['an object', { ui: true }],
    ['a number', [1]],
    ['an empty name', ['']],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseProjects(raw)).toThrow(/JSON array/u);
  });

  it('rejects duplicates', () => {
    expect(() => parseProjects(['ui', 'ui'])).toThrow(/duplicates/u);
  });
});

/** A task graph file as `nx … --graph=<file>` writes it: each task's project and target, and its dependencies. */
const taskGraph = (dependencies: Record<string, readonly string[]>): unknown => ({
  tasks: {
    tasks: Object.fromEntries(
      [...new Set([...Object.keys(dependencies), ...Object.values(dependencies).flat()])].map((id) => {
        const [project, ...target] = id.split(':');
        return [id, { target: { project, target: target.join(':') } }];
      }),
    ),
    dependencies,
  },
});

// The build lane's shape: `ui`'s payload check depends on the desktop build, which `desktop` also owns.
const buildGraph = taskGraph({
  'ui:build': [],
  'ui:build:desktop': [],
  'ui:check-desktop-payload': ['ui:build:desktop', 'desktop:build'],
  'desktop:build': ['desktop:typecheck', 'ui:build:desktop'],
  'desktop:typecheck': [],
  'docs:build': [],
  'cli:build': ['runtime:build'],
  'runtime:build': [],
  'host:build': ['runtime:build'],
});
const buildTargets = ['build', 'check-desktop-payload'];
const buildSeconds = table(
  {
    'ui:build': 130,
    'ui:build:desktop': 75,
    'desktop:typecheck': 70,
    'desktop:build': 15,
    'docs:build': 60,
    'cli:build': 50,
    'runtime:build': 40,
    'host:build': 30,
  },
  2,
);
const buildProjects = ['ui', 'desktop', 'docs', 'cli', 'runtime', 'host'];

describe('dealUnits', () => {
  const seconds = (task: string): number => weightOf(task, buildSeconds);

  it('deals disjoint units exactly as the plain deal does', () => {
    const units = broad.map((project) => ({ name: project, tasks: [project] }));
    for (const shards of [1, 2, 3, 4]) {
      expect(dealUnits(units, shards, (task) => weightOf(task, snapshot)).dealt).toEqual(deal(broad, shards, snapshot));
    }
  });

  it('keeps a unit with the shard that already runs the tasks it depends on (C5: every project in one shard)', () => {
    const units = unitsFromGraph(buildGraph, buildProjects, buildTargets);
    const { dealt, loads } = dealUnits(units, 2, seconds);
    expectPartition(buildProjects, dealt);
    // `desktop` adds nothing to the shard whose `ui` already builds it, so the desktop chain is built once.
    expect(dealt.find((shard) => shard.includes('ui'))).toContain('desktop');
    expect(loads).toEqual([292, 180]);
  });

  it('counts a shared dependency once per shard that runs it', () => {
    const { loads } = dealUnits(
      [
        { name: 'a', tasks: ['shared', 'a'] },
        { name: 'b', tasks: ['shared', 'b'] },
      ],
      2,
      (task) => ({ shared: 100, a: 10, b: 10 })[task] ?? 0,
    );
    // Together: 120 on one shard beats 110 and 110 apart only when it does not lengthen the longest shard.
    expect(loads).toEqual([110, 110]);
  });

  it('is independent of input order', () => {
    const units = unitsFromGraph(buildGraph, buildProjects, buildTargets);
    expect(dealUnits(units.toReversed(), 2, seconds).dealt).toEqual(dealUnits(units, 2, seconds).dealt);
  });
});

describe('unitsFromGraph', () => {
  it('gives each project its own lane tasks and everything they depend on', () => {
    const units = unitsFromGraph(buildGraph, ['ui', 'cli'], buildTargets);
    expect(units).toEqual([
      {
        name: 'ui',
        tasks: ['desktop:build', 'desktop:typecheck', 'ui:build', 'ui:build:desktop', 'ui:check-desktop-payload'],
      },
      { name: 'cli', tasks: ['cli:build', 'runtime:build'] },
    ]);
  });

  it('refuses a project without a lane task and a file without a task graph', () => {
    expect(() => unitsFromGraph(buildGraph, ['ghost'], buildTargets)).toThrow(/no build, check-desktop-payload task/u);
    expect(() => unitsFromGraph({ graph: {} }, ['ui'], buildTargets)).toThrow(/no task graph/u);
  });
});

describe('shardCount', () => {
  it.each([
    [0, 1],
    [599, 1],
    [600, 1],
    [601, 2],
    [1800, 3],
    [5000, 4],
  ])('gives %d s %d shards at 600 s a shard, at most four', (seconds, shards) => {
    expect(shardCount(seconds, 4, 600)).toBe(shards);
  });
});

describe('run with a graph', () => {
  const files = new Map([
    ['graph.json', JSON.stringify(buildGraph)],
    ['build.json', JSON.stringify(buildSeconds)],
  ]);
  const read = (path: string): string => files.get(path) ?? '';
  const args = (shard: string): string[] => [
    '--shard',
    shard,
    '--shards',
    '2',
    '--durations',
    'build.json',
    '--graph',
    'graph.json',
    '--targets',
    buildTargets.join(','),
  ];

  it('prints each shard, and the shards together are every project once (C5)', () => {
    const outputs = ['1', '2'].map((shard) => run(args(shard), JSON.stringify(buildProjects), read));
    expect(outputs.map(({ code }) => code)).toEqual([0, 0]);
    expectPartition(
      buildProjects,
      outputs.map(({ output }) => output.split(',')),
    );
  });

  it('prints the whole deal as a matrix with an automatic shard count', () => {
    const matrix = run(
      [
        '--shard',
        'all',
        '--shards',
        'auto',
        '--max-shards',
        '4',
        '--shard-seconds',
        '300',
        '--durations',
        'build.json',
      ],
      JSON.stringify(['ui', 'docs', 'cli']),
      (path) => (path === 'build.json' ? JSON.stringify(table({ ui: 400, docs: 150, cli: 100 })) : ''),
    );
    expect(matrix).toEqual({
      code: 0,
      output: JSON.stringify([
        { shard: 1, shards: 3, projects: 'ui' },
        { shard: 2, shards: 3, projects: 'docs' },
        { shard: 3, shards: 3, projects: 'cli' },
      ]),
    });
    expect(run(['--shard', 'all', '--shards', 'auto', '--max-shards', '4', '--shard-seconds', '300'], '[]')).toEqual({
      code: 0,
      output: '[]',
    });
  });

  it.each([
    [['--shard', 'all', '--shards', 'auto']],
    [['--shard', '5', '--shards', 'auto', '--max-shards', '4', '--shard-seconds', '1']],
    [['--shard', '1', '--max-shards', '4']],
    [['--shard', '1', '--graph', 'graph.json']],
    [['--shard', '1', '--targets', 'build']],
    [['--shard', '1', '--shard', '2']],
  ])('refuses usage %j', (bad) => {
    expect(run(bad, '[]', read).code).toBe(2);
  });

  it('fails on a project the graph does not hold', () => {
    expect(run(args('1'), '["ghost"]', read).code).toBe(1);
  });
});

describe('run', () => {
  const input = JSON.stringify(broad);

  it('prints each shard, and the shards together are the selected set', () => {
    const outputs = [1, 2, 3].map((shard) => run(['--shard', String(shard)], input));
    for (const { code } of outputs) {
      expect(code).toBe(0);
    }
    expect(outputs[0]?.output.split(',')[0]).toBe('ui');
    expectPartition(
      broad,
      outputs.map(({ output }) => output.split(',')),
    );
  });

  it('prints an empty line for a shard with no projects', () => {
    expect(run(['--shard', '3'], '["ui"]')).toEqual({ code: 0, output: '' });
  });

  it('reads another duration snapshot', () => {
    const files = new Map([['custom.json', JSON.stringify({ defaultSeconds: 1, seconds: { b: 5 } })]]);
    const read = (path: string): string => files.get(path) ?? '';
    expect(run(['--shard', '1', '--shards', '2', '--durations', 'custom.json'], '["a","b"]', read)).toEqual({
      code: 0,
      output: 'b',
    });
  });

  it.each([
    [[]],
    [['--shard', '0']],
    [['--shard', '4']],
    [['--shard', '1', '--shards', 'x']],
    [['--shard', '1', '--durations']],
    [['--shard', '1', '--durations', '']],
    [['--shard', '1', '--extra', 'y']],
  ])('refuses usage %j', (args) => {
    expect(run(args, input).code).toBe(2);
  });

  it('fails on a corrupt project list or snapshot', () => {
    expect(run(['--shard', '1'], 'not json').code).toBe(1);
    expect(run(['--shard', '1'], '["ui","ui"]')).toEqual({
      code: 1,
      output: 'test-shard-dealer: project list has duplicates',
    });
    expect(run(['--shard', '1'], input, () => '{"defaultSeconds":0}').code).toBe(1);
    expect(
      run(['--shard', '1'], input, () => {
        throw new Error('unreadable');
      }),
    ).toEqual({ code: 1, output: 'test-shard-dealer: unreadable' });
  });
});

describe('ci.yml', () => {
  type Step = { readonly name?: string; readonly run?: string };
  const ci = load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')) as {
    readonly jobs: Record<string, { readonly steps?: readonly Step[] }>;
  };
  const lanes = Object.values(ci.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((step) => step.name === "Run the lane's tasks")?.run;

  it('deals the test lanes with this script', () => {
    expect(lanes).toMatch(/node scripts\/src\/test-shard-dealer\.ts --shard "\$\{LANE#test-\}" --shards 6/u);
  });

  it('deals the package checks in the plan with this script and their own snapshot, as many shards as they need', () => {
    const plan = ci.jobs['plan']?.steps?.find((step) => step.name === 'Compute affected lanes')?.run;
    expect(plan).toMatch(
      /node scripts\/src\/test-shard-dealer\.ts --shard all --shards auto \\\n\s+--max-shards 4 --shard-seconds 600 --durations scripts\/src\/pkgcheck-shard-durations\.json/u,
    );
    const matrix = (ci.jobs['affected-lane'] as { strategy?: { matrix?: { lane?: string[] } } } | undefined)?.strategy
      ?.matrix?.lane;
    expect(matrix?.filter((lane) => lane.startsWith('pkgcheck'))).toEqual([]);
  });

  it('deals lint, typecheck and build over two shards each from the lane graph and its own snapshot', () => {
    const matrix = (ci.jobs['affected-lane'] as { strategy?: { matrix?: { lane?: string[] } } } | undefined)?.strategy
      ?.matrix?.lane;
    expect(matrix).toEqual([
      'lint-1',
      'lint-2',
      'typecheck-1',
      'typecheck-2',
      'build-1',
      'build-2',
      'test-1',
      'test-2',
      'test-3',
      'test-4',
      'test-5',
      'test-6',
    ]);
    expect(lanes).toMatch(
      /node scripts\/src\/test-shard-dealer\.ts --shard "\$\{LANE##\*-\}" --shards 2 \\\n\s+--durations "scripts\/src\/\$kind-shard-durations\.json" --graph "\$graph" --targets "\$targets"/u,
    );
    for (const kind of ['lint', 'typecheck', 'build']) {
      expect(() =>
        parseDurations(JSON.parse(readFileSync(resolve(import.meta.dirname, `${kind}-shard-durations.json`), 'utf8'))),
      ).not.toThrow();
    }
  });

  it('names only real projects in the package-check snapshot', () => {
    const pkgcheck = parseDurations(
      JSON.parse(readFileSync(resolve(import.meta.dirname, 'pkgcheck-shard-durations.json'), 'utf8')),
    );
    const projects = execFileSync('git', ['ls-files', '*project.json'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((file) => file.endsWith('/project.json'))
      .map((file) => (JSON.parse(readFileSync(resolve(root, file), 'utf8')) as { name?: string }).name);
    for (const project of Object.keys(pkgcheck.seconds)) {
      expect(projects).toContain(project);
    }
  });

  it('deals the formal shards with this script and their own snapshot', () => {
    const formal = ci.jobs['formal'] as
      | { strategy?: { matrix?: { shard?: number[] } }; steps?: readonly Step[] }
      | undefined;
    const deal = formal?.steps?.find((step) => step.name === 'Deal affected formal tasks')?.run;
    expect(deal).toMatch(
      /node scripts\/src\/test-shard-dealer\.ts --shard "\$SHARD" --shards 3 \\\n\s+--durations scripts\/src\/formal-shard-durations\.json/u,
    );
    expect(formal?.strategy?.matrix?.shard).toEqual([1, 2, 3]);
  });
});

describe('viewer-parity.yml', () => {
  type Step = { readonly name?: string; readonly run?: string; readonly env?: Record<string, string> };
  const workflow = load(readFileSync(resolve(root, '.github/workflows/viewer-parity.yml'), 'utf8')) as {
    readonly jobs: Record<string, { readonly steps?: readonly Step[] }>;
  };
  const steps = workflow.jobs['viewer']?.steps ?? [];
  const fixtures = (
    JSON.parse(readFileSync(resolve(root, 'libs/tau-examples/fixtures/viewer-parity/fixtures.json'), 'utf8')) as {
      fixtures: Array<{ name: string }>;
    }
  ).fixtures.map(({ name }) => name);
  const captureSeconds = parseDurations(
    JSON.parse(readFileSync(resolve(root, 'libs/tau-examples/fixtures/viewer-parity/capture-seconds.json'), 'utf8')),
  );

  it('deals the viewer shards with this script and the capture-seconds snapshot', () => {
    expect(steps.find((step) => step.name === "Deal this shard's fixtures")?.run).toMatch(
      /node scripts\/src\/test-shard-dealer\.ts --shard "\$SHARD" --shards 8 \\\n\s+--durations libs\/tau-examples\/fixtures\/viewer-parity\/capture-seconds\.json/u,
    );
    const capture = steps.find((step) => step.name === "Capture the viewer's frames");
    expect(capture?.env?.['PARITY_FIXTURES']).toMatch(/^\$\{\{ steps\.deal\.outputs\.fixtures \}\}$/u);
    expect(capture?.env).not.toHaveProperty('PARITY_SHARD');
  });

  it('names only real fixtures in the snapshot', () => {
    for (const fixture of Object.keys(captureSeconds.seconds)) {
      expect(fixtures).toContain(fixture);
    }
  });

  it('gives every shard fixtures and keeps the slowest shard within one fixture of the fastest', () => {
    const dealt = deal(fixtures, 8, captureSeconds);
    expectPartition(fixtures, dealt);
    const loads = dealt.map((shard) => shard.reduce((sum, fixture) => sum + weightOf(fixture, captureSeconds), 0));
    expect(dealt.every((shard) => shard.length > 0)).toBe(true);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(
      Math.max(...fixtures.map((fixture) => weightOf(fixture, captureSeconds))),
    );
  });
});
