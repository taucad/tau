/* oxlint-disable new-cap, typescript-eslint/consistent-type-imports -- NestJS decorators use PascalCase; DI requires runtime imports */
import process from 'node:process';
import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { RedisHealthIndicator } from '#api/health/redis-health.indicator.js';
import { DatabaseHealthIndicator } from '#api/health/database-health.indicator.js';
import { S3HealthIndicator } from '#api/health/s3-health.indicator.js';
import { GitToolchainHealthIndicator } from '#api/health/git-toolchain-health.indicator.js';
import { ReadinessRefusalException, readinessFailures } from '#api/health/readiness-refusal.exception.js';
import { MetricsService } from '#telemetry/metrics.js';
import { reportReadinessFailure } from '#telemetry/sentry.js';
import { AttributeKey } from '@taucad/telemetry';

/**
 * Heap threshold: 80% of the 1 GiB API allocation in both Fly environments.
 * This is a heap guard, not an RSS limit; review it whenever API VM sizing changes.
 */
const heapThresholdBytes = 1024 * 1024 * 1024 * 0.8;

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  public constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly databaseHealth: DatabaseHealthIndicator,
    private readonly s3Health: S3HealthIndicator,
    private readonly gitToolchainHealth: GitToolchainHealthIndicator,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Liveness probe: Is the process alive?
   * Never check external dependencies here -- restarting the container
   * won't fix a Redis or DB outage and causes cascading failures.
   */
  @Get('live')
  @HealthCheck()
  public async checkLive(): Promise<HealthCheckResult> {
    return this.health.check([async () => this.memory.checkHeap('memory_heap', heapThresholdBytes)]);
  }

  /**
   * Readiness probe: Can the service handle traffic?
   * Checks all external dependencies. Failure removes the machine
   * from the Fly.io load balancer.
   *
   * A refusal is that removal working, not an application fault: it is logged as a
   * warning naming each down indicator, counted per indicator, and reported to Sentry
   * grouped by indicator rather than as one anonymous `ServiceUnavailableException`.
   */
  @Get('ready')
  @HealthCheck()
  public async checkReady(): Promise<HealthCheckResult> {
    try {
      return await this.health.check([
        async () => this.redisHealth.isHealthy(),
        async () => this.databaseHealth.isHealthy(),
        async () => this.s3Health.isHealthy(),
        async () => this.gitToolchainHealth.isHealthy(),
        async () => this.memory.checkHeap('memory_heap', heapThresholdBytes),
      ]);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }
      const result = error.getResponse() as HealthCheckResult;
      const failures = readinessFailures(result);
      // No down indicator (terminus `shutting_down`) is not a dependency refusal: leave it to the filter.
      if (failures.length === 0) {
        throw error;
      }
      this.logger.warn({ failures }, 'Readiness refused: dependency check down');
      for (const failure of failures) {
        this.metrics.healthReadinessFailures.add(1, { [AttributeKey.HEALTH_INDICATOR]: failure.indicator });
        reportReadinessFailure(failure);
      }
      throw new ReadinessRefusalException(failures, result);
    }
  }

  /**
   * Startup probe: Has the application finished bootstrapping?
   * Used by orchestrators to gate liveness/readiness checks.
   */
  @Get('startup')
  public checkStartup(): { status: string; uptime: number } {
    return {
      status: 'ok',
      uptime: process.uptime(),
    };
  }
}
