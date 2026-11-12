import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { deal, parseDurations, parseProjects, run, weightOf } from '#test-shard-dealer.js';
import type { DurationTable } from '#test-shard-dealer.js';

const root = resolve(import.meta.dirname, '../..');
const snapshot = parseDurations(
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'test-shard-durations.json'), 'utf8')),
);

const table = (seconds: Record<string, number>, defaultSeconds = 10): DurationTable => ({ defaultSeconds, seconds });

/** Every lane's deal for one input; the union must be the input and the shards disjoint. */
const dealAll = (projects: readonly string[], durations: DurationTable = snapshot, shards = 3): string[][] =>
  deal(projects, shards, durations);

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

  it('separates cli, ui and the breadth on a broad landing and keeps the shards within one small project', () => {
    const dealt = dealAll(broad);
    expectPartition(broad, dealt);
    expect(dealt.map((shard) => shard[0])).toEqual(['cli', 'ui', 'host']);
    expect(dealt[2]?.slice(0, 6)).toEqual(['host', 'ui-e2e', 'build123d', 'zoo', 'runtime', 'viewer']);
    const loads = dealt.map((shard) => shard.reduce((sum, project) => sum + weightOf(project, snapshot), 0));
    // File-count weights put cli, ui-e2e, runtime and desktop together (1,199 s); the duration deal tops out at 948 s.
    expect(loads).toEqual([944, 941, 948]);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(snapshot.defaultSeconds);
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
    expect(weightOf('cli', snapshot)).toBe(854);
    const dealt = dealAll(['brand-new-project', 'ui']);
    expect(dealt).toEqual([['ui'], ['brand-new-project'], []]);
  });

  it('ignores snapshot entries for renamed or deleted projects', () => {
    const dealt = dealAll(['ui-core', 'ui-e2e']);
    expectPartition(['ui-core', 'ui-e2e'], dealt);
    expect(dealt).toEqual([['ui-e2e'], ['ui-core'], []]);
  });

  it('honours another shard count', () => {
    const dealt = dealAll(broad, snapshot, 2);
    expect(dealt).toHaveLength(2);
    expectPartition(broad, dealt);
  });
});

describe('parseDurations', () => {
  it('accepts the checked-in snapshot and its project names are real projects', () => {
    for (const project of Object.keys(snapshot.seconds)) {
      expect(broad).toContain(project);
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

describe('run', () => {
  const input = JSON.stringify(broad);

  it('prints each shard, and the shards together are the selected set', () => {
    const outputs = [1, 2, 3].map((shard) => run(['--shard', String(shard)], input));
    for (const { code } of outputs) {
      expect(code).toBe(0);
    }
    expect(outputs[0]?.output.split(',')[0]).toBe('cli');
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
    expect(lanes).toMatch(/node scripts\/src\/test-shard-dealer\.ts --shard "\$\{LANE#test-\}" --shards 3/u);
  });

  it('deals the package-check lanes with this script and their own snapshot', () => {
    expect(lanes).toMatch(
      /node scripts\/src\/test-shard-dealer\.ts --shard "\$\{LANE#pkgcheck-\}" --shards 3 \\\n\s+--durations scripts\/src\/pkgcheck-shard-durations\.json/u,
    );
    const matrix = (ci.jobs['affected-lane'] as { strategy?: { matrix?: { lane?: string[] } } } | undefined)?.strategy
      ?.matrix?.lane;
    expect(matrix).toEqual(expect.arrayContaining(['pkgcheck-1', 'pkgcheck-2', 'pkgcheck-3']));
    expect(matrix).not.toContain('pkgcheck');
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
      /node scripts\/src\/test-shard-dealer\.ts --shard "\$SHARD" --shards 4 \\\n\s+--durations libs\/tau-examples\/fixtures\/viewer-parity\/capture-seconds\.json/u,
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
    const dealt = deal(fixtures, 4, captureSeconds);
    expectPartition(fixtures, dealt);
    const loads = dealt.map((shard) => shard.reduce((sum, fixture) => sum + weightOf(fixture, captureSeconds), 0));
    expect(dealt.every((shard) => shard.length > 0)).toBe(true);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(
      Math.max(...fixtures.map((fixture) => weightOf(fixture, captureSeconds))),
    );
  });
});
