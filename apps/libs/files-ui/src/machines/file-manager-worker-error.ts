/**
 * Worker-error diagnostics for the FileManager XState machine.
 *
 * Browsers dispatch two very different `error` events on a `Worker`:
 *
 * 1. **Runtime errors** — an `ErrorEvent` carrying `message`, `filename`,
 *    `lineno`, `colno`, and the actual `Error` object on `event.error`. These
 *    fire when uncaught exceptions or rejected top-level awaits surface from
 *    inside an already-loaded module worker.
 * 2. **Load failures** — a plain `Event` with no useful properties at all
 *    (`message`/`filename`/`lineno` are all `undefined`). These fire when the
 *    browser cannot evaluate the worker module (404 served as HTML, MIME-type
 *    mismatch, COEP block, syntax error before evaluation, failed sub-import).
 *
 * The previous handler logged `event.message`, `event.filename`,
 * `event.lineno` directly, producing the infamous
 * `WORKER ERROR: undefined undefined undefined` for every load failure. This
 * helper returns a structured, always-informative payload so the FM machine
 * can both log it and route it through `onError → state: 'error'` with a
 * meaningful `context.error.message`.
 */

const loadFailureGuidance =
  'Worker script failed to load (likely 404 served as HTML, COEP/CORP block, MIME-type mismatch, or SyntaxError before module evaluation). Inspect the Network tab for the worker URL and check its Content-Type.';

type WorkerErrorKind = 'runtime' | 'load' | 'messageerror';

export type FormattedWorkerError = {
  readonly kind: WorkerErrorKind;
  readonly message: string;
  readonly filename?: string;
  readonly lineno?: number;
  readonly colno?: number;
  readonly stack?: string;
  readonly cause?: unknown;
};

/**
 * Build a `FormattedWorkerError` from the raw event a `Worker` dispatched.
 * Distinguishes runtime `ErrorEvent`s from opaque load-failure `Event`s and
 * always produces a non-empty `message` suitable for logging or for an
 * `Error` constructed from it.
 */
export function formatWorkerError(event: Event): FormattedWorkerError {
  if (event.type === 'messageerror') {
    return {
      kind: 'messageerror',
      message:
        'Worker `messageerror` — a message could not be deserialized (structured-clone failure or unsupported transferable). Check the most recent postMessage payload for non-cloneable values.',
    };
  }

  if (event instanceof ErrorEvent) {
    const errorObject = event.error instanceof Error ? event.error : undefined;
    // Empty `message`/`filename` strings are valid sentinels that browsers
    // fall back to when the worker source is cross-origin without proper
    // headers — explicitly treat them as missing so we surface useful
    // alternatives instead of an empty fragment.
    const eventMessage = event.message === '' ? undefined : event.message;
    const eventFilename = event.filename === '' ? undefined : event.filename;
    const baseMessage = eventMessage ?? errorObject?.message ?? 'Unknown worker error';
    const where = eventFilename ? ` at ${eventFilename}:${event.lineno}:${event.colno}` : '';
    return {
      kind: 'runtime',
      message: `${baseMessage}${where}`,
      filename: eventFilename,
      lineno: event.lineno === 0 ? undefined : event.lineno,
      colno: event.colno === 0 ? undefined : event.colno,
      stack: errorObject?.stack,
      cause: errorObject,
    };
  }

  return {
    kind: 'load',
    message: loadFailureGuidance,
  };
}

/**
 * Structured envelope a worker can post to the main thread to surface a
 * top-level-await failure (or any synchronously-known error during module
 * evaluation) before the browser fires the opaque load-failure `error` event.
 *
 * The worker side serializes the original `Error` into plain fields so it
 * survives `postMessage` structured-clone for any cause type.
 */
export type WorkerErrorEnvelope = {
  readonly type: '__worker_init_error__' | '__worker_runtime_error__';
  readonly phase: string;
  readonly name?: string;
  readonly message: string;
  readonly stack?: string;
  readonly filename?: string;
  readonly lineno?: number;
  readonly colno?: number;
  readonly causeMessage?: string;
};

/**
 * Type guard for envelopes the FM worker posts when it catches its own
 * top-level failures. Used by the main-thread `message` listener so we can
 * route worker-side crashes into the FM state machine's `error` transition.
 */
export function isWorkerErrorEnvelope(data: unknown): data is WorkerErrorEnvelope {
  if (data === null || typeof data !== 'object') {
    return false;
  }
  const candidate = data as { type?: unknown; phase?: unknown; message?: unknown };
  return (
    (candidate.type === '__worker_init_error__' || candidate.type === '__worker_runtime_error__') &&
    typeof candidate.phase === 'string' &&
    typeof candidate.message === 'string'
  );
}

/**
 * Format a `WorkerErrorEnvelope` (posted by the worker itself) into the same
 * shape `formatWorkerError` returns for native browser events, so callers can
 * treat both diagnostic sources uniformly.
 */
export function formatWorkerErrorEnvelope(envelope: WorkerErrorEnvelope): FormattedWorkerError {
  const kind: WorkerErrorKind = envelope.type === '__worker_init_error__' ? 'runtime' : 'runtime';
  const where = envelope.filename ? ` at ${envelope.filename}:${envelope.lineno}:${envelope.colno}` : '';
  const causeSuffix = envelope.causeMessage ? ` (caused by: ${envelope.causeMessage})` : '';
  return {
    kind,
    message: `Worker ${envelope.phase} failed: ${envelope.message}${where}${causeSuffix}`,
    filename: envelope.filename,
    lineno: envelope.lineno,
    colno: envelope.colno,
    stack: envelope.stack,
  };
}

/**
 * Convert any `FormattedWorkerError` into a real `Error` so it can be thrown
 * (or rejected) and consumed by XState's `onError → setError` action.
 */
export function toWorkerError(formatted: FormattedWorkerError): Error {
  const error = new Error(formatted.message, formatted.cause === undefined ? undefined : { cause: formatted.cause });
  if (formatted.stack) {
    error.stack = formatted.stack;
  }
  return error;
}
