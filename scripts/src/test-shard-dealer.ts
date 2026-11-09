/**
 * Deal the affected projects with a `test` target across the CI test shards by measured duration.
 *
 * Each `test-<n>` lane of `ci.yml` pipes the same affected project list (a JSON array from
 * `nx show projects --affected --with-target test`) into this script and runs only the projects it prints for its
 * own shard. The deal is greedy longest-processing-time: projects sorted by weight, heaviest first, ties by name,
 * each to the shard with the least load so far, ties to the lowest shard. Every lane computes the same deal, so the
 * shards partition the selected set exactly. Weights are the uncached `test` seconds in the checked-in
 * `test-shard-durations.json` snapshot; a project the snapshot does not list weighs its `defaultSeconds`.
 * This replaced the test-file-count weights, which had turned the shards into a fixed routing table
 * (tau-brain `research/ci-decomposition-blueprint.md` F2 and Part 4; charter W2).
 *
 * Usage: node scripts/src/test-shard-dealer.ts --shard <n> [--shards <count>] [--durations <file>] < projects.json
 * Prints the shard's projects comma-separated (empty when it has none).
 * Exit codes: 0 success; 1 invalid input or duration snapshot; 2 usage.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The checked-in duration snapshot. */
export type DurationTable = {
  readonly defaultSeconds: number;
  readonly seconds: Readonly<Record<string, number>>;
};

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Validate a parsed duration snapshot; throws on a missing or non-positive weight. */
export const parseDurations = (raw: unknown): DurationTable => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('duration snapshot is not an object');
  }
  const { defaultSeconds, seconds } = raw as Record<string, unknown>;
  if (!isPositive(defaultSeconds)) {
    throw new Error('duration snapshot needs a positive defaultSeconds');
  }
  if (typeof seconds !== 'object' || seconds === null || Array.isArray(seconds)) {
    throw new Error('duration snapshot needs a seconds object');
  }
  for (const [project, value] of Object.entries(seconds)) {
    if (!isPositive(value)) {
      throw new Error(`duration snapshot has a non-positive weight for ${project}`);
    }
  }
  return { defaultSeconds, seconds: seconds as Record<string, number> };
};

/** Validate the affected project list: a JSON array of distinct non-empty names. */
export const parseProjects = (raw: unknown): readonly string[] => {
  if (!Array.isArray(raw) || raw.some((project) => typeof project !== 'string' || project === '')) {
    throw new Error('project list is not a JSON array of project names');
  }
  const projects = raw as string[];
  if (new Set(projects).size !== projects.length) {
    throw new Error('project list has duplicates');
  }
  return projects;
};

/** The weight of one project: its measured seconds, or the snapshot default. */
export const weightOf = (project: string, durations: DurationTable): number =>
  Object.hasOwn(durations.seconds, project) ? durations.seconds[project]! : durations.defaultSeconds;

/** Deal projects into `shards` lists with greedy longest-processing-time; deterministic for any input order. */
export const deal = (projects: readonly string[], shards: number, durations: DurationTable): string[][] => {
  const ordered = projects
    .map((project) => ({ project, weight: weightOf(project, durations) }))
    .sort((a, b) => b.weight - a.weight || (a.project < b.project ? -1 : a.project > b.project ? 1 : 0));
  const load = Array.from({ length: shards }, () => 0);
  const dealt = Array.from({ length: shards }, (): string[] => []);
  for (const { project, weight } of ordered) {
    let best = 0;
    for (let shard = 1; shard < shards; shard++) {
      if (load[shard]! < load[best]!) {
        best = shard;
      }
    }
    load[best]! += weight;
    dealt[best]?.push(project);
  }
  return dealt;
};

const defaultDurations = resolve(import.meta.dirname, 'test-shard-durations.json');

const positiveInteger = (value: string | undefined): number | undefined =>
  value !== undefined && /^[1-9]\d*$/u.test(value) ? Number(value) : undefined;

/** Run the CLI; returns the exit code and the line to print. */
export const run = (
  args: readonly string[],
  input: string,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): { readonly code: number; readonly output: string } => {
  const options = new Map<string, string | undefined>();
  for (let index = 0; index < args.length; index += 2) {
    options.set(args[index] ?? '', args[index + 1]);
  }
  const shard = positiveInteger(options.get('--shard'));
  const shards = options.has('--shards') ? positiveInteger(options.get('--shards')) : 3;
  const known = [...options].every(
    ([key, value]) => ['--shard', '--shards', '--durations'].includes(key) && value !== undefined && value !== '',
  );
  if (!known || shard === undefined || shards === undefined || shard > shards) {
    return {
      code: 2,
      output: 'usage: test-shard-dealer --shard <n> [--shards <count>] [--durations <file>] < projects.json',
    };
  }
  try {
    const durations = parseDurations(JSON.parse(readFile(options.get('--durations') ?? defaultDurations)));
    const projects = parseProjects(JSON.parse(input));
    return {
      code: 0,
      output: (deal(projects, shards, durations)[shard - 1] ?? []).join(','),
    };
  } catch (error) {
    return {
      code: 1,
      output: `test-shard-dealer: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, output } = run(process.argv.slice(2), readFileSync(0, 'utf8'));
  (code === 0 ? process.stdout : process.stderr).write(`${output}\n`);
  process.exitCode = code;
}
