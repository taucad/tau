import { ServiceUnavailableException } from '@nestjs/common';
import type { HealthCheckResult } from '@nestjs/terminus';
import type { ReadinessFailure } from '#telemetry/sentry.js';

/**
 * A `/health/ready` 503 that the health controller has already logged, counted and reported per indicator.
 *
 * The response body is the terminus result the probe produced, so the HTTP answer is unchanged. The global
 * exception filter recognises this type and does not report it again as an anonymous server error.
 */
export class ReadinessRefusalException extends ServiceUnavailableException {
  public constructor(
    public readonly failures: readonly ReadinessFailure[],
    result: HealthCheckResult,
  ) {
    super(result);
  }
}

/**
 * The down indicators of a terminus result, with each one's message and probe time when it recorded them.
 *
 * @param result - The result terminus attaches to its `ServiceUnavailableException`.
 * @returns One entry per indicator under `error`, in check order.
 */
export const readinessFailures = (result: HealthCheckResult): ReadinessFailure[] =>
  Object.entries(result.error ?? {}).map(([indicator, detail]) => {
    const { message, responseTimeMs } = detail as { message?: unknown; responseTimeMs?: unknown };
    return {
      indicator,
      ...(typeof message === 'string' ? { message } : {}),
      ...(typeof responseTimeMs === 'number' ? { responseTimeMs } : {}),
    };
  });
