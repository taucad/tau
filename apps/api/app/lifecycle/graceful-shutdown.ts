import process from 'node:process';
import { Logger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { UpgradeRouter } from '#lifecycle/upgrade-router.js';

/** Milliseconds after the stop signal at which each phase gives up. */
export type ShutdownPhases = {
  /** In-flight requests and upgraded sockets still open are cut. */
  readonly cut: number;
  /** Tracked work still pending is abandoned and modules close. */
  readonly abandon: number;
};

/**
 * Fly allows 120 s (`kill_timeout` in `fly.*.toml`) from SIGTERM to SIGKILL,
 * sized so a model step still streaming at a deploy usually finishes rather
 * than being cut. Requests get until 105 s; work they leave behind (and
 * whatever the cut itself starts, such as a cut model step's settlement) until
 * 112 s; module teardown, with its OTEL flush of at most 5 s, fits in what
 * remains with 3 s to spare. Every phase ends as soon as its work is done, so
 * the window costs a deploy time only while a request is still running.
 * `kill_timeout` and these phases change together.
 */
export const shutdownPhases: ShutdownPhases = { cut: 105_000, abandon: 112_000 };

/**
 * Fastify options the drain depends on. A request that reaches a closing
 * server on a connection already open is served with `Connection: close`
 * rather than refused 503: fly-proxy's next request then opens a connection,
 * finds the listener closed and goes to another Machine, where a 503 would
 * show a person a paused turn or back a push off.
 */
export const drainingServerOptions = { return503OnClosing: false };

const logger = new Logger('Shutdown');

/**
 * Stops the API in the order a deploy needs, which is not Nest's own:
 * `app.close()` destroys every module (Postgres, Redis, durable events) first
 * and closes the HTTP server last, so a request still running would find its
 * connections closed under it.
 *
 * 1. The stop signal fires: long polls answer, WebSockets close 1012, pushes
 *    not yet committing are refused ({@link ShutdownService}).
 * 2. Fastify closes: the listener stops, which is fly-proxy's signal to send
 *    new requests to another Machine, and in-flight requests run to completion.
 *    A request that arrives on a connection already open is served with
 *    `Connection: close` ({@link drainingServerOptions}).
 * 3. At `phases.cut`, connections and upgraded sockets still open are cut.
 * 4. Work those requests left behind finishes, until `phases.abandon`.
 * 5. `app.close()` runs the module hooks and flushes telemetry.
 *
 * @param app - The started API application.
 * @param phases - When each phase gives up, in milliseconds after the call.
 */
export async function closeGracefully(
  app: NestFastifyApplication,
  phases: ShutdownPhases = shutdownPhases,
): Promise<void> {
  const started = Date.now();
  const shutdown = app.get(ShutdownService);
  const fastify = app.getHttpAdapter().getInstance();
  shutdown.stop();
  const closed = fastify.close();
  // `server.close()` closes idle keep-alive connections once; one whose request
  // finishes afterwards would idle until `keepAliveTimeout` and hold the drain.
  // ponytail: a 100 ms sweep rather than per-response hooks installed at boot.
  const idleSweep = setInterval(() => {
    fastify.server.closeIdleConnections();
  }, 100);
  let cutTimer: NodeJS.Timeout | undefined;
  const cutReached = new Promise<'cut'>((resolve) => {
    cutTimer = setTimeout(resolve, phases.cut, 'cut');
  });
  const outcome = await Promise.race([closed, cutReached]);
  clearInterval(idleSweep);
  clearTimeout(cutTimer);
  let upgradedSocketsCut = 0;
  if (outcome === 'cut') {
    fastify.server.closeAllConnections();
    upgradedSocketsCut = app.get(UpgradeRouter).destroyAll();
    await closed;
  }
  const drainedIn = Date.now() - started;

  const workAbandoned = await shutdown.settled(started + phases.abandon);
  const summary = { drainedIn, cut: outcome === 'cut', upgradedSocketsCut, workAbandoned };
  if (summary.cut || workAbandoned > 0) {
    logger.warn(summary, 'Shutdown drained with cuts; closing modules');
  } else {
    logger.log(summary, 'Shutdown drained; closing modules');
  }

  await app.close();
  logger.log({ elapsed: Date.now() - started }, 'Shutdown complete');
}

/**
 * Replaces `app.enableShutdownHooks()`: on SIGTERM (Fly's `kill_signal`) or
 * SIGINT, closes gracefully and then re-raises the signal so the process exits
 * the way it would have without a handler. The re-raise ends the process only
 * while no other listener for that signal exists; the signal-path test fails
 * the day one is added.
 *
 * @param app - The started API application.
 * @param phases - When each phase gives up.
 */
export function closeGracefullyOnSignal(app: NestFastifyApplication, phases: ShutdownPhases = shutdownPhases): void {
  const signals = ['SIGTERM', 'SIGINT'] as const;
  const onSignal = async (signal: NodeJS.Signals): Promise<void> => {
    for (const each of signals) {
      process.removeListener(each, onSignal);
    }

    try {
      await closeGracefully(app, phases);
    } catch (error) {
      logger.error(error, 'Graceful shutdown failed');
    } finally {
      process.kill(process.pid, signal);
    }
  };

  for (const signal of signals) {
    process.on(signal, onSignal);
  }
}
