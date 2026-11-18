import { readFileSync } from 'node:fs';
import path from 'node:path';
import { workspaceRoot } from '#toolchain.js';

/** One of `count` runners: `index` is 1-based, as `--shard 2/4` writes it. */
export type Shard = { readonly index: number; readonly count: number };

/** `k/N` with 1 ≤ k ≤ N; anything else is `undefined`. */
export const parseShard = (text: string): Shard | undefined => {
  const match = /^(\d+)\/(\d+)$/.exec(text);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  return match && count >= 1 && index >= 1 && index <= count ? { index, count } : undefined;
};

/**
 * Measured seconds of each run, keyed by the runner's run name (`packages/agent-host/specs/X.cfg`, or
 * `<specs> apalache <args>`), and the weight of a run the table does not list.
 */
export type RunSeconds = {
  readonly defaultSeconds: number;
  readonly seconds: Readonly<Record<string, number>>;
};

export const runSecondsPath = path.join(workspaceRoot, 'tools/formal/run-seconds.json');

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Reads and validates the measured run seconds; a missing or non-positive weight throws. */
export const readRunSeconds = (file = runSecondsPath): RunSeconds => {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    readonly defaultSeconds?: unknown;
    readonly seconds?: unknown;
  };
  const { defaultSeconds, seconds } = raw;
  if (!isPositive(defaultSeconds) || typeof seconds !== 'object' || seconds === null || Array.isArray(seconds)) {
    throw new Error(`${file}: needs a positive defaultSeconds and a seconds object`);
  }
  for (const [name, value] of Object.entries(seconds)) {
    if (!isPositive(value)) {
      throw new Error(`${file}: ${name} has a non-positive weight`);
    }
  }
  return { defaultSeconds, seconds: seconds as Record<string, number> };
};

export const weightOf = (name: string, table: RunSeconds): number => table.seconds[name] ?? table.defaultSeconds;

/**
 * Deals runs to `count` shards by measured seconds: greedy longest-processing-time, heaviest first
 * (ties by name), each to the least-loaded shard (ties to the lowest). Every shard computes the same
 * deal from the same names, so the shards partition the runs exactly: each run is in one shard.
 * Returns each shard's run indices, heaviest first, so a runner starts its longest runs first.
 */
export const dealRuns = (names: readonly string[], count: number, table: RunSeconds): number[][] => {
  const ordered = names
    .map((name, index) => ({ name, index, weight: weightOf(name, table) }))
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        (left.name < right.name ? -1 : left.name > right.name ? 1 : 0) ||
        left.index - right.index,
    );
  const load = Array.from({ length: count }, () => 0);
  const dealt = Array.from({ length: count }, (): number[] => []);
  for (const { index, weight } of ordered) {
    const lightest = load.indexOf(Math.min(...load));
    load[lightest] = (load[lightest] ?? 0) + weight;
    dealt[lightest]?.push(index);
  }
  return dealt;
};
