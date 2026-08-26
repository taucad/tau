/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import process from 'node:process';
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { RedisHealthIndicator } from '#api/health/redis-health.indicator.js';
import { DatabaseHealthIndicator } from '#api/health/database-health.indicator.js';
import { S3HealthIndicator } from '#api/health/s3-health.indicator.js';

/** Heap threshold: 80% of the 2GB VM allocation */
const heapThresholdBytes = 2 * 1024 * 1024 * 1024 * 0.8;

@Controller('health')
export class HealthController {
  public constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly databaseHealth: DatabaseHealthIndicator,
    private readonly s3Health: S3HealthIndicator,
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
   */
  @Get('ready')
  @HealthCheck()
  public async checkReady(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => this.redisHealth.isHealthy(),
      async () => this.databaseHealth.isHealthy(),
      async () => this.s3Health.isHealthy(),
      async () => this.memory.checkHeap('memory_heap', heapThresholdBytes),
    ]);
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
