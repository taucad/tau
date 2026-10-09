import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/naming-convention -- AWS SDK command inputs and outputs use PascalCase fields */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ServiceOutputTypes } from '@aws-sdk/client-s3';
import type { MetricsService } from '#telemetry/metrics.js';
import { instrumentStorageClient } from '#storage/storage-metrics.js';

const storageClient = (respond: () => { output: ServiceOutputTypes; response: unknown }) => {
  const client = new S3Client({ region: 'auto', credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
  // Stands in for the network: everything after `build` never runs.
  client.middlewareStack.add(() => async () => respond(), { step: 'build', name: 'testTransport' });
  const metrics = { storageOperationDuration: { record: vi.fn() }, storageTransferBytes: { add: vi.fn() } };
  instrumentStorageClient(client, metrics as unknown as MetricsService, (bucket) =>
    bucket === 'private-bucket' ? 'private' : 'public',
  );
  return { client, metrics };
};

describe('instrumentStorageClient', () => {
  it('times each command and counts bytes by tier and direction', async () => {
    const { client, metrics } = storageClient(() => ({ output: { $metadata: {}, ContentLength: 7 }, response: {} }));

    await client.send(new PutObjectCommand({ Bucket: 'private-bucket', Key: 'k', Body: 'hello' }));
    await client.send(new GetObjectCommand({ Bucket: 'public-bucket', Key: 'k' }));

    expect(metrics.storageOperationDuration.record.mock.calls.map(([, attributes]: unknown[]) => attributes)).toEqual([
      { 'tau.storage.operation': 'PutObject', 'tau.storage.tier': 'private', outcome: 'ok' },
      { 'tau.storage.operation': 'GetObject', 'tau.storage.tier': 'public', outcome: 'ok' },
    ]);
    expect(metrics.storageTransferBytes.add.mock.calls).toEqual([
      [5, { 'tau.storage.operation': 'PutObject', 'tau.storage.tier': 'private', direction: 'upload' }],
      [7, { 'tau.storage.operation': 'GetObject', 'tau.storage.tier': 'public', direction: 'download' }],
    ]);
  });

  it('records a failed command with its error type and rethrows it', async () => {
    const missing = Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    const { client, metrics } = storageClient(() => {
      throw missing;
    });

    await expect(client.send(new GetObjectCommand({ Bucket: 'public-bucket', Key: 'k' }))).rejects.toBe(missing);
    expect(metrics.storageOperationDuration.record).toHaveBeenCalledWith(expect.any(Number), {
      'tau.storage.operation': 'GetObject',
      'tau.storage.tier': 'public',
      outcome: 'error',
      'error.type': 'NoSuchKey',
    });
    expect(metrics.storageTransferBytes.add).not.toHaveBeenCalled();
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end of the AWS SDK PascalCase scope */
