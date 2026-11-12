/* oxlint-disable new-cap, typescript-eslint/consistent-type-imports -- NestJS DI requires runtime imports for constructor injection */
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { ObjectStorageService } from '@taucad/api-object-storage';

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
      // Both heads run at once, so the deadline bounds the slower one rather than their sum (TAU-API-6).
      const [result, privateBucketReachable] = await Promise.race([
        Promise.all([this.objectStorage.headProbeObject(signal), this.objectStorage.headPrivateBucket(signal)]),
        deadline,
      ]);
      const responseTimeMs = Math.round(performance.now() - start);

      if (result === undefined) {
        return indicator.down({
          responseTimeMs,
          message: 'Probe object missing — the API seeds it at boot; see the StorageSeeder log',
        });
      }

      // The private-publication serving path is gated on this bucket existing;
      // fail readiness rather than 500 on the first private publish.
      if (!privateBucketReachable) {
        return indicator.down({
          responseTimeMs,
          message: 'Private bucket missing — provision TAU_S3_PRIVATE_BUCKET (repos/tau-cloud pairing)',
        });
      }

      return indicator.up({ responseTimeMs });
    } catch (error) {
      return indicator.down({
        responseTimeMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(readinessTimer);
      // A fast failure of one head must not leave the other holding a socket until its own timeout.
      controller.abort(new Error('Storage readiness settled'));
    }
  }
}
