import { describe, expect, it } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getEnvironment } from '#config/environment.config.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { TelemetryModule } from '#telemetry/telemetry.module.js';

/**
 * `MetricsService` is optional in `ObjectStorageService`, so a wiring regression would drop every
 * `tau_storage_*` series without failing anything. This compiles the real modules and checks the
 * client carries the middleware. The module is never closed: closing `TelemetryModule` imports the
 * OTel SDK, and nothing here holds a socket.
 */
const instrumented = (service: ObjectStorageService): boolean =>
  (service as unknown as { client: S3Client }).client.middlewareStack
    .identify()
    .some((entry) => entry.startsWith('tauStorageMetrics'));

describe('object storage metrics wiring', () => {
  it('should instrument the default and per-account clients when TelemetryModule is loaded', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), TelemetryModule, StorageModule],
    }).compile();
    const service = moduleRef.get(ObjectStorageService);

    expect(instrumented(service)).toBe(true);
    expect(instrumented(service.forAccount({ ...service.account, id: 'other', bucket: 'tau-content' }))).toBe(true);
  });
});
