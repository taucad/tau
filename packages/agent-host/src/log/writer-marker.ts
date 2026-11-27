import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';

/**
 * A provider writer's marker is one epoch-millisecond line (`Date.now()\n`, 13 digits). Anything else is a Node
 * writer's (HA-I10), including a `pid\n` marker from a Node build before the log path joined it.
 *
 * @param text - The marker's text.
 * @returns Whether a provider (browser) writer wrote it.
 * @internal
 */
export const isProviderMarker = (text: string): boolean => /^\d{13}\n$/u.test(text);

/**
 * When the log's newest readable row was recorded.
 *
 * @param bytes - The log's bytes, if read.
 * @returns Epoch milliseconds, or `undefined` for an empty or unreadable tail.
 * @internal
 */
export const newestRowAt = (bytes: Uint8Array<ArrayBuffer> | undefined): number | undefined => {
  const lines = bytes === undefined ? [] : new TextDecoder().decode(bytes).trimEnd().split('\n');
  for (const line of lines.toReversed()) {
    try {
      const at = Date.parse((JSON.parse(line) as { readonly recordedAt?: unknown }).recordedAt as string);
      if (Number.isFinite(at)) {
        return at;
      }
    } catch {
      /* A torn tail: the row before it is the newest whole one. */
    }
  }
  return undefined;
};

/**
 * Whether a writer marker is fresh (HA-I10, XD3): the newer of its modification time (a live writer touches it every
 * heartbeat tick) and the log's newest row is within {@link foreignRunStaleMilliseconds}.
 *
 * @param now - The wall clock, in epoch milliseconds.
 * @param touchedAt - The marker's modification time.
 * @param rowAt - The log's newest row's time.
 * @returns Whether the marker's writer must be honoured.
 * @internal
 */
export const isMarkerFresh = (now: number, touchedAt: number | undefined, rowAt: number | undefined): boolean =>
  now - Math.max(touchedAt ?? 0, rowAt ?? 0) < foreignRunStaleMilliseconds;
