import type { S3Client } from '@aws-sdk/client-s3';
import type { MetricsService } from '#telemetry/metrics.js';

export type StorageMetricTier = 'public' | 'private' | 'account';

type StorageMetrics = Pick<MetricsService, 'storageOperationDuration' | 'storageTransferBytes'>;

const byteLength = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Buffer.byteLength(value);
  }
  return value instanceof Uint8Array ? value.byteLength : undefined;
};

/**
 * Times every S3 command this client sends and counts the payload bytes it moves.
 *
 * Every Tau object-storage call (Tau Sync packs and manifests, LFS, publications, content) goes
 * through one `S3Client` per storage account, so one middleware covers R2 in the cloud and MinIO
 * locally. Presigned URLs are signed here but transferred by the client, so they are not counted.
 *
 * Byte counts are approximate in two ways: an upload whose `Body` is a stream with no
 * `ContentLength` is not counted, and a `GetObject` counts the response's `ContentLength` before the
 * body is read, so a caller that abandons the stream is counted in full.
 *
 * The middleware runs at the `initialize` step, before the SDK's retry loop, so a duration covers every
 * attempt of one command: what the caller waited, not per-request network time.
 */
export const instrumentStorageClient = (
  client: S3Client,
  metrics: StorageMetrics,
  tierOf: (bucket: string | undefined) => StorageMetricTier,
): void => {
  client.middlewareStack.add(
    (next, context) => async (args) => {
      const input = args.input as { Bucket?: string; Body?: unknown; ContentLength?: number };
      const attributes = {
        'tau.storage.operation': context.commandName?.replace(/Command$/u, '') ?? 'unknown',
        'tau.storage.tier': tierOf(input.Bucket),
      };
      const started = performance.now();
      try {
        const result = await next(args);
        metrics.storageOperationDuration.record((performance.now() - started) / 1000, { ...attributes, outcome: 'ok' });
        const uploaded = input.ContentLength ?? byteLength(input.Body);
        if (uploaded !== undefined && uploaded > 0) {
          metrics.storageTransferBytes.add(uploaded, { ...attributes, direction: 'upload' });
        }
        const downloaded = (result.output as { ContentLength?: number }).ContentLength;
        if (attributes['tau.storage.operation'] === 'GetObject' && downloaded !== undefined && downloaded > 0) {
          metrics.storageTransferBytes.add(downloaded, { ...attributes, direction: 'download' });
        }
        return result;
      } catch (error) {
        metrics.storageOperationDuration.record((performance.now() - started) / 1000, {
          ...attributes,
          outcome: 'error',
          'error.type': error instanceof Error ? error.name : 'unknown',
        });
        throw error;
      }
    },
    { step: 'initialize', name: 'tauStorageMetrics' },
  );
};
