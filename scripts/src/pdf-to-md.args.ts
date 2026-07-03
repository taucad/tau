import { parseArgs as parseNodeArgs } from 'node:util';

/** Command supported by the reference PDF sync CLI. */
export type PdfToMdCommand = 'status' | 'download' | 'convert' | 'sync' | 'validate';

/** Parsed options for the reference PDF sync CLI. */
export type PdfToMdOptions = {
  command: PdfToMdCommand;
  ids: string[];
  group?: string;
  force: boolean;
};

/** Parser result for the reference PDF sync CLI. */
export type ParsedPdfToMdArgs = { kind: 'help' } | { kind: 'run'; options: PdfToMdOptions };

const commands = new Set<PdfToMdCommand>(['status', 'download', 'convert', 'sync', 'validate']);

/** Usage text for the reference PDF sync CLI. */
export const pdfToMdUsage = `Usage:
  pnpm nx run scripts:pdf-to-md
  pnpm nx run scripts:pdf-to-md -- status
  pnpm nx run scripts:pdf-to-md -- download [id] [--group name] [--force]
  pnpm nx run scripts:pdf-to-md -- convert [id] [--group name] [--force]
  pnpm nx run scripts:pdf-to-md -- sync [id] [--group name] [--force]
  pnpm nx run scripts:pdf-to-md -- validate [id] [--group name]

Default command is "sync" for every reference in docs/reference/_index.yaml.`;

const isCommand = (value: string | undefined): value is PdfToMdCommand =>
  value !== undefined && commands.has(value as PdfToMdCommand);

const parseGroup = (group: unknown): string | undefined => {
  if (group === undefined) {
    return undefined;
  }
  if (typeof group !== 'string' || group.trim() === '') {
    throw new Error('--group requires a group name');
  }

  return group;
};

/** Parse reference PDF sync CLI arguments without performing CLI side effects. */
export const parsePdfToMdArgs = (argv: readonly string[]): ParsedPdfToMdArgs => {
  const parsed = parseNodeArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      help: {
        type: 'boolean',
        short: 'h',
      },
      force: {
        type: 'boolean',
      },
      group: {
        type: 'string',
        short: 'g',
      },
    },
  });

  if (parsed.values.help === true) {
    return { kind: 'help' };
  }

  const [firstPosition, ...remainingPositionals] = parsed.positionals;
  const command = isCommand(firstPosition) ? firstPosition : 'sync';
  const ids = isCommand(firstPosition) ? remainingPositionals : [...parsed.positionals];
  const group = parseGroup(parsed.values.group);

  if (group !== undefined && ids.length > 0) {
    throw new Error('use either explicit reference ids or --group, not both');
  }

  return {
    kind: 'run',
    options: {
      command,
      ids,
      group,
      force: parsed.values.force === true,
    },
  };
};
