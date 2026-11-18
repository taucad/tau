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
 * A project that declares `test:shard-<n>` targets enters the `test-<n>` lanes' list as its `<project>:test:shard-<n>`
 * tasks in place of its name (`ui`: six tasks of its Vitest suite, CI throughput review ST-1), and the snapshot weighs
 * each task on its own, so one slow suite no longer sets a lane's floor.
 *
 * The names are opaque, so other sharded lanes deal with it too, each from its own snapshot through `--durations`:
 * the `pkgcheck-<n>` lanes deal the affected projects with a package check by measured `pkgcheck` seconds
 * (`pkgcheck-shard-durations.json`), and the `Viewer references` shards of `viewer-parity.yml` deal the parity
 * fixtures by measured capture seconds (`libs/tau-examples/fixtures/viewer-parity/capture-seconds.json`).
 *
 * `--graph <file> --targets <list>` deals projects whose tasks share dependencies (the `lint-<n>`, `typecheck-<n>`
 * and `build-<n>` lanes, tau-brain `research/ci-structural-decomposition-blueprint.md` ST-3). A project's unit is its
 * tasks for those targets in the Nx task graph (`nx … --graph=<file>`) and every task they depend on; the snapshot is
 * keyed by task id (`project:target`), and an unlisted task weighs `defaultSeconds` when it is one of the project's
 * own and nothing when it is only a dependency. Each unit goes to the shard whose load grows least, counting only
 * the tasks that shard does not run already, so `ui` and the `desktop` build its payload check depends on land
 * together. With disjoint units this is the plain deal.
 *
 * `--shards auto --max-shards <n> --shard-seconds <s>` lets the measured total choose the shard count: one shard per
 * `<s>` seconds, at least one and at most `<n>`. `--shard all` prints every non-empty shard as a JSON matrix,
 * `[{"shard":1,"shards":2,"projects":"a,b"},…]`, for a workflow job to fan out on (`[]` when nothing is selected).
 *
 * Usage: node scripts/src/test-shard-dealer.ts --shard <n|all> [--shards <count|auto>] [--max-shards <n>]
 *   [--shard-seconds <s>] [--durations <file>] [--graph <file> --targets <list>] < projects.json
 * Prints the shard's units comma-separated (empty when it has none), or the matrix for `--shard all`.
 * Exit codes: 0 success; 1 invalid input, graph or duration snapshot; 2 usage.
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

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Deal projects into `shards` lists with greedy longest-processing-time; deterministic for any input order. */
export const deal = (projects: readonly string[], shards: number, durations: DurationTable): string[][] => {
  const ordered = projects
    .map((project) => ({ project, weight: weightOf(project, durations) }))
    .sort((a, b) => b.weight - a.weight || byName(a.project, b.project));
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

/** A deal unit: its name, and every task it runs (its own and those they depend on). */
export type Unit = { readonly name: string; readonly tasks: readonly string[] };

/**
 * Deal units whose task sets may overlap: heaviest unit first (by the seconds of all its tasks), ties by name. A
 * shard's load is the seconds of every task it runs, and a unit adds only the tasks its shard does not run yet. Each
 * unit goes to the shard that leaves the longest load shortest, then adds the fewest seconds, then has the least
 * load, then is lowest. Deterministic for any input order; with disjoint units it deals as `deal` does.
 */
export const dealUnits = (
  units: readonly Unit[],
  shards: number,
  taskSeconds: (task: string) => number,
): { readonly dealt: string[][]; readonly loads: number[] } => {
  const secondsOf = (tasks: Iterable<string>): number => {
    let sum = 0;
    for (const task of tasks) {
      sum += taskSeconds(task);
    }
    return sum;
  };
  const ordered = units
    .map(({ name, tasks }) => {
      const distinct = [...new Set(tasks)];
      return { name, tasks: distinct, weight: secondsOf(distinct) };
    })
    .sort((a, b) => b.weight - a.weight || byName(a.name, b.name));
  const loads = Array.from({ length: shards }, () => 0);
  const runs = Array.from({ length: shards }, () => new Set<string>());
  const dealt = Array.from({ length: shards }, (): string[] => []);
  for (const unit of ordered) {
    const longest = Math.max(...loads);
    let best = {
      shard: 0,
      longest: Number.POSITIVE_INFINITY,
      added: 0,
      load: 0,
    };
    for (let shard = 0; shard < shards; shard++) {
      const added = secondsOf(unit.tasks.filter((task) => !runs[shard]!.has(task)));
      const load = loads[shard]! + added;
      const candidate = {
        shard,
        longest: Math.max(longest, load),
        added,
        load,
      };
      if (
        candidate.longest < best.longest ||
        (candidate.longest === best.longest &&
          (candidate.added < best.added || (candidate.added === best.added && candidate.load < best.load)))
      ) {
        best = candidate;
      }
    }
    loads[best.shard] = best.load;
    for (const task of unit.tasks) {
      runs[best.shard]!.add(task);
    }
    dealt[best.shard]!.push(unit.name);
  }
  return { dealt, loads };
};

/** One shard per `shardSeconds` of measured work, at least one and at most `maxShards`. */
export const shardCount = (totalSeconds: number, maxShards: number, shardSeconds: number): number =>
  Math.min(maxShards, Math.max(1, Math.ceil(totalSeconds / shardSeconds)));

/** The parts of an Nx task graph file (`nx … --graph=<file>`) the graph deal reads. */
type TaskGraphFile = {
  readonly tasks: {
    readonly tasks: Readonly<
      Record<
        string,
        {
          readonly target: {
            readonly project: string;
            readonly target: string;
          };
        }
      >
    >;
    readonly dependencies: Readonly<Record<string, readonly string[]>>;
  };
};

/** Each project's unit: its tasks for `targets` and every task those depend on; throws on a malformed graph. */
export const unitsFromGraph = (raw: unknown, projects: readonly string[], targets: readonly string[]): Unit[] => {
  const graph = (typeof raw === 'object' && raw !== null ? raw : {}) as {
    readonly tasks?: Partial<TaskGraphFile['tasks']>;
  };
  const tasks = graph.tasks?.tasks;
  const dependencies = graph.tasks?.dependencies;
  if (tasks === undefined || dependencies === undefined) {
    throw new Error('graph file has no task graph');
  }
  const own = new Map<string, string[]>();
  for (const [id, task] of Object.entries(tasks)) {
    if (targets.includes(task.target.target)) {
      own.set(task.target.project, [...(own.get(task.target.project) ?? []), id]);
    }
  }
  return projects.map((project) => {
    const roots = own.get(project);
    if (roots === undefined) {
      throw new Error(`graph file has no ${targets.join(', ')} task for ${project}`);
    }
    const seen = new Set<string>(roots);
    const pending = [...roots];
    for (let task = pending.pop(); task !== undefined; task = pending.pop()) {
      for (const dependency of dependencies[task] ?? []) {
        if (!seen.has(dependency)) {
          seen.add(dependency);
          pending.push(dependency);
        }
      }
    }
    return { name: project, tasks: [...seen].toSorted() };
  });
};

const defaultDurations = resolve(import.meta.dirname, 'test-shard-durations.json');

const positiveInteger = (value: string | undefined): number | undefined =>
  value !== undefined && /^[1-9]\d*$/u.test(value) ? Number(value) : undefined;

const optionNames = new Set([
  '--shard',
  '--shards',
  '--max-shards',
  '--shard-seconds',
  '--durations',
  '--graph',
  '--targets',
]);

const usage =
  'usage: test-shard-dealer --shard <n|all> [--shards <count|auto>] [--max-shards <n>] [--shard-seconds <s>] ' +
  '[--durations <file>] [--graph <file> --targets <list>] < projects.json';

/** The parsed command line, or undefined when it is not a valid one. */
type Options = {
  readonly shard: number | 'all';
  readonly shards: number | { readonly max: number; readonly seconds: number };
  readonly durations: string | undefined;
  readonly graph: { readonly file: string; readonly targets: readonly string[] } | undefined;
};

const parseOptions = (args: readonly string[]): Options | undefined => {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const [key, value] = [args[index] ?? '', args[index + 1]];
    if (!optionNames.has(key) || value === undefined || value === '' || options.has(key)) {
      return undefined;
    }
    options.set(key, value);
  }
  const shard = options.get('--shard') === 'all' ? 'all' : positiveInteger(options.get('--shard'));
  const auto = options.get('--shards') === 'auto';
  const max = positiveInteger(options.get('--max-shards'));
  const seconds = positiveInteger(options.get('--shard-seconds'));
  const fixed = options.has('--shards') ? positiveInteger(options.get('--shards')) : 3;
  const shards = auto ? (max === undefined || seconds === undefined ? undefined : { max, seconds }) : fixed;
  const targets = options.get('--targets')?.split(',');
  const file = options.get('--graph');
  if (
    shard === undefined ||
    shards === undefined ||
    (!auto && (options.has('--max-shards') || options.has('--shard-seconds'))) ||
    (shard !== 'all' && shard > (typeof shards === 'number' ? shards : shards.max)) ||
    (file === undefined) !== (targets === undefined) ||
    targets?.includes('')
  ) {
    return undefined;
  }
  return {
    shard,
    shards,
    durations: options.get('--durations'),
    graph: file === undefined ? undefined : { file, targets: targets! },
  };
};

