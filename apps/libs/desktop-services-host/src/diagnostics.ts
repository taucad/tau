/**
 * The diagnostics port of the desktop utilities (desktop split blueprint D-DS6).
 *
 * The services and kernel utilities write into the same rotating file the desktop's main process writes, but the
 * file log is the app's: it lives in `apps/desktop/src/main/diagnostics.ts` beside the renderer forwarders and their
 * signals. The app's utility entries therefore hand this library the factory before they import a utility's module
 * graph, and the library opens its logs through {@link openDiagnosticsLog}. A process that was handed no factory (a
 * unit test, a source run) logs nothing to disk, as it would with no log directory.
 *
 * @module
 */

/** One line's severity. Nothing here is user-facing; it is all operator text. */
export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

/** The sink a utility writes into. */
export type DiagnosticsLog = {
  /** Append one record. Never throws: a failing log must not take the utility down. */
  log(level: DiagnosticLevel, event: string, detail?: unknown): void;
  /** Write every queued record. Settles once they are on disk, or the write failed. */
  flush(): Promise<void>;
};

/** Options for one utility's log. */
export type DiagnosticsLogOptions = {
  /** Directory that receives the log file. */
  readonly directory: string;
  /** Process label prepended to console output. */
  readonly producer: string;
};

/** Opens a log; the desktop app's `createDiagnosticsLog`. */
export type DiagnosticsLogFactory = (options: DiagnosticsLogOptions) => DiagnosticsLog;

let factory: DiagnosticsLogFactory | undefined;

/**
 * Hand this process's utilities the log factory. The app's utility entries call it before they import the utility.
 *
 * @param next - The factory, or `undefined` to log nothing to disk again.
 */
export const provideDiagnosticsLog = (next: DiagnosticsLogFactory | undefined): void => {
  factory = next;
};

/**
 * Open a log through the factory this process was handed.
 *
 * @param options - Log directory and producer label.
 * @returns The log, or `undefined` when the process was handed no factory.
 */
export const openDiagnosticsLog = (options: DiagnosticsLogOptions): DiagnosticsLog | undefined => factory?.(options);
