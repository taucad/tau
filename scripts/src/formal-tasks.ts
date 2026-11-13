/**
 * Select the formal tasks the `Formal models (<n>/3)` shards of ci.yml deal, from an Nx task graph.
 *
 * The formal lane writes `nx affected -t formal:tla formal:lean --graph=<file>`, whose task graph holds every
 * selected task and the tasks it depends on. A project whose TLA+ specs sit in families below `specs/` has one
 * `formal:tla:<family>` task per family and a `formal:tla` that is an `nx:noop` depending on them
 * (tools/formal.plugin.ts). This script keeps every `formal:lean`, `formal:tla` and `formal:tla:<family>` task and
 * drops a `formal:tla` whose project graph node says it is an `nx:noop`, so the families are dealt to parallel
 * runners and the noop is never dealt (formal verification policy § 6).
 *
 * Usage: node scripts/src/formal-tasks.ts <graph.json>
 * Prints a sorted JSON array of `<project>:<target>` ids, the input of scripts/src/test-shard-dealer.ts.
 * Exit codes: 0 success; 1 unreadable graph; 2 usage.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The part of an Nx `--graph` file this script reads. */
export type TaskGraphFile = {
  readonly graph?: {
    readonly nodes?: Readonly<
      Record<
        string,
        { readonly data?: { readonly targets?: Readonly<Record<string, { readonly executor?: string }>> } }
      >
    >;
  };
  readonly tasks?: {
    readonly tasks?: Readonly<
      Record<string, { readonly target?: { readonly project?: string; readonly target?: string } }>
    >;
  };
};

const isFormalTarget = (target: string): boolean =>
  target === 'formal:lean' || target === 'formal:tla' || target.startsWith('formal:tla:');

/** The formal task ids to deal, sorted and unique. */
export const formalTasks = (graph: TaskGraphFile): string[] => {
  const tasks = new Set<string>();
  for (const { target } of Object.values(graph.tasks?.tasks ?? {})) {
    if (target?.project !== undefined && target.target !== undefined && isFormalTarget(target.target)) {
      tasks.add(`${target.project}:${target.target}`);
    }
  }
  // Only the plugin's noop is left out; a `formal:tla` that runs a check is dealt beside any family task.
  const isNoop = (task: string): boolean =>
    task.endsWith(':formal:tla') &&
    graph.graph?.nodes?.[task.slice(0, -':formal:tla'.length)]?.data?.targets?.['formal:tla']?.executor === 'nx:noop';
  return [...tasks].filter((task) => !isNoop(task)).toSorted();
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file, ...rest] = process.argv.slice(2);
  if (file === undefined || rest.length > 0) {
    process.stderr.write('usage: formal-tasks <graph.json>\n');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(`${JSON.stringify(formalTasks(JSON.parse(readFileSync(file, 'utf8')) as TaskGraphFile))}\n`);
    } catch (error) {
      process.stderr.write(`formal-tasks: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
