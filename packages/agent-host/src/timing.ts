/**
 * User-timing entries on the host's turn path, read by a trace and by the chat performance harness (WP-00 of the chat
 * performance plan). An entry stays in the running context's performance timeline: nothing is sent, and a runtime
 * without the User Timing API records nothing.
 */

/** The host's timing entries. @public */
export type HostTimingName = 'log-write' | 'log-flush' | 'model-request-sent';

/** Labels only: a row type, a byte count. Never ids or content. @public */
export type HostTimingDetail = Readonly<Record<string, string | number>>;

/**
 * The current time on the User Timing clock, or `undefined` where it is unavailable.
 *
 * @returns Milliseconds since the time origin.
 * @public
 */
export const hostTimingNow = (): number | undefined => {
  try {
    return performance.now();
  } catch {
    return undefined;
  }
};

/**
 * Record `tau.agent-host.<name>` as a mark, or as a measure from `start` when one is given. Synchronous and never
 * throws, so a measurement can never fail a write or a request.
 *
 * @param name - The entry.
 * @param start - The span's start from {@link hostTimingNow}; omitted for a mark.
 * @param detail - Bounded labels.
 * @public
 */
export const recordHostTiming = (name: HostTimingName, start?: number, detail?: HostTimingDetail): void => {
  try {
    const entry = `tau.agent-host.${name}`;
    if (start === undefined) {
      performance.mark(entry, detail === undefined ? undefined : { detail });
    } else {
      performance.measure(entry, { start, end: performance.now(), ...(detail === undefined ? {} : { detail }) });
    }
  } catch {
    /* No User Timing API: nothing to record. */
  }
};
