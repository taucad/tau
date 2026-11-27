import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Mutant } from '#mutants.js';
import { workspaceRoot } from '#toolchain.js';

/** One of `count` runners: `index` is 1-based, as `--shard 2/3` writes it. */
export type MutantShard = { readonly index: number; readonly count: number };

/** `k/N` with 1 ≤ k ≤ N; anything else is `undefined`. */
export const parseMutantShard = (text: string): MutantShard | undefined => {
  const match = /^(\d+)\/(\d+)$/.exec(text);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  return match && count >= 1 && index >= 1 && index <= count ? { index, count } : undefined;
};

/**
 * Measured seconds of each mutant, by its `mutants.json` (relative to the workspace root) and id, and
 * the weight of a mutant the table does not list.
 */
export type MutantSeconds = {
  readonly defaultSeconds: number;
  readonly mutants: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

export const mutantSecondsPath = path.join(workspaceRoot, 'tools/formal/mutant-seconds.json');

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads and validates the measured mutant seconds; a missing or non-positive weight throws. */
export const readMutantSeconds = (file = mutantSecondsPath): MutantSeconds => {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    readonly defaultSeconds?: unknown;
    readonly mutants?: unknown;
  };
  const { defaultSeconds, mutants } = raw;
  if (!isPositive(defaultSeconds) || !isRecord(mutants)) {
    throw new Error(`${file}: needs a positive defaultSeconds and a mutants object`);
  }
  for (const [owner, seconds] of Object.entries(mutants)) {
    if (!isRecord(seconds)) {
      throw new Error(`${file}: ${owner} needs an object of seconds by mutant id`);
    }
    for (const [id, value] of Object.entries(seconds)) {
      if (!isPositive(value)) {
        throw new Error(`${file}: ${owner} ${id} has a non-positive weight`);
      }
    }
  }
  return { defaultSeconds, mutants: mutants as MutantSeconds['mutants'] };
};

/** A mutant's place: its `mutants.json` relative to the workspace root, and its index there. */
export const mutantKey = (file: string, index: number): string => `${file}#${String(index)}`;

/** The mutants of one `mutants.json`, by its path relative to the workspace root. */
export type MutantFile = { readonly file: string; readonly mutants: readonly Mutant[] };

/**
 * Deals mutants to `count` shards by measured seconds. A machine mutant's verdict also depends on its
 * control run (the unmutated test through the same alias, keyed by file and test as the runner keys it),
 * so a control and every mutant that shares it form one unit, and the control runs once, in that unit's
 * shard; its weight counts once more, as the longest of its mutants. A Lean mutant is a unit of its own.
 * Greedy longest-processing-time: heaviest unit first (ties by plan order), each to the least-loaded
 * shard (ties to the lowest). Every shard computes the same deal from the same files, so the shards
 * partition the mutants: each is in exactly one. Returns each shard's mutant keys (`mutantKey`).
 */
export const dealMutants = (files: readonly MutantFile[], count: number, table: MutantSeconds): string[][] => {
  const units = new Map<string, { order: number; keys: string[]; seconds: number[]; machine: boolean }>();
  for (const { file, mutants } of files) {
    for (const [index, mutant] of mutants.entries()) {
      const key = mutantKey(file, index);
      const group = mutant.test === undefined ? key : `${file}|${mutant.file}|${mutant.test}`;
      const unit = units.get(group) ?? { order: units.size, keys: [], seconds: [], machine: mutant.test !== undefined };
      unit.keys.push(key);
      unit.seconds.push(table.mutants[file]?.[mutant.id] ?? table.defaultSeconds);
      units.set(group, unit);
    }
  }
  const weighed = [...units.values()]
    .map((unit) => ({
      ...unit,
      weight: unit.seconds.reduce((sum, value) => sum + value, 0) + (unit.machine ? Math.max(...unit.seconds) : 0),
    }))
    .sort((left, right) => right.weight - left.weight || left.order - right.order);
  const load = Array.from({ length: count }, () => 0);
  const dealt = Array.from({ length: count }, (): string[] => []);
  for (const unit of weighed) {
    const lightest = load.indexOf(Math.min(...load));
    load[lightest] = (load[lightest] ?? 0) + unit.weight;
    dealt[lightest]?.push(...unit.keys);
  }
  return dealt;
};
