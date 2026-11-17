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

import { appendFileSync, closeSync, mkdirSync, mkdtempSync, openSync, renameSync, statSync } from 'node:fs';
import { appendFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prettyFactory } from 'pino-pretty';

import type { RegisterElectronRuntimeMainOptions } from '@taucad/runtime/electron/main';
import {
  appLoadFailureSignal,
  rendererGoneSignal,
  rendererHangOngoingSignal,
  rendererHangSignal,
} from '#main/desktop-signals.js';
import type { DesktopSignal } from '#main/desktop-signals.js';

/** One line's severity. Nothing here is user-facing; it is all operator text. */
export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

/** The sink main hands to every forwarder. @see createDiagnosticsLog */
export type DiagnosticsLog = {
  /** Absolute path of the current log file. */
  readonly filePath: string;
  /** Append one record. Never throws — a failing log must not take the app down. */
  log(level: DiagnosticLevel, event: string, detail?: unknown): void;
};

/** The rotating file log {@link createDiagnosticsLog} opens. */
export type DiagnosticsFileLog = DiagnosticsLog & {
  /** Write every queued record. Settles once they are on disk, or the write failed. */
  flush(): Promise<void>;
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
/** Rotated generations kept beside `desktop.log`: `desktop.1.log` (newest) to `desktop.3.log` (D6). */
export const rotatedLogGenerations = 3;
/* Where the log goes when its own file cannot be opened (a full, read-only or permission-broken profile): a fresh
 * folder only this account can enter (0700), so no other account can plant a link at a name it guessed in advance. */
const fallbackLogDirectory = (): string => mkdtempSync(join(tmpdir(), 'tau-desktop-logs-'));
/* Log files are readable by their owner only (0600); the mode applies when an append creates the file. */
const logFileMode = 0o600;
const appendOptions = { mode: logFileMode } as const;
/* Coalescing window for queued records, and the queue size that writes at once:
 * a renderer console loop or a chatty kernel then costs one append per window
 * rather than a stat and an append per line on main's event loop. */
const flushDelayMilliseconds = 100;
const flushQueuedChars = 64 * 1024;
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
 * Records queue and are appended off the calling thread in batches; an error
 * record is written synchronously together with everything queued before it,
 * and the queue is written synchronously at process exit, so a crash still
 * leaves the lines that explain it.
 *
 * @param options - Log directory, rotation threshold, and console echo.
 * @returns A sink that never throws.
 */
export const createDiagnosticsLog = (options: DiagnosticsLogOptions): DiagnosticsFileLog => {
  const maxBytes = options.maxBytes ?? defaultMaxBytes;
  /* Opening the log is the first thing main does that can fail on a broken profile, and the log is what explains
   * that failure (B18): a directory that cannot be created, or a log file that cannot be opened for append, moves
   * the log under the system's temporary folder. */
  const directory = ((): string => {
    try {
      mkdirSync(options.directory, { recursive: true });
      closeSync(openSync(join(options.directory, 'desktop.log'), 'a', logFileMode));
      return options.directory;
    } catch {
      try {
        return fallbackLogDirectory();
      } catch {
        /* Every write below is already guarded: a log with nowhere to go is silent, never fatal. */
        return options.directory;
      }
    }
  })();
  const filePath = join(directory, 'desktop.log');
  const generationPath = (generation: number): string => join(directory, `desktop.${String(generation)}.log`);
  const echo = options.echo ?? true;
  const producer = options.producer ?? 'desktop';
  const echoDebug = /^(1|true)$/iu.test(process.env['TAU_DEBUG'] ?? '');
  let previousConsoleRecord: { readonly key: string; readonly level: DiagnosticLevel; repeats: number } | undefined;

  /* Each generation moves one older, the oldest is replaced, and the current file becomes `desktop.1.log`. */
  const shiftGenerations = (move: (from: string, to: string) => void): void => {
    for (let generation = rotatedLogGenerations - 1; generation >= 1; generation -= 1) {
      try {
        move(generationPath(generation), generationPath(generation + 1));
      } catch {
        /* That generation does not exist yet. */
      }
    }
    move(filePath, generationPath(1));
  };
  const rotate = (): void => {
    try {
      if (statSync(filePath).size > maxBytes) {
        shiftGenerations(renameSync);
      }
    } catch {
      /* No file yet, or a racing writer — either way the next append creates one. */
    }
  };
  const rotateAsync = async (): Promise<void> => {
    try {
      const { size } = await stat(filePath);
      if (size > maxBytes) {
        /* Renames are quick and must not interleave with another writer's rotation, so they run synchronously. */
        shiftGenerations(renameSync);
      }
    } catch {
      /* No file yet, or a racing writer — either way the next append creates one. */
    }
  };

  let queued: string[] = [];
  let queuedChars = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();
  const takeQueued = (): string => {
    const text = queued.join('');
    queued = [];
    queuedChars = 0;
    clearTimeout(flushTimer);
    flushTimer = undefined;
    process.off('exit', writeQueuedSync);
    return text;
  };
  /* Exit cannot await: whatever is still queued is written synchronously. */
  function writeQueuedSync(): void {
    const text = takeQueued();
    if (text === '') {
      return;
    }
    try {
      rotate();
      appendFileSync(filePath, text, appendOptions);
    } catch {
      /* A log that cannot be written must not take the app down. */
    }
  }
  /* Each batch waits for the one before it, so batches land in queue order. */
  const writeBatch = async (previous: Promise<void>, text: string): Promise<void> => {
    await previous;
    try {
      await rotateAsync();
      await appendFile(filePath, text, appendOptions);
    } catch {
      /* A log that cannot be written must not take the app down. */
    }
  };
  const flush = async (): Promise<void> => {
    const text = takeQueued();
    if (text !== '') {
      writing = writeBatch(writing, text);
    }
    await writing;
  };
  const enqueue = (line: string): void => {
    if (queued.length === 0) {
      process.once('exit', writeQueuedSync);
    }
    queued.push(line);
    queuedChars += line.length;
    if (queuedChars >= flushQueuedChars) {
      void flush();
      return;
    }
    flushTimer ??= setTimeout(() => {
      flushTimer = undefined;
      void flush();
    }, flushDelayMilliseconds);
    flushTimer.unref();
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
    flush,
    log(level, event, detail) {
      const time = Date.now();
      const line = `${new Date(time).toISOString()} ${level.toUpperCase()} ${event}${describe(detail)}\n`;
      if (echo && (level !== 'debug' || echoDebug)) {
        echoConsole([level, event, detail, time]);
      }
      if (level !== 'error') {
        enqueue(line);
        return;
      }
      /* An error is often the last thing a dying process says: write it, and
       * everything queued before it, before returning. */
      queued.push(line);
      writeQueuedSync();
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
 * @param handlers - Handlers for what the forwarder sees.
 * @param handlers.recover - Optional recovery to run after an unexpected renderer exit, given its reason (B11).
 * @param handlers.report - Sends a failure signal to Sentry (SB11); the default sends nothing.
 * @returns Nothing.
 */
export const forwardRendererDiagnostics = (
  webContents: ObservableEmitter,
  log: DiagnosticsLog,
  {
    recover,
    report = () => undefined,
  }: {
    readonly recover?: (reason: string) => void;
    readonly report?: (signal: DesktopSignal | undefined) => void;
  } = {},
): void => {
  webContents.on('did-fail-load', (...details) => {
    const [, errorCode, errorDescription, url, isMainFrame] = details;
    log.log('error', 'renderer.did-fail-load', { errorCode, errorDescription, url });
    report(appLoadFailureSignal({ errorCode, errorDescription, url, isMainFrame }));
  });
  webContents.on('render-process-gone', (_event, details) => {
    log.log('error', 'renderer.render-process-gone', details);
    report(rendererGoneSignal(details));
    const reason = typeof details === 'object' && details !== null && 'reason' in details ? details.reason : undefined;
    if (reason !== 'clean-exit') {
      recover?.(typeof reason === 'string' ? reason : 'unknown');
    }
  });
  /* A renderer stuck in an error-boundary loop repeats one line at render speed.
   * Forwarding each one rotates the log away from whatever is being diagnosed,
   * so a streak is counted and reported once it ends. */
  let repeated: { readonly key: string; readonly level: DiagnosticLevel; count: number } | undefined;
  webContents.on('console-message', (details) => {
    const { level, message, sourceId, lineNumber } = (details ?? {}) as Record<string, unknown>;
    const rendererLevel = normalizeRendererLevel(level);
    const key = [rendererLevel, message, sourceId, lineNumber].map(String).join(' | ');
    if (repeated?.key === key) {
      repeated.count += 1;
      return;
    }
    if (repeated && repeated.count > 0) {
      log.log(repeated.level, 'renderer.console', { message: `↳ repeated ×${String(repeated.count)}` });
    }
    repeated = { key, level: rendererLevel, count: 0 };
    log.log(rendererLevel, 'renderer.console', {
      message,
      source: sourceId,
      line: lineNumber,
    });
  });
};

/** Milliseconds a renderer may stay unresponsive before the hang rule reports it and offers a choice (B24). */
export const rendererHangOfferMilliseconds = 30_000;

/** The hang rule's choices, in button order; the first is also what closing the box means. */
export const rendererHangButtons = ['Wait', 'Reload', 'Restart in Safe Mode'] as const;

/** The message box the hang rule shows: Electron's `dialog.showMessageBox` options this module sets. */
export type RendererHangMessageBox = {
  readonly type: 'warning';
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: string[];
  readonly defaultId: number;
  readonly cancelId: number;
  readonly noLink: boolean;
  /** Closes the box, as Wait, when the page answers first. */
  readonly signal: AbortSignal;
};

/** What the hang rule acts through. */
export type RendererHangRule = {
  readonly setTimeout: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  /** Show the native choice; resolves with the index of the chosen button. */
  readonly showMessageBox: (options: RendererHangMessageBox) => Promise<{ readonly response: number }>;
  /** End the hung renderer, so nothing waits on it; not a death for the reload policy. */
  readonly endHungPage: () => void;
  /** Load the page again, after {@link RendererHangRule.endHungPage}. */
  readonly reload: () => void;
  /** Quit through the quit owner and start again in safe mode. */
  readonly restartInSafeMode: () => void;
};

/**
 * Watch a window for renderer hangs: log each one when it starts and ends, and report one that lasted longer than
 * five seconds, with its duration, once it ends (SB11). A hang that ends in the renderer's exit is reported by that
 * exit instead.
 *
 * With a hang rule (B24), a hang that reaches 30 s is reported while it lasts, and the person gets a native choice:
 * Wait, Reload or Restart in Safe Mode. Wait asks again after another 30 s if the page still hangs. A page that
 * answers first, before or while the choice shows, closes it.
 *
 * @param window - The browser window (`unresponsive`, `responsive` and `closed` are window events).
 * @param log - Diagnostics sink.
 * @param handlers - Where signals go.
 * @param handlers.report - Sends a failure signal to Sentry.
 * @param handlers.now - The clock, for tests.
 * @param handlers.hangRule - The timers, the native choice and its two actions; without it, hangs are only reported.
 * @returns Nothing.
 */
export const watchRendererHangs = (
  window: ObservableEmitter,
  log: DiagnosticsLog,
  {
    report,
    now = Date.now,
    hangRule,
  }: {
    readonly report: (signal: DesktopSignal | undefined) => void;
    readonly now?: () => number;
    readonly hangRule?: RendererHangRule;
  },
): void => {
  let since: number | undefined;
  let offerTimer: unknown;
  let offering: AbortController | undefined;
  let reportedOngoing = false;
  /* Read through a function: the hang can end while the choice is showing. */
  const hanging = (): boolean => since !== undefined;

  const stopOffer = (): void => {
    if (offerTimer !== undefined) {
      hangRule?.clearTimeout(offerTimer);
      offerTimer = undefined;
    }
    offering?.abort();
    offering = undefined;
  };

  const arm = (rule: RendererHangRule): void => {
    offerTimer = rule.setTimeout(() => {
      void offer(rule);
    }, rendererHangOfferMilliseconds);
  };

  const offer = async (rule: RendererHangRule): Promise<void> => {
    offerTimer = undefined;
    if (since === undefined || offering !== undefined) {
      return;
    }
    const duration = now() - since;
    log.log('warn', 'renderer.hang-offered', { milliseconds: duration });
    if (!reportedOngoing) {
      reportedOngoing = true;
      report(rendererHangOngoingSignal(duration));
    }
    const controller = new AbortController();
    offering = controller;
    let response = 0;
    try {
      ({ response } = await rule.showMessageBox({
        type: 'warning',
        title: 'Tau',
        message: 'Tau is not responding',
        detail:
          `The page has not answered for ${String(Math.round(duration / 1000))} seconds. You can wait for it, reload it ` +
          '(unsaved changes on this page may be lost), or restart Tau in safe mode.',
        buttons: [...rendererHangButtons],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        signal: controller.signal,
      }));
    } catch (error) {
      log.log('error', 'renderer.hang-offer-failed', error);
    }
    if (offering === controller) {
      offering = undefined;
    }
    if (controller.signal.aborted) {
      return;
    }
    const choice = rendererHangButtons[response] ?? 'Wait';
    log.log('info', 'renderer.hang-choice', { choice });
    if (choice === 'Reload') {
      rule.endHungPage();
      rule.reload();
    } else if (choice === 'Restart in Safe Mode') {
      /* A hung page cannot answer the quit owner, which would wait its whole bound: end it first (D0). */
      rule.endHungPage();
      rule.restartInSafeMode();
    } else if (hanging()) {
      arm(rule);
    }
  };

  window.on('unresponsive', () => {
    log.log('warn', 'renderer.unresponsive');
    if (since !== undefined) {
      return;
    }
    since = now();
    reportedOngoing = false;
    if (hangRule !== undefined) {
      arm(hangRule);
    }
  });
  window.on('responsive', () => {
    if (since === undefined) {
      return;
    }
    stopOffer();
    const duration = now() - since;
    since = undefined;
    log.log('info', 'renderer.responsive', { milliseconds: duration });
    report(rendererHangSignal(duration));
  });
  window.on('closed', () => {
    stopOffer();
    since = undefined;
  });
};

/**
 * The windows the quit owner asks to save: not one whose renderer was ended as hung, nor one that has crashed, since
 * neither can answer and the wait would run to its bound.
 *
 * @param windows - The app's windows.
 * @param ended - Web contents ids whose hung renderer main ended.
 * @returns The windows to ask.
 */
export const pagesThatCanSave = <
  Window extends { readonly webContents: { readonly id: number; isCrashed(): boolean } },
>(
  windows: readonly Window[],
  ended: ReadonlySet<number>,
): Window[] => windows.filter((window) => !ended.has(window.webContents.id) && !window.webContents.isCrashed());

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
  onUtilityExit: ({ hostId, exitCode, released, stderrTail, peakResidentBytes }) => {
    log.log(exitCode === 0 || released ? 'info' : 'error', 'kernel.exit', {
      hostId,
      code: exitCode,
      released,
      stderrTail,
      /* D-DT-15e: how large the utility grew, so a field log shows which kernels approach the resident limit. */
      peakResidentBytes,
    });
  },
});
