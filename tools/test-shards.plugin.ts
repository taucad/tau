/**
 * NX Plugin that splits a project's Vitest `test` into `test:shard-<k>` targets by file.
 *
 * A project opts in with a `test-shards.json` beside its Vitest config:
 * `{ "shards": <n>, "include": [<globs>], "defaultSeconds": <s>, "seconds": { "<file>": <s> } }`, files relative to
 * the project. The plugin lists the files `include` matches (the same files the project's Vitest config collects for
 * `test`: its test files and, when Vitest typechecks, its `*.test-d.ts` files), deals them into `n` groups by
 * measured seconds, heaviest first to the lightest group (ties by path, then the lowest group), and gives each group
 * a cached target that runs `vitest run` on exactly its files through `TAU_VITEST_SHARD_FILES`, which the project's
 * Vitest config reads. A file the snapshot does not list weighs `defaultSeconds`, so a new test file joins a group by
 * itself and no file is ever left out.
 *
 * Each target has the `test` inputs less every other group's files, so an edit to one test file reruns only its own
 * group, and `metadata.shardOf: "test"` tells the affected test lanes of `ci.yml` to deal the groups in place of
 * `test` (tau-brain `research/ci-structural-decomposition-blueprint.md` ST-3). `test` itself still runs every file,
 * locally and in the release gate. `scripts/src/test-shards-union.test.ts` proves the groups partition the files
 * Vitest collects.
 */
import { globSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readJsonFile } from '@nx/devkit';
import type { CreateNodesResult, CreateNodesV2, TargetConfiguration } from '@nx/devkit';

/** A project's `test-shards.json`. */
export type TestShardsConfig = {
  readonly shards: number;
  readonly include: readonly string[];
  readonly defaultSeconds: number;
  readonly seconds: Readonly<Record<string, number>>;
};

/** The environment variable that hands a group's files to the project's Vitest config, comma-separated. */
export const shardFilesVariable = 'TAU_VITEST_SHARD_FILES';

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Validate a parsed `test-shards.json`; throws on a malformed one. */
export const parseTestShardsConfig = (raw: unknown): TestShardsConfig => {
  const config = raw as Partial<TestShardsConfig> | null;
  if (
    typeof config !== 'object' ||
    config === null ||
    !Number.isInteger(config.shards) ||
    config.shards! < 2 ||
    !Array.isArray(config.include) ||
    config.include.length === 0 ||
    config.include.some((pattern) => typeof pattern !== 'string' || pattern === '') ||
    !isPositive(config.defaultSeconds) ||
    typeof config.seconds !== 'object' ||
    config.seconds === null ||
    Object.values(config.seconds).some((seconds) => !isPositive(seconds))
  ) {
    throw new Error('test-shards.json needs shards (at least 2), include, a positive defaultSeconds and seconds');
  }
  return config as TestShardsConfig;
};

/** Deal files into `shards` groups by seconds: heaviest first to the lightest group; deterministic. */
export const dealFiles = (files: readonly string[], config: TestShardsConfig): string[][] => {
  const weight = (file: string): number =>
    Object.hasOwn(config.seconds, file) ? config.seconds[file]! : config.defaultSeconds;
  const ordered = [...new Set(files)].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0));
  const loads = Array.from({ length: config.shards }, () => 0);
  const groups = Array.from({ length: config.shards }, (): string[] => []);
  for (const file of ordered) {
    let best = 0;
    for (let shard = 1; shard < config.shards; shard++) {
      if (loads[shard]! < loads[best]!) {
        best = shard;
      }
    }
    loads[best]! += weight(file);
    groups[best]!.push(file);
  }
  return groups.map((group) => group.toSorted());
};

/** The project's test files that `include` matches, relative to the project and sorted. */
export const listTestFiles = (projectDirectory: string, include: readonly string[]): string[] =>
  [
    ...new Set(
      globSync([...include], {
        cwd: projectDirectory,
        exclude: (path) => path.includes('node_modules'),
      }),
    ),
  ]
    .map((file) => file.replaceAll('\\', '/'))
    .toSorted();

/** The `test:shard-<k>` targets for one project. */
export const createShardTargets = (
  groups: readonly (readonly string[])[],
  projectRoot: string,
): Record<string, TargetConfiguration> =>
  Object.fromEntries(
    groups.map((files, index) => {
      const others = groups.flatMap((group, other) => (other === index ? [] : group));
      return [
        `test:shard-${index + 1}`,
        {
          executor: 'nx:run-commands',
          cache: true,
          dependsOn: ['copy-assets', '^copy-assets'],
          inputs: [
            'default',
            '^production',
            'serviceEnvironment',
            '!{projectRoot}/test-shards.json',
            ...others.map((file) => `!{projectRoot}/${file}`),
          ],
          options: {
            cwd: projectRoot,
            command: 'vitest run',
            env: { [shardFilesVariable]: files.join(',') },
          },
          metadata: {
            shardOf: 'test',
            description: `Run ${files.length} of the project's ${groups.flat().length} Vitest files (group ${index + 1} of ${groups.length})`,
          },
        },
      ];
    }),
  );

const createTestShards = (configFile: string, workspaceRoot: string): CreateNodesResult => {
  const projectRoot = dirname(configFile);
  const config = parseTestShardsConfig(readJsonFile(join(workspaceRoot, configFile)));
  const files = listTestFiles(join(workspaceRoot, projectRoot), config.include);
  return {
    projects: {
      [projectRoot]: {
        targets: createShardTargets(dealFiles(files, config), projectRoot),
      },
    },
  };
};

export const createNodesV2: CreateNodesV2 = [
  '**/test-shards.json',
  // oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- not necessary as already has an explicit return type
  (configFiles, _options, context) =>
    configFiles.map((configFile): [string, CreateNodesResult] => [
      configFile,
      createTestShards(configFile, context.workspaceRoot),
    ]),
];
