/**
 * Diagnostics sink (work item E8, batch V).
 *
 * Eleven of the fourteen Electron footguns this program has already hit
 * presented as *silence* — a blank window, a utility that never answered, a
 * renderer that died without a stack. This log is therefore the primary
 * debugging instrument, not polish: everything main can observe about the
 * renderer and the utilities lands in one rotating file under `userData/logs`
 * and, in development, on the console.
 */

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { prettyFactory } from 'pino-pretty';

import type { RegisterElectronRuntimeMainOptions } from '@taucad/runtime/electron/main';

/** One line's severity. Nothing here is user-facing; it is all operator text. */
export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

/** The sink main hands to every forwarder. @see createDiagnosticsLog */
export type DiagnosticsLog = {
  /** Absolute path of the current log file. */
  readonly filePath: string;
  /** Append one record. Never throws — a failing log must not take the app down. */
  log(level: DiagnosticLevel, event: string, detail?: unknown): void;
};

/** Options for {@link createDiagnosticsLog}. */
export type DiagnosticsLogOptions = {
  /** Directory that receives `desktop.log` (created when absent). */
  readonly directory: string;
  /** Rotate once the file passes this size. Defaults to 5 MiB. */
  readonly maxBytes?: number;
  /** Mirror every record to the console. Defaults to true in development. */
  readonly echo?: boolean;
  /** Process label prepended to console output. Defaults to `desktop`. */
  readonly producer?: string;
};

const defaultMaxBytes = 5 * 1024 * 1024;
const prettyConsoleLine = prettyFactory({
  colorize: true,
  ignore: 'pid,hostname,req,res,responseTime,context,data,trace_id,span_id,trace_flags',
  messageFormat: '\u001B[1m{if context}\u001B[33m[{context}] {end}\u001B[0m{if msg}{msg}{end}{if data}\n{data}{end}',
  singleLine: false,
});

/* Detail is arbitrary — an Error, an exit code, a Chromium console payload.
 * Errors stringify to `{}` under `JSON.stringify`, which is exactly the silence
 * this file exists to remove, so they are unwrapped explicitly. */
const describe = (detail: unknown): string => {
  if (detail === undefined) {
    return '';
  }
  if (detail instanceof Error) {
    return ` ${detail.stack ?? `${detail.name}: ${detail.message}`}`;
  }
  try {
    return ` ${JSON.stringify(detail)}`;
  } catch {
    return ' [detail is not serialisable]';
  }
};

const describeConsole = (detail: unknown): string | undefined => {
  if (detail === undefined) {
    return undefined;
  }
  if (detail instanceof Error) {
    return detail.stack ?? `${detail.name}: ${detail.message}`;
  }
  if (typeof detail === 'string') {
    return detail;
  }
  if (typeof detail === 'object' && detail !== null) {
    try {
      const { message } = detail as { readonly message?: unknown };
      if (typeof message === 'string') {
        return message;
      }
    } catch {
      /* Fall through to the safe representation below. */
    }
  }
  return describe(detail).slice(1);
};

const abbreviateHashes = (message: string | undefined): string | undefined =>
  message?.replaceAll(/\b[\da-f]{24,}\b/giu, (hash) => `${hash.slice(0, 8)}…`);

/**
 * Open the rotating main-process diagnostics log.
 *
 * @param options - Log directory, rotation threshold, and console echo.
 * @returns A sink that never throws.
 */
export const createDiagnosticsLog = (options: DiagnosticsLogOptions): DiagnosticsLog => {
  const maxBytes = options.maxBytes ?? defaultMaxBytes;
  const filePath = join(options.directory, 'desktop.log');
  const previousPath = join(options.directory, 'desktop.1.log');
  const echo = options.echo ?? true;
  const producer = options.producer ?? 'desktop';
  const echoDebug = /^(1|true)$/iu.test(process.env['TAU_DEBUG'] ?? '');
  let previousConsoleRecord: { readonly key: string; readonly level: DiagnosticLevel; repeats: number } | undefined;
  mkdirSync(options.directory, { recursive: true });

  const rotate = (): void => {
    try {
      if (statSync(filePath).size > maxBytes) {
        renameSync(filePath, previousPath);
      }
    } catch {
      /* No file yet, or a racing writer — either way the next append creates one. */
    }
  };

  const writeConsole = ([level, context, message, time]: readonly [
    DiagnosticLevel,
    string | undefined,
    string | undefined,
    number,
  ]): void => {
    // oxlint-disable-next-line no-console -- this is the diagnostic seam itself
    console[level === 'info' ? 'log' : level](
      `[${producer}] ${prettyConsoleLine({ context, level, msg: abbreviateHashes(message), time }).trimEnd()}`,
    );
  };

  const echoConsole = ([level, event, detail, time]: readonly [DiagnosticLevel, string, unknown, number]): void => {
    const message = describeConsole(detail);
    const key = JSON.stringify([level, event, message]);
    if (previousConsoleRecord?.key === key) {
      previousConsoleRecord.repeats += 1;
      return;
    }
    if (previousConsoleRecord && previousConsoleRecord.repeats > 0) {
      writeConsole([previousConsoleRecord.level, undefined, `↳ repeated ×${previousConsoleRecord.repeats}`, time]);
    }
    const producerPrefix = `${producer}.`;
    const context =
      event === 'renderer.console'
        ? undefined
        : event.startsWith(producerPrefix)
          ? event.slice(producerPrefix.length)
          : event;
    writeConsole([level, context, message, time]);
    previousConsoleRecord = { key, level, repeats: 0 };
  };

  return {
    filePath,
    log(level, event, detail) {
      const time = Date.now();
      const line = `${new Date(time).toISOString()} ${level.toUpperCase()} ${event}${describe(detail)}\n`;
      if (echo && (level !== 'debug' || echoDebug)) {
        echoConsole([level, event, detail, time]);
      }
      try {
        rotate();
        // Synchronous on purpose: main writes a handful of lines per session and a crash
        // ponytail: must not lose the last one. Move to a queued stream if a chatty forwarder lands.
        appendFileSync(filePath, line);
      } catch {
        /* A log that cannot be written must not take the app down. */
      }
    },
  };
};

