/*
 * Imported before citty so the shared stdout/EPIPE owner is installed before any
 * command — or citty's own usage renderer — writes a byte.
 */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { emit, exitCodeFor, exitCodes, isClassifiedFailure, sanitize, writeStdout } from '#output.js';
import { defineCommand, renderUsage, runCommand } from 'citty';
import type { ArgsDef, CommandContext, CommandDef, SubCommandsDef } from 'citty';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load the CLI's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../package.json' with { type: 'json' };

/*
 * `meta` is eager while `args` and `run` stay lazy. citty's usage renderer resolves
 * every subcommand to read its `meta`, so registering a subcommand as a thunk imports
 * every command module — and the whole runtime behind it — just to print `tau --help`.
 */
const lazyCommand = (name: string, description: string, load: () => Promise<CommandDef>): CommandDef =>
  defineCommand({
    meta: { name, description },
    args: async () => {
      const command = await load();
      return (command.args ?? {}) as ArgsDef;
    },
    /*
     * Resolved only once a command is actually selected, so a family such as
     * `tau agent` keeps its own subcommands without putting them — or the
     * agent-host client behind them — in the `tau --help` module graph.
     */
    subCommands: async () => {
      const command = await load();
      return (command.subCommands ?? {}) as SubCommandsDef;
    },
    run: async (context: CommandContext) => {
      const command = await load();
      await command.run?.(context);
    },
  });

const subCommands: Record<string, CommandDef> = {
  serve: lazyCommand('serve', 'Run the experimental Tau Host remote-compute daemon', async () => {
    const { serveCommand } = await import('./commands/serve.js');
    return serveCommand as CommandDef;
  }),
  export: lazyCommand('export', 'Export a CAD file to a target format', async () => {
    const { exportCommand } = await import('./commands/export.js');
    return exportCommand as CommandDef;
  }),
  view: lazyCommand('view', 'Render a bounded WebP preview of a CAD file and print its path', async () => {
    const { viewCommand } = await import('./commands/view.js');
    return viewCommand as CommandDef;
  }),
  agent: lazyCommand('agent', 'Drive agent runs on a Tau Host', async () => {
    const { agentCommand } = await import('./commands/agent.js');
    return agentCommand as CommandDef;
  }),
  tui: lazyCommand('tui', 'Watch and drive a chat in an interactive terminal UI', async () => {
    const { tuiCommand } = await import('./commands/tui.js');
    return tuiCommand as CommandDef;
  }),
  host: lazyCommand('host', 'Inspect a Tau Host', async () => {
    const { hostCommand } = await import('./commands/host.js');
    return hostCommand as CommandDef;
  }),
};

const main = defineCommand({
  meta: {
    name: 'tau',
    version: packageJson.version,
    description: 'CLI for @taucad/runtime — render and export CAD files from the terminal',
  },
  subCommands,
});

const rawArgs = process.argv.slice(2);

// Result text stays plain unless a human is watching stdout.
const display = (text: string): string => (process.stdout.isTTY ? text : sanitize(text));

const subCommandsOf = async (command: CommandDef): Promise<SubCommandsDef> =>
  (await (typeof command.subCommands === 'function' ? command.subCommands() : command.subCommands)) ?? {};

/*
 * Which command `--help` describes. Walking the named words means
 * `tau agent tail --help` renders `tail`'s own options rather than its
 * family's, and only the selected branch is ever resolved — every other
 * subcommand contributes its eager `meta` and nothing else.
 */
const usageTarget = async (): Promise<readonly [CommandDef, CommandDef | undefined]> => {
  let command = main;
  let parent: CommandDef | undefined;
  for (const word of rawArgs.filter((argument) => !argument.startsWith('-'))) {
    // oxlint-disable-next-line no-await-in-loop -- each level of the chain is resolved from the previous one.
    const available = await subCommandsOf(command);
    const selected = available[word];
    if (selected === undefined) {
      break;
    }
    parent = command;
    // oxlint-disable-next-line no-await-in-loop -- ditto.
    command = await (typeof selected === 'function' ? selected() : selected);
  }
  return [command, parent];
};

const run = async (): Promise<void> => {
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    const [subCommand, parent] = await usageTarget();
    await writeStdout(`${display(await renderUsage(subCommand, parent))}\n\n`);
    return;
  }

  if (rawArgs.length === 1 && (rawArgs[0] === '--version' || rawArgs[0] === '-v')) {
    await writeStdout(`${packageJson.version}\n`);
    return;
  }

  await runCommand(main, { rawArgs });
};

try {
  await run();
} catch (error) {
  /*
   * Never `process.exit()`: it truncates a slow reader mid-record. Setting the code and
   * returning lets Node flush every pending write first.
   */
  const exit = exitCodeFor(error);
  process.exitCode = exit;

  const message = error instanceof Error ? error.message : String(error);
  const detail = !isClassifiedFailure(error) && error instanceof Error ? (error.stack ?? message) : message;
  const hint = exit === exitCodes.usage ? 'Run `tau --help` for usage.\n' : '';
  process.stderr.write(`${display(detail)}\n${hint}`);

  // A machine-mode stream whose last record is missing is indistinguishable from
  // a truncated one, so a failed `--jsonl` run still ends with its outcome.
  if (rawArgs.includes('--json') || rawArgs.includes('--jsonl')) {
    const { code } = error as { readonly code?: unknown };
    await emit({
      kind: 'outcome',
      ok: false,
      code: typeof code === 'string' ? code : 'CLI_FAILED',
      exit,
      message,
    });
  }
}
