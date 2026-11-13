/* oxlint-disable no-restricted-imports -- the Nx plugin under test is workspace tooling under tools/, with no package specifier */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateNodesContextV2 } from '@nx/devkit';
// eslint-disable-next-line @nx/enforce-module-boundaries -- the Nx plugin under test is workspace tooling, not a project
import { createNodesV2, specDirectories } from '../../tools/formal.plugin.js';

/**
 * The formal plugin infers `formal:tla` and `formal:lean` from the spec directories
 * `formal check` reads under `{projectRoot}/specs/`: `formal:lean` for a
 * `lean-toolchain` beside an `expected.json` with a `lean` section, `formal:tla` for a
 * `*.tla` beside one without. It never infers `formal:nightly` or `formal:logs`,
 * which stay explicit per project.
 */

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

let workspaceRoot: string;

const write = (file: string, contents: unknown): void => {
  mkdirSync(dirname(join(workspaceRoot, file)), { recursive: true });
  writeFileSync(join(workspaceRoot, file), typeof contents === 'string' ? contents : JSON.stringify(contents));
};

/** Writes each file (JSON for an object, an empty marker for undefined) and returns the paths. */
const writeAll = (files: Record<string, unknown>): string[] => {
  for (const [file, contents] of Object.entries(files)) {
    write(file, contents ?? '');
  }
  return Object.keys(files);
};

const inferredTargets = async (files: string[]): Promise<Record<string, string[]>> => {
  const context = {
    workspaceRoot,
    nxJsonConfiguration: {},
  } as unknown as CreateNodesContextV2;
  const results = await createNodesV2[1](files, {}, context);
  const targets: Record<string, string[]> = {};
  for (const [, result] of results) {
    for (const [root, project] of Object.entries(result.projects ?? {})) {
      targets[root] = [...(targets[root] ?? []), ...Object.keys(project.targets ?? {})].toSorted();
    }
  }
  return targets;
};

const tlaExpected = {
  configs: { 'spec.target.cfg': { tier: 'pr', expect: 'pass' } },
};
const leanExpected = { lean: { module: 'spec' } };

