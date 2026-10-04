/**
 * Bounded client-side record of slow filesystem bridge calls.
 *
 * The bridge wire carries no server timestamps, so an entry holds only what
 * the client can observe: which method, on which proxy, how long the whole
 * round trip took and how it settled. Queueing, handler time and reply
 * delivery are not separable from here. Entries never hold arguments, paths,
 * contents or error messages; a rejection keeps only its machine-readable
 * `code`.
 */

/**
 * Milliseconds. A local bridge round trip normally settles in single-digit
 * milliseconds; two seconds is far past ordinary provider latency yet well
 * inside the 30-second call deadline, so it captures stalls before they
 * become timeouts without recording routine traffic.
 *
 * @public
 */
export const slowFileSystemBridgeCallThreshold = 2000;

/** Entries retained before the oldest are dropped, so the record never grows without bound. */
const maxSlowCalls = 50;

/**
 * One filesystem bridge call that took at least
 * {@link slowFileSystemBridgeCallThreshold} to settle.
 *
 * @public
 */
export type SlowFileSystemBridgeCall = {
  /** Opaque, increasing per realm. */
  readonly callId: number;
  /** Opaque identity of the proxy that issued the call, increasing per realm. */
  readonly connectionId: number;
  readonly method: string;
  /** Milliseconds since the Unix epoch when the client issued the call. */
  readonly startedAt: number;
  /** Milliseconds from issuing the call to its settlement, as the client saw it. */
  readonly duration: number;
  readonly outcome: 'resolved' | 'rejected';
  /** The rejection's `code`, when it carried a string one. */
  readonly errorCode?: string;
};

const slowCalls: SlowFileSystemBridgeCall[] = [];
let nextCallId = 0;
let nextConnectionId = 0;

/** Mint the opaque identity one proxy stamps on its slow calls. */
export const nextFileSystemBridgeConnectionId = (): number => nextConnectionId++;

const errorCodeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
};

/**
 * Await one bridge call and retain it when it was slow.
 *
 * @param connectionId - The issuing proxy's identity.
 * @param method - The bridge method name.
 * @param pending - The in-flight call.
 * @returns The call's own result; a rejection is rethrown unchanged.
 */
export const timeFileSystemBridgeCall = async (
  connectionId: number,
  method: string,
  pending: () => Promise<unknown>,
): Promise<unknown> => {
  const startedAt = Date.now();
  const start = performance.now();
  const settle = (outcome: SlowFileSystemBridgeCall['outcome'], error?: unknown): void => {
    const duration = performance.now() - start;
    if (duration < slowFileSystemBridgeCallThreshold) {
      return;
    }
    const errorCode = errorCodeOf(error);
    slowCalls.push({
      callId: nextCallId++,
      connectionId,
      method,
      startedAt,
      duration,
      outcome,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
    if (slowCalls.length > maxSlowCalls) {
      slowCalls.shift();
    }
  };
  try {
    const result = await pending();
    settle('resolved');
    return result;
  } catch (error) {
    settle('rejected', error);
    throw error;
  }
};

/**
 * The most recent slow filesystem bridge calls in this realm, oldest first.
 *
 * @returns A copy of the retained entries.
 * @public
 */
export const slowFileSystemBridgeCalls = (): readonly SlowFileSystemBridgeCall[] => [...slowCalls];
