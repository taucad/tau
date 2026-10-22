/* oxlint-disable new-cap, typescript-eslint/consistent-type-imports -- NestJS DI requires runtime imports for constructor injection */
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { ObjectStorageService } from '#storage/object-storage.service.js';

@Injectable()
export class S3HealthIndicator {
  public constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  public async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('s3');
    const start = performance.now();
    // One shared deadline leaves room for the response within Fly's two-second check.
    const controller = new AbortController();
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      readinessTimer = setTimeout(() => {
        const error = new Error('Storage readiness timed out after 1500 ms');
        controller.abort(error);
        reject(error);
      }, 1500);
    });
    const { signal } = controller;

    try {
      const result = await Promise.race([this.objectStorage.headProbeObject(signal), deadline]);
      const responseTimeMs = Math.round(performance.now() - start);

      if (result === undefined) {
        return indicator.down({ responseTimeMs, message: 'Probe object missing — run scripts/seed-r2-defaults.sh' });
      }

      // The private-publication serving path is gated on this bucket existing;
      // fail readiness rather than 500 on the first private publish.
      const privateBucketReachable = await Promise.race([this.objectStorage.headPrivateBucket(signal), deadline]);
      if (!privateBucketReachable) {
        return indicator.down({
          responseTimeMs,
          message: 'Private bucket missing — provision TAU_S3_PRIVATE_BUCKET (repos/tau-cloud pairing)',
        });
      }

      return indicator.up({ responseTimeMs: Math.round(performance.now() - start) });
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) });
    } finally {
      clearTimeout(readinessTimer);
    }
  }
}