describe('formal plugin targets', () => {
  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'formal-plugin-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('should infer formal:tla for a project with a TLA+ spec beside its expected.json under specs', async () => {
    write('packages/a/project.json', { name: 'a' });
    const files = writeAll({
      'packages/a/specs/expected.json': tlaExpected,
      'packages/a/specs/Spec.tla': undefined,
      'packages/a/specs/nested/expected.json': tlaExpected,
      'packages/a/specs/nested/Nested.tla': undefined,
      'packages/a/specs/nested/MC_Nested.tla': undefined,
    });

    expect(await inferredTargets(files)).toEqual({
      'packages/a': ['formal:tla', 'formal:tla'],
    });
  });

  it('should infer formal:lean for a lean-toolchain beside a lean expected.json, and both tiers side by side', async () => {
    write('apps/lean-only/project.json', { name: 'lean-only' });
    write('packages/both/project.json', { name: 'both' });
    const files = writeAll({
      'apps/lean-only/specs/lean/expected.json': leanExpected,
      'apps/lean-only/specs/lean/lean-toolchain': undefined,
      'packages/both/specs/expected.json': tlaExpected,
      'packages/both/specs/Spec.tla': undefined,
      'packages/both/specs/lean/expected.json': leanExpected,
      'packages/both/specs/lean/lean-toolchain': undefined,
    });

    expect(await inferredTargets(files)).toEqual({
      'apps/lean-only': ['formal:lean'],
      'packages/both': ['formal:lean', 'formal:tla'],
    });
  });

  it('should infer nothing for a lean expected.json without a lean-toolchain beside it', async () => {
    write('packages/lean/project.json', { name: 'lean' });
    const files = writeAll({
      'packages/lean/specs/lean/expected.json': leanExpected,
      'packages/lean/specs/lean/Spec.lean': '',
      'packages/lean/specs/lean-toolchain': undefined,
    });

    expect(await inferredTargets(files)).toEqual({});
  });

  it('should infer nothing for a TLA+ expected.json without a .tla file beside it', async () => {
    write('packages/tla/project.json', { name: 'tla' });
    const files = writeAll({
      'packages/tla/specs/expected.json': tlaExpected,
      'packages/tla/specs/spec.target.cfg': '',
      'packages/tla/specs/modules/Spec.tla': undefined,
    });

    expect(await inferredTargets(files)).toEqual({});
  });

  it('should infer nothing when an expected.json disagrees with the marker beside it', async () => {
    write('packages/swap/project.json', { name: 'swap' });
    const files = writeAll({
      'packages/swap/specs/tla/expected.json': leanExpected,
      'packages/swap/specs/tla/Spec.tla': undefined,
      'packages/swap/specs/lean/expected.json': tlaExpected,
      'packages/swap/specs/lean/lean-toolchain': undefined,
    });

    expect(await inferredTargets(files)).toEqual({});
  });

  it('should ignore a stray expected.json with neither marker, and markers without an expected.json', async () => {
    write('packages/stray/project.json', { name: 'stray' });
    const files = writeAll({
      'packages/stray/specs/data/expected.json': { faces: 6 },
      'packages/stray/specs/lone/Lone.tla': undefined,
      'packages/stray/specs/lone-lean/lean-toolchain': undefined,
    });

    expect(await inferredTargets(files)).toEqual({});
  });

  it('should infer nothing when specs sits outside a project root or at the workspace root', async () => {
    write('packages/b/project.json', { name: 'b' });
    const files = writeAll({
      'packages/no-project/specs/expected.json': tlaExpected,
      'packages/no-project/specs/Spec.tla': undefined,
      'packages/b/src/specs/expected.json': tlaExpected,
      'packages/b/src/specs/Spec.tla': undefined,
      'specs/expected.json': tlaExpected,
      'specs/Spec.tla': undefined,
    });

    expect(await inferredTargets(files)).toEqual({});
  });

  it('should exclude specs under a fixture directory, even one shaped like a project', async () => {
    write('tools/formal/src/fixtures/toy/project.json', { name: 'toy' });
    write('packages/c/project.json', { name: 'c' });
    const files = writeAll({
      'tools/formal/src/fixtures/toy/specs/expected.json': tlaExpected,
      'tools/formal/src/fixtures/toy/specs/Toy.tla': undefined,
      'packages/c/specs/__fixtures__/expected.json': tlaExpected,
      'packages/c/specs/__fixtures__/Fixture.tla': undefined,
    });

    expect(await inferredTargets(files)).toEqual({});
  });

  it('should never infer formal:nightly or formal:logs, whatever the specs hold', async () => {
    write('packages/d/project.json', { name: 'd' });
    write('packages/d/specs/mutants.json', []);
    const files = writeAll({
      'packages/d/specs/expected.json': {
        configs: { 'spec.wide.cfg': { tier: 'nightly', expect: 'pass' } },
        graphs: { spec: { config: 'spec.export.cfg', phase: 'phase' } },
        logs: {
          specTrace: {
            'traces/run.ndjson': { tier: 'nightly', expect: 'pass' },
          },
        },
      },
      'packages/d/specs/Spec.tla': undefined,
      'packages/d/specs/lean/expected.json': leanExpected,
      'packages/d/specs/lean/lean-toolchain': undefined,
    });

    expect(await inferredTargets(files)).toEqual({
      'packages/d': ['formal:lean', 'formal:tla'],
    });
  });

  it('should give each TLA+ family below specs a target of its own and make formal:tla run them all', async () => {
    write('packages/f/project.json', { name: 'f' });
    const files = writeAll({
      'packages/f/specs/beta/expected.json': tlaExpected,
      'packages/f/specs/beta/Beta.tla': undefined,
      'packages/f/specs/alpha/expected.json': tlaExpected,
      'packages/f/specs/alpha/Alpha.tla': undefined,
      'packages/f/specs/lean/expected.json': leanExpected,
      'packages/f/specs/lean/lean-toolchain': undefined,
    });
    const context = {
      workspaceRoot,
      nxJsonConfiguration: {},
    } as unknown as CreateNodesContextV2;

    const results = await createNodesV2[1](files, {}, context);
    const alpha = results.find(([file]) => file === 'packages/f/specs/alpha/expected.json')?.[1].projects?.[
      'packages/f'
    ]?.targets;

    expect(await inferredTargets(files)).toEqual({
      'packages/f': ['formal:lean', 'formal:tla', 'formal:tla', 'formal:tla:alpha', 'formal:tla:beta'],
    });
    expect(alpha?.['formal:tla:alpha']).toMatchObject({
      executor: 'nx:run-commands',
      options: { command: 'node tools/formal/src/cli.ts check --tier pr --family alpha {projectRoot}' },
      cache: true,
      parallelism: false,
      outputs: ['{workspaceRoot}/out/reports/formal/{projectRoot}/pr/alpha'],
    });
    expect(alpha?.['formal:tla:alpha']?.inputs?.[0]).toBe('{projectRoot}/specs/alpha/**/*');
    // Every family's result carries the same formal:tla, so Nx's merge keeps one that runs both.
    expect(alpha?.['formal:tla']).toEqual({
      executor: 'nx:noop',
      dependsOn: [{ target: 'formal:tla:alpha' }, { target: 'formal:tla:beta' }],
      cache: false,
      metadata: { description: 'Every TLA+ family of the project: alpha, beta.' },
    });
  });

  it('should keep one formal:tla when a TLA+ spec sits at specs itself beside a family', async () => {
    write('packages/g/project.json', { name: 'g' });
    const files = writeAll({
      'packages/g/specs/expected.json': tlaExpected,
      'packages/g/specs/Root.tla': undefined,
      'packages/g/specs/family/expected.json': tlaExpected,
      'packages/g/specs/family/Family.tla': undefined,
    });

    expect(await inferredTargets(files)).toEqual({ 'packages/g': ['formal:tla', 'formal:tla'] });
  });

  it('should emit empty targets keyed by expected.json so nx.json targetDefaults stay the one source of their configuration', async () => {
    write('packages/e/project.json', { name: 'e' });
    const files = writeAll({
      'packages/e/specs/Spec.tla': undefined,
      'packages/e/specs/expected.json': tlaExpected,
    });
    const context = {
      workspaceRoot,
      nxJsonConfiguration: {},
    } as unknown as CreateNodesContextV2;

    const results = await createNodesV2[1](files, {}, context);

    expect(results).toEqual([
      ['packages/e/specs/expected.json', { projects: { 'packages/e': { targets: { 'formal:tla': {} } } } }],
    ]);
  });
});

