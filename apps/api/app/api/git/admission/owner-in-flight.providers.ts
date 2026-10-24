import type { Provider } from '@nestjs/common';
import { RedisService } from '#redis/redis.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { OwnerInFlightGate, RedisOwnerInFlightCap } from '#api/git/admission/owner-in-flight.js';

/**
 * The owner step of git admission as `GitModule` provides it (DA6): the
 * owner's in-flight slots counted in the API's Redis, so every API Machine
 * shares one cap of 10 requests and 5 pushes per owner.
 */
export const ownerInFlightGateProvider: Provider = {
  provide: OwnerInFlightGate,
  useFactory: (redis: RedisService, metrics: MetricsService): OwnerInFlightGate =>
    new OwnerInFlightGate({
      cap: new RedisOwnerInFlightCap(redis.client),
      metrics,
    }),
  inject: [RedisService, MetricsService],
};
