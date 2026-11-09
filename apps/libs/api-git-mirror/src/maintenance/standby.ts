import { once } from 'node:events';

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
