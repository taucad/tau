/**
 * Read and write health of one workbench settings record, shared by the
 * entries, view and layout stores. The stores keep their retries, merges and
 * checked preconditions; this only says what a person needs to know: whether
 * the saved settings could be read, and whether a local change is not yet
 * confirmed on disk.
 */

/** What a record's owner reports beside its bytes and refusal. */
export type RecordHealth = Readonly<{
  /** `retrying` after a failed read while the bounded backoff runs; `unavailable` once it stops. */
  read: 'ok' | 'retrying' | 'unavailable';
  /** A local change the store still owes the file: a failed checked write, or one outstanding past {@link slowWriteMilliseconds}. */
  unconfirmed: boolean;
  /** A checked write call is outstanding right now. */
  writing: boolean;
  /** The last failure's own message, for debug details only. */
  error: string | undefined;
}>;

/** How long a checked write may be outstanding before its change counts as not yet confirmed. */
export const slowWriteMilliseconds = 10_000;

/** Failed reads before automatic retry stops; a watch event or *Try again* starts it again. */
export const maxReadAttempts = 4;

const permanentCodes = new Set(['EACCES', 'EPERM']);
const codeOf = (error: unknown): unknown => (error as { code?: unknown } | undefined)?.code;

/** Whether a failure leaves the original write's outcome unknown (a lost reply or connection). */
export const isPotentiallyApplied = (error: unknown): boolean =>
  (error as { applicationState?: unknown } | undefined)?.applicationState === 'potentially-applied';

/**
 * One record's health tracker.
 *
 * @param input - Where to report changes and how to read again.
 * @returns The tracker the store drives.
 */
export function createRecordHealth(
  input: Readonly<{
    onHealth?: (health: RecordHealth) => void;
    /** Read the record again; called by the backoff. */
    readAgain: () => void;
  }>,
): Readonly<{
  health: () => RecordHealth;
  readSucceeded: () => void;
  readFailed: (error: unknown) => void;
  /** *Try again*: a fresh set of attempts. */
  restartReads: () => void;
  writeStarted: () => void;
  writeSettled: () => void;
  writeFailed: (error: unknown) => void;
  /** Every change the store owed has been written. */
  intentSettled: () => void;
  dispose: () => void;
}> {
  let read: RecordHealth['read'] = 'ok';
  let readFailures = 0;
  let readTimer: ReturnType<typeof setTimeout> | undefined;
  let writes = 0;
  let slow = false;
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  let failed = false;
  let error: string | undefined;
  let disposed = false;
  let reported = JSON.stringify({ read, unconfirmed: false, writing: false, error });
  const health = (): RecordHealth => ({ read, unconfirmed: slow || failed, writing: writes > 0, error });
  const emit = (): void => {
    const next = health();
    const key = JSON.stringify(next);
    if (disposed || key === reported) {
      return;
    }
    reported = key;
    input.onHealth?.(next);
  };
  const clearReadTimer = (): void => {
    if (readTimer !== undefined) {
      clearTimeout(readTimer);
      readTimer = undefined;
    }
  };
  return {
    health,
    readSucceeded: () => {
      readFailures = 0;
      clearReadTimer();
      read = 'ok';
      emit();
    },
    readFailed: (failure) => {
      error = failure instanceof Error ? failure.message : String(failure);
      readFailures += 1;
      if (permanentCodes.has(codeOf(failure) as string) || readFailures >= maxReadAttempts) {
        clearReadTimer();
        read = 'unavailable';
      } else {
        read = 'retrying';
        readTimer ??= setTimeout(
          () => {
            readTimer = undefined;
            if (!disposed) {
              input.readAgain();
            }
          },
          Math.min(250 * 2 ** (readFailures - 1), 8000),
        );
      }
      emit();
    },
    restartReads: () => {
      readFailures = 0;
      clearReadTimer();
      read = 'retrying';
      emit();
    },
    writeStarted: () => {
      writes += 1;
      slowTimer ??= setTimeout(() => {
        slowTimer = undefined;
        slow = true;
        emit();
      }, slowWriteMilliseconds);
      emit();
    },
    writeSettled: () => {
      writes = Math.max(0, writes - 1);
      if (writes === 0) {
        if (slowTimer !== undefined) {
          clearTimeout(slowTimer);
          slowTimer = undefined;
        }
        slow = false;
      }
      emit();
    },
    writeFailed: (failure) => {
      failed = true;
      error = failure instanceof Error ? failure.message : String(failure);
      emit();
    },
    intentSettled: () => {
      failed = false;
      emit();
    },
    dispose: () => {
      disposed = true;
      clearReadTimer();
      if (slowTimer !== undefined) {
        clearTimeout(slowTimer);
        slowTimer = undefined;
      }
    },
  };
}

/**
 * Wait for a store's flush at close, at most {@link slowWriteMilliseconds}. A
 * checked write has no client deadline, so a hung authority would otherwise hold
 * the window open without saying which record is waiting.
 *
 * @param flush - The store's flush; `true` once every owed change is confirmed.
 * @param message - The record's own "not confirmed" sentence, for the quit hold.
 */
export async function confirmFlush(flush: () => Promise<boolean>, message: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const confirmed = await Promise.race([
    flush(),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => {
        resolve(false);
      }, slowWriteMilliseconds);
    }),
  ]).finally(() => {
    clearTimeout(timer);
  });
  if (!confirmed) {
    throw new Error(message);
  }
}
