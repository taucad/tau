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

    try {
      const result = await this.objectStorage.headProbeObject();
      const responseTimeMs = Math.round(performance.now() - start);

      if (result === undefined) {
        return indicator.down({ responseTimeMs, message: 'Probe object missing — run scripts/seed-r2-defaults.sh' });
      }

      if (responseTimeMs > 500) {
        return indicator.down({ responseTimeMs, message: 'Response time exceeds 500ms threshold' });
      }

      return indicator.up({ responseTimeMs });
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) });
    }
  }
}
