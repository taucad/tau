import type { ConsolaInstance } from 'consola';

/**
 * Exit codes shared by every `tau` command.
 *
 * `ok` for a completed request, `error` for an unexpected failure, `usage` for a
 * problem the caller fixes in argv, `refused` for a well-formed request the runtime
 * or host declined, `unknown` for an outcome the CLI could not determine, and
 * `interrupted`/`terminated` for the two signals a run honours.
 *
 * @internal
 */
export const exitCodes = {
  ok: 0,
  error: 1,
  usage: 2,
  refused: 3,
  unknown: 4,
  interrupted: 130,
  terminated: 143,
} as const;

/**
 * A failure whose stable code and exit code are part of the scripted contract.
 *
 * @internal
 */
export type CliError = Error & { readonly code: string; readonly exit: number };

/**
 * Build a scripted failure that carries its own exit code.
 *
 * @internal
 * @param code - Stable machine-readable failure code, such as `INPUT_NOT_FOUND`.
 * @param message - Actionable failure text for a human reader.
 * @param exit - Process exit code from {@link exitCodes}; defaults to `error`.
 * @returns An error that {@link exitCodeFor} maps back to `exit`.
 */
export const cliError = (code: string, message: string, exit: number = exitCodes.error): CliError =>
  Object.assign(new Error(message), { code, exit });

/**
 * Whether the CLI classified this failure itself.
 *
 * A classified failure's message is complete on its own, so it prints as one line;
 * anything else keeps its stack, because an unexpected crash still has to be debuggable.
 *
 * @internal
 * @param error - Any thrown value.
 * @returns `true` for a {@link CliError} or one of citty's argv failures.
 */
export const isClassifiedFailure = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  // Citty raises every argv problem — unknown command, missing positional — as `CLIError`.
  (typeof (error as { readonly exit?: unknown }).exit === 'number' ||
    (error as { readonly name?: unknown }).name === 'CLIError');

/**
 * Resolve the process exit code for a thrown value.
 *
 * @internal
 * @param error - Any thrown value.
 * @returns Its own `exit` when it is a {@link CliError}, `usage` for citty's argv
 * failures, and `error` for anything unmapped.
 */
export const exitCodeFor = (error: unknown): number => {
  if (!isClassifiedFailure(error)) {
    return exitCodes.error;
  }

  const { exit } = error as { readonly exit?: unknown };
  return typeof exit === 'number' ? exit : exitCodes.usage;
};

/*
 * Escape sequences and control bytes let untrusted text move the cursor, repaint the
 * screen, or drive the terminal through OSC. Stripping the introducer neutralizes the
 * sequence; any residue is inert text. Tab and newline are deliberately preserved.
 * The bidirectional formatting characters are stripped for the same reason: they
 * carry no control byte, but they reorder the glyphs around them, so a tool name or
 * a login command can be made to *read* as something it is not (CVE-2021-42574).
 */
const terminalControlPattern =
  // oxlint-disable-next-line no-control-regex -- Matching these exact bytes is the point of this pattern.
  /\u001B[@-_][\d ;?]*[@-~]?|[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/**
 * Strip terminal control sequences from text the CLI did not author.
 *
 * @internal
 * @param text - Display text from a kernel, plugin, host, or agent.
 * @returns The same text with escape and control bytes removed.
 */
export const sanitize = (text: string): string => text.replaceAll(terminalControlPattern, '');

const closedStreams = new WeakSet<NodeJS.WriteStream>();

/*
 * A reader that closes early (`… | head -1`) makes the next write raise EPIPE on a
 * stream with no 'error' listener, which Node reports as an unhandled 'error' event
 * and a stack trace. Own that once, here, for every command.
 */
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') {
      throw error;
    }

    closedStreams.add(stream);
  });
}

/**
 * Write result bytes to stdout and wait for them to reach the sink.
 *
 * Awaiting the flush is what lets a command finish through `process.exitCode` instead
 * of `process.exit()`, which truncates a slow reader.
 *
 * @internal
 * @param chunk - Result bytes or a complete text line.
 * @returns A promise that settles once the chunk is flushed or the reader is gone.
 */
export const writeStdout = async (chunk: string | Uint8Array<ArrayBuffer>): Promise<void> => {
  if (closedStreams.has(process.stdout)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    process.stdout.write(chunk, (error) => {
      if (error && (error as NodeJS.ErrnoException).code !== 'EPIPE') {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

/**
 * Write one versioned machine record to stdout.
 *
 * `--json` writes exactly one record as the terminal result; a streaming `--jsonl`
 * command writes many and ends with a `{ kind: 'outcome' }` record, so a consumer
 * that never sees one knows the stream was truncated. Both are the same record shape,
 * so they share this writer.
 *
 * @internal
 * @param record - Record fields; `v` is added by this writer.
 * @returns A promise that settles once the record is flushed.
 */
export const emit = async (record: Readonly<Record<string, unknown>>): Promise<void> =>
  writeStdout(`${JSON.stringify({ v: 1, ...record })}\n`);

/**
 * Create the diagnostics logger shared by every command.
 *
 * Every level writes to **stderr**, so stdout carries result data only, and colours
 * follow stderr's own interactivity. consola is imported lazily so `tau --help` never
 * pays for it.
 *
 * @internal
 * @returns A consola instance bound to stderr.
 */
export const createOutput = async (): Promise<ConsolaInstance> => {
  const { createConsola } = await import('consola');
  return createConsola({
    stdout: process.stderr,
    // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare -- `isTTY` is `undefined`, not `false`, off a TTY, and consola treats `undefined` as auto-detect
    formatOptions: { colors: process.stderr.isTTY === true },
  });
};
