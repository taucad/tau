import { once } from 'node:events';

/** A SQLSTATE (`57P03`), a Node errno (`ECONNREFUSED`) or a driver code (`CONNECT_TIMEOUT`): never a value. */
const loggableCode = /^[\dA-Z_]{1,32}$/;

/**
 * The error's `code` when it is a bare identifier such as a Postgres SQLSTATE.
 * The message is never logged: a driver's can carry a connection string or a value.
 */
const errorCodeOf = (error: unknown): string | undefined => {
  const code: unknown = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && loggableCode.test(code) ? code : undefined;
};

/**
 * Wraps a standby check so a transient failure — Postgres refusing connections
 * while a release restarts it — is retried a bounded number of times, `retryDelay`
 * apart, before the check fails with the last attempt's error.
 */
export const retryingCheck =
  (
    check: () => Promise<unknown>,
    options: {
      /** Total tries, the first included. */
      attempts: number;
      /** Milliseconds between tries. */
      retryDelay: number;
    },
  ): (() => Promise<unknown>) =>
  async () => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design.
        return await check();
      } catch (error) {
        if (attempt >= options.attempts) {
          throw error;
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- the bounded pause between attempts.
      await new Promise((resolve) => {
        setTimeout(resolve, options.retryDelay);
      });
    }
  };

/**
 * The standby the `tau-maintenance` app starts in while the API's
 * `revisions-maintenance` group still runs the worker (north star DC4).
 *
 * Charter D21 allows exactly one maintenance worker, and nothing in the passes
 * takes a cross-process lock, so two workers during the move would race
 * purge, recovery and collection. Standby proves what the new app needs to take
 * over — its own Postgres login and its own storage token — logs the result
 * once, and then runs nothing until it is stopped. A failed check throws, the
 * process exits non-zero and Fly restarts the Machine, so a missing secret or
 * grant shows before the cutover rather than at it.
 */
export const holdInStandby = async (args: {
  /** Named checks, each resolving when its credential works. */
  checks: Readonly<Record<string, () => Promise<unknown>>>;
  signal: AbortSignal;
  report: (line: string) => void;
}): Promise<void> => {
  const verified: string[] = [];
  for (const [name, check] of Object.entries(args.checks)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one check at a time names the first that fails.
      await check();
    } catch (error) {
      args.report(
        JSON.stringify({
          event: 'revisions_maintenance.standby_failed',
          check: name,
          error: error instanceof Error ? error.name : 'StandbyCheckError',
          code: errorCodeOf(error),
        }),
      );
      throw new Error(`Maintenance standby check '${name}' failed`, { cause: error });
    }
    verified.push(name);
  }
  args.report(JSON.stringify({ event: 'revisions_maintenance.standby', verified }));
  if (args.signal.aborted) {
    return;
  }
  /* A pending promise does not keep Node running: without a live handle the
     worker exits 13 ("unsettled top-level await") and Fly restarts it in a loop. */
  const keepAlive = setInterval(() => undefined, 60_000);
  try {
    await once(args.signal, 'abort');
  } finally {
    clearInterval(keepAlive);
  }
};
