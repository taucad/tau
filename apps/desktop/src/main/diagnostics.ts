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

/** One line's severity. Nothing here is user-facing; it is all operator text. */
export type DiagnosticLevel = 'info' | 'warn' | 'error';

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
};

const defaultMaxBytes = 5 * 1024 * 1024;

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

  return {
    filePath,
    log(level, event, detail) {
      const line = `${new Date().toISOString()} ${level.toUpperCase()} ${event}${describe(detail)}\n`;
      if (echo) {
        // oxlint-disable-next-line no-console -- this is the diagnostic seam itself
        console[level === 'info' ? 'log' : level](`[tau-desktop] ${line.trimEnd()}`);
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
 * @returns Nothing.
 */
export const forwardRendererDiagnostics = (webContents: ObservableEmitter, log: DiagnosticsLog): void => {
  webContents.on('did-fail-load', (...details) => {
    const [, errorCode, errorDescription, url] = details;
    log.log('error', 'renderer.did-fail-load', { errorCode, errorDescription, url });
  });
  webContents.on('render-process-gone', (_event, details) => {
    log.log('error', 'renderer.render-process-gone', details);
  });
  webContents.on('console-message', (details) => {
    const { level, message, sourceId, lineNumber } = (details ?? {}) as Record<string, unknown>;
    log.log(level === 'error' ? 'error' : 'info', 'renderer.console', {
      level,
      message,
      source: sourceId,
      line: lineNumber,
    });
  });
};

/**
 * Forward one utility process's exit into the log.
 *
 * Only `exit` is forwarded: utilities are forked with the broker's default
 * `stdio: 'inherit'`, so their stdout and stderr are already main's own and
 * there is no separate stream to read.
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
