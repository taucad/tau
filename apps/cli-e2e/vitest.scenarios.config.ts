// oxlint-disable-next-line eslint/no-restricted-imports, import/no-empty-named-blocks -- Type-only augmentation import for config consumers before aliases are installed.
import type {} from './src/cli-scenarios.test-utils.js';
import { globSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

/**
 * The CLI's end-to-end suites: the built binary, `tau serve`, `tau mcp` and `tau agent` spawned against real kernels.
 * Named so the Nx Vitest plugin infers no `test` target: they run through `cli-e2e:test:scenarios` in their own CI
 * lane, not in the affected test shards.
 *
 * `TAU_CI_SHARD` (`<index>/<count>`, set by the sharded `CLI end-to-end` lane of ci.yml and an input of the target, so
 * each shard has its own cache entry) selects this shard's files: they are dealt by the measured seconds below,
 * heaviest first to the lightest shard (the rule of scripts/src/test-shard-dealer.ts, kept inline so the project does
 * not depend on `scripts`), so the shards partition them. `examples-check.integration.test.ts`, the ten-minute fixture sweep, runs on
 * every shard and checks only its share of the fixtures (`shardSlice`), so the shards together still check each once.
 * Unset, every file runs.
 */
const shardVariable = process.env['TAU_CI_SHARD'] ?? '';
const shard = /^(?<index>[1-9]\d*)\/(?<count>[1-9]\d*)$/u.exec(shardVariable === '' ? '1/1' : shardVariable)?.groups;
const scenarioShard = { index: Number(shard?.['index']), count: Number(shard?.['count']) };
if (!(scenarioShard.index >= 1 && scenarioShard.index <= scenarioShard.count)) {
  throw new TypeError(`TAU_CI_SHARD must be <index>/<count> with 1 <= index <= count: ${process.env['TAU_CI_SHARD']}`);
}

/** The file every shard runs, each for its own share. */
const splitFile = 'src/examples-check.integration.test.ts';

/**
 * Uncached seconds per file (the sum of its tests) in merge-queue job 130977219855, 2026-11-12, at the default worker
 * count; a file not listed weighs `defaultSeconds`. Refresh when a file moves by more than a quarter or is split.
 */
const durations = {
  defaultSeconds: 30,
  seconds: {
    'src/agent-board-capture.integration.test.ts': 7,
    'src/agent-board.integration.test.ts': 9,
    'src/build123d-export.integration.test.ts': 137,
    'src/cli-distribution.test.ts': 158,
    'src/cli-scenarios.integration.test.ts': 190,
    'src/commands/agent.integration.test.ts': 101,
    'src/commands/mcp.integration.test.ts': 295,
    'src/commands/prepare-mirror.integration.test.ts': 52,
    'src/commands/serve.integration.test.ts': 105,
    'src/serve-agent.integration.test.ts': 23,
  },
};

/**
 * Deal files into `count` lists, heaviest first to the least-loaded list; ties by name, then by the lowest list.
 *
 * @param files - The files to deal.
 * @param count - The number of shards.
 * @returns Each shard's files.
 */
const deal = (files: readonly string[], count: number): string[][] => {
  const weight = (file: string): number =>
    (durations.seconds as Readonly<Record<string, number>>)[file] ?? durations.defaultSeconds;
  const load = Array.from({ length: count }, () => 0);
  const dealt = Array.from({ length: count }, (): string[] => []);
  for (const file of files.toSorted((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const lightest = load.indexOf(Math.min(...load));
    load[lightest]! += weight(file);
    dealt[lightest]!.push(file);
  }
  return dealt;
};

const files = globSync('src/**/*.test.ts', { cwd: import.meta.dirname }).toSorted();
const include =
  scenarioShard.count === 1
    ? ['src/**/*.test.ts']
    : [
        splitFile,
        ...(deal(
          files.filter((file) => file !== splitFile),
          scenarioShard.count,
        )[scenarioShard.index - 1] ?? []),
      ];

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include,
    provide: { scenarioShard },
    environment: 'node',
    /*
     * The dist-smoke test spawns the built CLI against the real birdhouse fixture; the cold path includes WASM init
     * for the replicad kernel. 60s gives plenty of headroom on slow CI runners.
     */
    testTimeout: 60_000,
    // On GitHub Actions a failure also becomes a check-run annotation, readable without the job log.
    reporters: process.env['GITHUB_ACTIONS'] === 'true' ? ['verbose', 'github-actions'] : ['verbose'],
  },
});
