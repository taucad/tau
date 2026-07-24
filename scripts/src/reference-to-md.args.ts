import { parseArgs as parseNodeArgs } from 'node:util';

export type ReferenceCommand = 'status' | 'download' | 'convert' | 'sync' | 'validate';

export type ReferenceCliOptions = {
  command: ReferenceCommand;
  ids: string[];
  group?: string;
  force: boolean;
};

export type ParsedReferenceArgs = { kind: 'help' } | { kind: 'run'; options: ReferenceCliOptions };

const commands = new Set<ReferenceCommand>(['status', 'download', 'convert', 'sync', 'validate']);

const isCommand = (value: string | undefined): value is ReferenceCommand =>
  value !== undefined && commands.has(value as ReferenceCommand);

export const referenceUsage = (target: string): string => `Usage:
  pnpm nx run scripts:${target}
  pnpm nx run scripts:${target} -- status
  pnpm nx run scripts:${target} -- download [id] [--group name] [--force]
  pnpm nx run scripts:${target} -- convert [id] [--group name] [--force]
  pnpm nx run scripts:${target} -- sync [id] [--group name] [--force]
  pnpm nx run scripts:${target} -- validate [id] [--group name]

Default command is "sync" for every matching reference in docs/reference/_index.yaml.`;

export const parseReferenceArgs = (argv: readonly string[]): ParsedReferenceArgs => {
  const parsed = parseNodeArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      force: { type: 'boolean' },
      group: { type: 'string', short: 'g' },
    },
  });

  if (parsed.values.help === true) {
    return { kind: 'help' };
  }

  const [firstPosition, ...remainingPositionals] = parsed.positionals;
  const command = isCommand(firstPosition) ? firstPosition : 'sync';
  const ids = isCommand(firstPosition) ? remainingPositionals : [...parsed.positionals];
  const { group } = parsed.values;

  if (group?.trim() === '') {
    throw new Error('--group requires a group name');
  }
  if (group !== undefined && ids.length > 0) {
    throw new Error('use either explicit reference ids or --group, not both');
  }

  return {
    kind: 'run',
    options: { command, ids, group, force: parsed.values.force === true },
  };
};