/** Run the CLI; returns the exit code and the line to print. */
export const run = (
  args: readonly string[],
  input: string,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): { readonly code: number; readonly output: string } => {
  const options = parseOptions(args);
  if (options === undefined) {
    return { code: 2, output: usage };
  }
  try {
    const durations = parseDurations(JSON.parse(readFile(options.durations ?? defaultDurations)));
    const projects = parseProjects(JSON.parse(input));
    const { graph } = options;
    const units =
      graph === undefined
        ? projects.map((project) => ({ name: project, tasks: [project] }))
        : unitsFromGraph(JSON.parse(readFile(graph.file)), projects, graph.targets);
    const own = new Set(
      graph === undefined
        ? projects
        : projects.flatMap((project) => graph.targets.map((target) => `${project}:${target}`)),
    );
    const taskSeconds = (task: string): number =>
      Object.hasOwn(durations.seconds, task) ? durations.seconds[task]! : own.has(task) ? durations.defaultSeconds : 0;
    let shards: number;
    if (typeof options.shards === 'number') {
      shards = options.shards;
    } else {
      let total = 0;
      for (const task of new Set(units.flatMap(({ tasks }) => tasks))) {
        total += taskSeconds(task);
      }
      shards = shardCount(total, options.shards.max, options.shards.seconds);
    }
    const { dealt } = dealUnits(units, shards, taskSeconds);
    if (options.shard === 'all') {
      const matrix = dealt.flatMap((names, index) =>
        names.length === 0 ? [] : [{ shard: index + 1, shards, projects: names.join(',') }],
      );
      return { code: 0, output: JSON.stringify(matrix) };
    }
    return { code: 0, output: (dealt[options.shard - 1] ?? []).join(',') };
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