/** Tracked files under a `specs` segment, outside fixture directories. */
const trackedSpecFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => {
      const segments = file.split('/').slice(0, -1);
      return (
        segments.includes('specs') && !segments.some((segment) => segment === 'fixtures' || segment === '__fixtures__')
      );
    })
    .filter((file) => /(?:^|\/)(?:expected\.json|lean-toolchain|[^/]+\.tla)$/u.test(file));

describe('tracked formal spec directories', () => {
  it('should pair every spec marker with an expected.json whose lean section matches it', () => {
    const mismatches: string[] = [];
    for (const [directory, entry] of specDirectories(trackedSpecFiles())) {
      if (entry.expected === undefined) {
        mismatches.push(`${directory}: ${entry.leanToolchain ? 'lean-toolchain' : '*.tla'} without expected.json`);
        continue;
      }
      const { lean } = JSON.parse(readFileSync(join(repositoryRoot, entry.expected), 'utf8')) as { lean?: unknown };
      if (lean !== undefined && !entry.leanToolchain) {
        mismatches.push(`${entry.expected}: lean section without lean-toolchain beside it`);
      } else if (lean === undefined && entry.leanToolchain) {
        mismatches.push(`${entry.expected}: lean-toolchain beside it but no lean section`);
      } else if (lean === undefined && !entry.tla) {
        mismatches.push(`${entry.expected}: neither lean-toolchain nor *.tla beside it`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('should give every tracked spec expected.json a target, so none is silently ignored', async () => {
    const files = trackedSpecFiles();
    const context = {
      workspaceRoot: repositoryRoot,
      nxJsonConfiguration: {},
    } as unknown as CreateNodesContextV2;
    const results = await createNodesV2[1](files, {}, context);
    const matched = new Set(results.map(([file]) => file));

    expect(files.filter((file) => file.endsWith('/expected.json') && !matched.has(file))).toEqual([]);
    expect(matched.size).toBeGreaterThan(0);
  });

  it('should name only inferred formal tasks in the formal shard snapshot', async () => {
    const files = trackedSpecFiles();
    const context = {
      workspaceRoot: repositoryRoot,
      nxJsonConfiguration: {},
    } as unknown as CreateNodesContextV2;
    const results = await createNodesV2[1](files, {}, context);
    const names = new Map(
      [...new Set(results.flatMap(([, result]) => Object.keys(result.projects ?? {})))].map((root) => [
        root,
        (JSON.parse(readFileSync(join(repositoryRoot, root, 'project.json'), 'utf8')) as { name: string }).name,
      ]),
    );
    const tasks = new Set(
      results.flatMap(([, result]) =>
        Object.entries(result.projects ?? {}).flatMap(([root, project]) =>
          Object.entries(project.targets ?? {})
            // The noop `formal:tla` of a project with families is never dealt; its families are.
            .filter(([, target]) => target.executor !== 'nx:noop')
            .map(([target]) => `${names.get(root)}:${target}`),
        ),
      ),
    );
    const { seconds } = JSON.parse(
      readFileSync(join(repositoryRoot, 'scripts/src/formal-shard-durations.json'), 'utf8'),
    ) as { seconds: Record<string, number> };

    expect(Object.keys(seconds).filter((task) => !tasks.has(task))).toEqual([]);
  });
});
