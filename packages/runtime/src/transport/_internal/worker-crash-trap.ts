/**
 * Worker-side crash trap: exceptions kill, rejections log.
 *
 * An uncaught exception closes the channel server with an `lb` (bye)
 * frame carrying the reason, then ends the host process, so the peer
 * observes a typed shutdown *and* nothing is left holding a heap
 * behind a closed channel. An unhandled rejection is only reported —
 * the channel stays open, because one stray rejection among the
 * plugins loaded into a host is not a reason to lose the session.
 *
 * Lives under `transport/_internal/` because it is plumbing owned by
 * each transport's `host()` factory (web/node-worker hosts install it
 * automatically inside `open()`), not framework-layer code.
 *
 * @internal
 */

import { isNode } from '#framework/environment.js';

/**
 * Grace period for the bye frame's close handshake before the process
 * ends. Bounds the wait when the peer never acknowledges.
 */
const byeFlushTimeout = 250;

/**
 * Channel-server surface the trap drives.
 *
 * @internal
 */
export type WorkerCrashTrapHandle = {
  /** Resolves once the close handshake finalizes, when the handle exposes one. */
  readonly closed?: Promise<void>;
  /** Sends the `lb` bye frame and tears down local channel state. */
  dispose(reason?: string): void;
};

/**
 * Options accepted by {@link installWorkerCrashTrap}.
 *
 * @internal
 */
export type WorkerCrashTrapOptions = {
  /**
   * Ends the host process after an uncaught exception. Defaults to
   * setting `process.exitCode` and calling `process.exit`; injected by
   * tests so the exit path is observable without killing the runner.
   */
  readonly exit?: (code: number) => void;
};

/**
 * Install the worker-side crash trap.
 *
 * @param handle - Channel server handle whose `dispose(reason)` pushes
 *   the `lb` frame, and whose `closed` (when present) times the exit.
 * @param options - Fault-policy overrides; see {@link WorkerCrashTrapOptions}.
 * @returns A teardown function that removes the listeners. The
 *   returned function does NOT dispose the channel — call
 *   `handle.dispose(...)` separately for an orderly close.
 */
export const installWorkerCrashTrap = (
  handle: WorkerCrashTrapHandle,
  options: WorkerCrashTrapOptions = {},
): (() => void) => {
  const messageOf = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

  const closeWithBye = (reason: unknown): void => {
    try {
      handle.dispose(`worker-uncaught: ${messageOf(reason)}`);
    } catch {
      /* Drop: dispose is idempotent and we cannot recover from a
       * post-crash double-close. The wire `lb` frame from the first
       * dispose() is what the consumer actually observes. */
    }
  };

  if (isNode()) {
    const exitProcess =
      options.exit ??
      ((code: number): void => {
        // oxlint-disable-next-line n/prefer-global/process -- guarded by isNode()
        process.exitCode = code;
        /* This listener suppresses Node's own crash, so the exit here is
         * what keeps an uncaught exception from leaving a zombie host. */
        // oxlint-disable-next-line n/prefer-global/process, unicorn/no-process-exit -- guarded by isNode(); ending the process is the fault policy.
        process.exit(code);
      });

    /* The bye is only useful if it reaches the wire, so give the close
     * handshake a bounded head start before the process goes away. */
    const endProcess = async (): Promise<void> => {
      const flushed = new Promise<void>((resolve) => {
        setTimeout(resolve, byeFlushTimeout);
      });
      await (handle.closed === undefined ? flushed : Promise.race([handle.closed, flushed]));
      exitProcess(1);
    };

    const onUncaught = (error: unknown): void => {
      closeWithBye(error);
      void endProcess();
    };
    const onUnhandled = (reason: unknown): void => {
      const stack = reason instanceof Error && reason.stack !== undefined ? `\n${reason.stack}` : '';
      // oxlint-disable-next-line n/prefer-global/process -- guarded by isNode()
      process.stderr.write(`[tau-runtime] unhandled rejection: ${messageOf(reason)}${stack}\n`);
    };
    // oxlint-disable-next-line n/prefer-global/process -- guarded by isNode()
    process.on('uncaughtException', onUncaught);
    // oxlint-disable-next-line n/prefer-global/process -- guarded by isNode()
    process.on('unhandledRejection', onUnhandled);
    return (): void => {
      // oxlint-disable-next-line n/prefer-global/process -- guarded by isNode()
      process.off('uncaughtException', onUncaught);
      // oxlint-disable-next-line n/prefer-global/process -- guarded by isNode()
      process.off('unhandledRejection', onUnhandled);
    };
  }

  /* Browser/worker: the parent already receives the `error` event and
   * terminates the worker, so the trap only sends the bye. Unhandled
   * rejections are left to the platform's own console reporting. */
  const onErrorEvent = (event: ErrorEvent): void => {
    closeWithBye(event.error ?? event.message);
  };
  globalThis.addEventListener('error', onErrorEvent);
  return (): void => {
    globalThis.removeEventListener('error', onErrorEvent);
  };
};