const normalizeRendererLevel = (level: unknown): DiagnosticLevel => {
  switch (level) {
    case 'debug': {
      return 'debug';
    }
    case 'warning': {
      return 'warn';
    }
    case 'error': {
      return 'error';
    }
    default: {
      return 'info';
    }
  }
};

/**
 * The subset of `WebContents` this module forwards from.
 *
 * Listeners are variadic because Electron's three signals disagree on arity
 * and none of their payloads is worth re-declaring here — the log takes them
 * as-is, and the forwarder's test pins the shape.
 */
type ObservableEmitter = {
  on(event: string, listener: (...args: readonly unknown[]) => void): unknown;
};

/**
 * Forward every renderer failure signal into the log.
 *
 * @param webContents - The window's web contents.
 * @param log - Diagnostics sink.
 * @param recover - Optional recovery to run after an unexpected renderer exit.
 * @returns Nothing.
 */
export const forwardRendererDiagnostics = (
  webContents: ObservableEmitter,
  log: DiagnosticsLog,
  recover?: () => void,
): void => {
  webContents.on('did-fail-load', (...details) => {
    const [, errorCode, errorDescription, url] = details;
    log.log('error', 'renderer.did-fail-load', { errorCode, errorDescription, url });
  });
  webContents.on('render-process-gone', (_event, details) => {
    log.log('error', 'renderer.render-process-gone', details);
    const reason = typeof details === 'object' && details !== null && 'reason' in details ? details.reason : undefined;
    if (reason !== 'clean-exit') {
      recover?.();
    }
  });
  webContents.on('console-message', (details) => {
    const { level, message, sourceId, lineNumber } = (details ?? {}) as Record<string, unknown>;
    log.log(normalizeRendererLevel(level), 'renderer.console', {
      message,
      source: sourceId,
      line: lineNumber,
    });
  });
};

/**
 * Forward one utility process's exit into the log.
 *
 * Only `exit` is forwarded: the services utility is forked without `stdio`, so
 * Electron's `'inherit'` applies and its stdout and stderr are already main's
 * own — there is no separate stream to read. Kernel utilities are piped and
 * supervised instead; see {@link kernelUtilityDiagnostics}.
 *
 * @param name - Utility label used in the log records.
 * @param utility - The forked utility process.
 * @param log - Diagnostics sink.
 * @returns Nothing.
 */
export const forwardUtilityDiagnostics = (name: string, utility: ObservableEmitter, log: DiagnosticsLog): void => {
  utility.on('exit', (code) => {
    log.log(code === 0 ? 'info' : 'error', 'utility.exit', { name, code });
  });
};

/**
 * Broker hooks that record every kernel utility's life in the same log.
 *
 * A kernel utility is forked inside `registerElectronRuntimeMain`, so main
 * never holds the process object and {@link forwardUtilityDiagnostics} cannot
 * reach it; the broker's observers are the seam instead. A death main itself
 * ordered is expected, so `released` reads as `info` at any exit code.
 *
 * @param log - Diagnostics sink.
 * @returns The observer options to spread into `registerElectronRuntimeMain`.
 */
export const kernelUtilityDiagnostics = (
  log: DiagnosticsLog,
): Pick<RegisterElectronRuntimeMainOptions, 'onUtilityExit' | 'onUtilityFork' | 'onUtilityStderr'> => ({
  onUtilityFork: ({ hostId, entry }) => {
    log.log('info', 'kernel.fork', { hostId, entry });
  },
  onUtilityStderr: ({ hostId, chunk }) => {
    log.log('warn', 'kernel.stderr', { hostId, chunk: chunk.trimEnd() });
  },
  onUtilityExit: ({ hostId, exitCode, released, stderrTail }) => {
    log.log(exitCode === 0 || released ? 'info' : 'error', 'kernel.exit', {
      hostId,
      code: exitCode,
      released,
      stderrTail,
    });
  },
});
