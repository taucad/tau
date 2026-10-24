/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { Logger } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { RedisInFlightRegistry } from '#api/git/routing/in-flight.js';
import { RouteCache } from '#api/git/routing/route-cache.js';
import { RepositoryRouteGuard } from '#api/git/routing/route-guard.js';
import { readFrozenSummary, readRoute } from '#api/git/routing/route-table.js';

const logger = new Logger('GitRouting');

/**
 * Reports the OB5 freeze gauges at collection: live freezes and the oldest
 * one's age, per scope. Every API Machine reports the same table, so panels
 * and rules read them with `max` (W14, the accounting-scheduler pattern).
 *
 * @param metrics - The API's instruments.
 * @param database - The database the route table lives in.
 */
export const observeFrozenRoutes = (metrics: MetricsService, database: DatabaseService): void => {
  let summary: ReturnType<typeof readFrozenSummary> | undefined;
  /* One read per collection, shared by both gauges' callbacks: kept for a second, then dropped. */
  const read = async (): ReturnType<typeof readFrozenSummary> => {
    if (summary === undefined) {
      summary = readFrozenSummary(database.database);
      setTimeout(() => {
        summary = undefined;
      }, 1000).unref();
    }
    return summary;
  };
  metrics.gitRouteFrozen.addCallback(async (result) => {
    try {
      const { repository, global } = await read();
      result.observe(repository.frozen, {
        'tau.git.route.scope': 'repository',
      });
      result.observe(global.frozen, { 'tau.git.route.scope': 'global' });
    } catch (error) {
      logger.warn({ err: error }, 'The route freeze gauges could not read the route table');
    }
  });
  metrics.gitRouteFrozenOldest.addCallback(async (result) => {
    try {
      const { repository, global } = await read();
      result.observe(repository.oldestSeconds, {
        'tau.git.route.scope': 'repository',
      });
      result.observe(global.oldestSeconds, { 'tau.git.route.scope': 'global' });
    } catch {
      /* Logged once, by the callback above. */
    }
  });
};

/**
 * The route guard as `GitModule` provides it: routes from Postgres through the
 * per-Machine 5 s cache, in-flight registrations in the API's Redis.
 */
export const repositoryRouteGuardProvider: Provider = {
  provide: RepositoryRouteGuard,
  useFactory: (database: DatabaseService, redis: RedisService, metrics: MetricsService): RepositoryRouteGuard => {
    observeFrozenRoutes(metrics, database);
    return new RepositoryRouteGuard({
      routes: new RouteCache({
        load: async (projectId) => readRoute(database.database, projectId),
        metrics,
      }),
      registry: new RedisInFlightRegistry(redis.client),
      metrics,
    });
  },
  inject: [DatabaseService, RedisService, MetricsService],
};
