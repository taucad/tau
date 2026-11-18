/* oxlint-disable no-restricted-imports -- the Nx plugin under test is workspace tooling under tools/, with no package specifier */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CreateNodesContextV2, TargetConfiguration } from '@nx/devkit';
// eslint-disable-next-line @nx/enforce-module-boundaries -- the Nx plugin under test is workspace tooling, not a project
import {
  createNodesV2,
  createShardTargets,
  dealFiles,
  parseTestShardsConfig,
  shardFilesVariable,
} from '../../tools/test-shards.plugin.js';
import { parseDurations } from '#test-shard-dealer.js';

/*
 * C5 for a `test` split by file (tau-brain research/ci-scaling-best-practice-review.md): the `test:shard-<k>` groups
 * of `tools/test-shards.plugin.ts` partition the files Vitest collects for the project's `test`, each group runs
 * exactly its own files, and each is cached on its own files. The affected test lanes deal the groups in place of
 * `test`, so a file in no group would never run in the queue, and a file in two would run twice.
 */

const root = resolve(import.meta.dirname, '../..');
const context = {
  workspaceRoot: root,
  nxJsonConfiguration: { namedInputs: {} },
} as unknown as CreateNodesContextV2;

const shardTargets = async (configFile: string): Promise<Record<string, TargetConfiguration>> => {
  const results = await createNodesV2[1]([configFile], {}, context);
  const [, result] = results[0] ?? [];
  return Object.values(result?.projects ?? {})[0]?.targets ?? {};
};

const filesOf = (target: TargetConfiguration | undefined): string[] =>
  ((target?.options as { env?: Record<string, string> } | undefined)?.env?.[shardFilesVariable] ?? '').split(',');

/** The files Vitest collects in a project, relative to it, with the environment a target gives it. */
const vitestFiles = (projectRoot: string, env: Record<string, string> = {}): string[] => {
  const listed = execFileSync(
    resolve(root, 'node_modules/.bin/vitest'),
    ['list', '--filesOnly', '--json', '--root', projectRoot],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  return (JSON.parse(listed) as Array<{ file: string }>)
    .map(({ file }) => relative(resolve(root, projectRoot), file).replaceAll('\\', '/'))
    .toSorted();
};

const config = (shards: number, seconds: Record<string, number> = {}) =>
  parseTestShardsConfig({
    shards,
    include: ['**/*.test.ts'],
    defaultSeconds: 1,
    seconds,
  });

describe('test-shards plugin', () => {
  it('deals every file into exactly one group, heaviest first to the lightest', () => {
    const files = ['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts', 'e.test.ts'];
    const groups = dealFiles(files, config(2, { 'a.test.ts': 10, 'b.test.ts': 6, 'c.test.ts': 5 }));
    expect(groups).toEqual([
      ['a.test.ts', 'd.test.ts', 'e.test.ts'],
      ['b.test.ts', 'c.test.ts'],
    ]);
    expect(groups.flat().toSorted()).toEqual(files);
  });

  it('places a new file by itself, so no file is ever left out', () => {
    const groups = dealFiles(['known.test.ts', 'new.test.ts'], config(2, { 'known.test.ts': 30 }));
    expect(groups.flat().toSorted()).toEqual(['known.test.ts', 'new.test.ts']);
  });

  it('keys each group on its own files: the test inputs less every other group', () => {
    const targets = createShardTargets([['a.test.ts'], ['b.test.ts', 'c.test.ts']], 'packages/x');
    expect(Object.keys(targets)).toEqual(['test:shard-1', 'test:shard-2']);
    expect(targets['test:shard-1']?.inputs).toEqual([
      'default',
      '^production',
      'serviceEnvironment',
      '!{projectRoot}/test-shards.json',
      '!{projectRoot}/b.test.ts',
      '!{projectRoot}/c.test.ts',
    ]);
    expect(targets['test:shard-2']?.inputs).toContain('!{projectRoot}/a.test.ts');
    expect(targets['test:shard-1']?.cache).toBe(true);
    // The affected test lanes deal a project's `test:shard-<n>` targets by that name (ST-1).
    expect(Object.keys(targets).every((name) => /^test:shard-[1-9][0-9]*$/u.test(name))).toBe(true);
    expect(targets['test:shard-1']?.dependsOn).toEqual(['copy-assets', '^copy-assets']);
    expect(filesOf(targets['test:shard-2'])).toEqual(['b.test.ts', 'c.test.ts']);
  });

  it.each([
    ['one shard', { shards: 1, include: ['*.ts'], defaultSeconds: 1, seconds: {} }],
    ['no include', { shards: 2, include: [], defaultSeconds: 1, seconds: {} }],
    ['zero default', { shards: 2, include: ['*.ts'], defaultSeconds: 0, seconds: {} }],
    [
      'negative seconds',
      {
        shards: 2,
        include: ['*.ts'],
        defaultSeconds: 1,
        seconds: { 'a.ts': -1 },
      },
    ],
  ])('refuses a malformed test-shards.json: %s', (_name, raw) => {
    expect(() => parseTestShardsConfig(raw)).toThrow(/test-shards\.json needs/u);
  });
});

describe('revisions:test split by file (ST-3)', () => {
  const projectRoot = 'packages/revisions';
  const raw = JSON.parse(readFileSync(resolve(root, projectRoot, 'test-shards.json'), 'utf8')) as unknown;
  const shardsConfig = parseTestShardsConfig(raw);

  it('partitions exactly the files Vitest collects for revisions:test (C5)', async () => {
    const targets = await shardTargets(join(projectRoot, 'test-shards.json'));
    const groups = Object.keys(targets).map((name) => filesOf(targets[name]));
    expect(Object.keys(targets)).toEqual(['test:shard-1', 'test:shard-2', 'test:shard-3']);
    const union = groups.flat();
    expect(new Set(union).size).toBe(union.length);
    expect(union.toSorted()).toEqual(vitestFiles(projectRoot));
    // Type tests count: Vitest typechecks them under `test`, so one group must run each.
    expect(union.filter((file) => file.endsWith('.test-d.ts')).length).toBeGreaterThan(0);
    expect(groups.every((group) => group.some((file) => file.endsWith('.test.ts')))).toBe(true);
  }, 120_000);

  it('runs exactly its own files in each group', async () => {
    const targets = await shardTargets(join(projectRoot, 'test-shards.json'));
    for (const target of Object.values(targets)) {
      const files = filesOf(target);
      expect(vitestFiles(projectRoot, { [shardFilesVariable]: files.join(',') })).toEqual(files.toSorted());
    }
  }, 120_000);

  it('weighs each group in the test lanes and names only files that exist', () => {
    const lanes = parseDurations(
      JSON.parse(readFileSync(resolve(import.meta.dirname, 'test-shard-durations.json'), 'utf8')),
    );
    for (let shard = 1; shard <= shardsConfig.shards; shard++) {
      expect(lanes.seconds[`revisions:test:shard-${shard}`]).toBeGreaterThan(0);
    }
    const files = vitestFiles(projectRoot);
    for (const file of Object.keys(shardsConfig.seconds)) {
      expect(files).toContain(file);
    }
  }, 120_000);
});
