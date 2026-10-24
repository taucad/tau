import { Readable } from 'node:stream';
import { DeleteObjectCommand, DeleteObjectsCommand, PutObjectLegalHoldCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { ForbiddenDestinationCommandError, S3MirrorDestination, allowedCommands } from '#api/git/mirror/destination.js';

/**
 * The adapter against canned B2 answers, one test per DT0 finding (2026-10-24,
 * us-east-005): every request the SDK would send is recorded at the transport,
 * after signing, so the headers asserted are the ones B2 would see.
 */

type Recorded = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
};
type Answer = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

const fakeClient = (answer: (request: Recorded) => Answer) => {
  const requests: Recorded[] = [];
  const client = new S3Client({
    region: 'us-east-005',
    endpoint: 'https://s3.us-east-005.backblazeb2.com',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      handle: async (request: {
        method: string;
        path: string;
        query?: Record<string, string>;
        headers: Record<string, string>;
      }) => {
        const recorded = {
          method: request.method,
          path: request.path,
          query: { ...request.query },
          headers: Object.fromEntries(
            Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value]),
          ),
        };
        requests.push(recorded);
        const reply = answer(recorded);
        return {
          response: {
            statusCode: reply.status,
            headers: reply.headers ?? {},
            body: Readable.from([Buffer.from(reply.body ?? '')]),
          },
        };
      },
    },
  });
  return {
    requests,
    destination: new S3MirrorDestination(
      {
        endpoint: 'https://s3.us-east-005.backblazeb2.com',
        region: 'us-east-005',
        bucket: 'tau-copy',
        forcePathStyle: true,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      },
      client,
    ),
    client,
  };
};

const listing = (versions: string, markers = ''): string =>
  `<?xml version="1.0" encoding="UTF-8"?><ListVersionsResult><Name>tau-copy</Name><IsTruncated>false</IsTruncated>${versions}${markers}</ListVersionsResult>`;

const version = (key: string, id: string, size = 3): string =>
  `<Version><Key>${key}</Key><VersionId>${id}</VersionId><IsLatest>true</IsLatest><Size>${String(size)}</Size><LastModified>2026-10-24T00:00:00.000Z</LastModified></Version>`;

const marker = (key: string, id: string): string =>
  `<DeleteMarker><Key>${key}</Key><VersionId>${id}</VersionId><IsLatest>true</IsLatest><LastModified>2026-10-24T00:00:01.000Z</LastModified></DeleteMarker>`;

const forbidden: Answer = {
  status: 403,
  body: '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>not entitled</Message></Error>',
};

const key = 'tenants/user_a/repos/proj_a/packs/pack-x.pack';

describe('S3MirrorDestination on B2 (DT0)', () => {
  it('should send x-amz-checksum-sha256 and a compliance lock on every put, and never If-None-Match (DT0 T4, T5)', async () => {
    const { destination, requests } = fakeClient(() => ({
      status: 200,
      headers: { 'x-amz-version-id': '4_zversion' },
    }));
    const body = new Uint8Array(Buffer.from('abc'));
    const sha256 = 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=';

    const written = await destination.put(key, body, {
      contentLength: 3,
      sha256,
      retainUntil: new Date('2026-11-23T00:00:00.000Z'),
    });

    expect(written).toStrictEqual({ versionId: '4_zversion' });
    const [put] = requests;
    expect(put?.method).toBe('PUT');
    expect(put?.headers['x-amz-checksum-sha256']).toBe(sha256);
    expect(put?.headers['x-amz-object-lock-mode']).toBe('COMPLIANCE');
    expect(put?.headers['x-amz-object-lock-retain-until-date']).toBe('2026-11-23T00:00:00Z');
    expect(put?.headers['if-none-match']).toBeUndefined();
    expect(put?.headers['x-amz-trailer']).toBeUndefined();
  });

  it('should refuse a put the store answers without a version id: the bucket is not versioned', async () => {
    const { destination } = fakeClient(() => ({ status: 200 }));

    await expect(
      destination.put(key, new Uint8Array(Buffer.from('abc')), {
        contentLength: 3,
        sha256: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
        retainUntil: new Date('2026-11-23T00:00:00.000Z'),
      }),
    ).rejects.toThrow(/no version id/u);
  });

  it('should read a HEAD 403 as absent when a version listing agrees (DT0 2c)', async () => {
    const { destination, requests } = fakeClient((request) =>
      request.method === 'HEAD' ? forbidden : { status: 200, body: listing('') },
    );

    await expect(destination.head(key, '4_zmissing')).resolves.toBeUndefined();
    expect(requests.map((request) => request.method)).toStrictEqual(['HEAD', 'GET']);
    expect(requests[1]?.query).toMatchObject({ versions: '', prefix: key });
  });

  it('should raise a HEAD 403 when the version listing holds the version: a real refusal', async () => {
    const { destination } = fakeClient((request) =>
      request.method === 'HEAD' ? forbidden : { status: 200, body: listing(version(key, '4_zpresent')) },
    );

    await expect(destination.head(key, '4_zpresent')).rejects.toMatchObject({
      $metadata: { httpStatusCode: 403 },
    });
  });

  it('should ask for the stored checksum on HEAD and return it with the lock', async () => {
    const { destination, requests } = fakeClient(() => ({
      status: 200,
      headers: {
        'content-length': '3',
        'x-amz-version-id': '4_zv',
        'x-amz-checksum-sha256': 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
        'x-amz-object-lock-retain-until-date': '2026-11-23T00:00:00.000Z',
      },
    }));

    const head = await destination.head(key, '4_zv');

    expect(requests[0]?.headers['x-amz-checksum-mode']).toBe('ENABLED');
    expect(requests[0]?.query).toMatchObject({ versionId: '4_zv' });
    expect(head).toStrictEqual({
      versionId: '4_zv',
      bytes: 3,
      retainUntil: new Date('2026-11-23T00:00:00.000Z'),
      sha256: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    });
  });

  it('should probe by version listing: up on 200 whatever it lists, down on 403', async () => {
    const up = fakeClient(() => ({ status: 200, body: listing('') }));
    const down = fakeClient(() => forbidden);

    expect(await up.destination.probe()).toBe(true);
    expect(up.requests[0]?.method).toBe('GET');
    expect(up.requests[0]?.query).toMatchObject({
      versions: '',
      'max-keys': '1',
    });
    expect(await down.destination.probe()).toBe(false);
  });

  it('should discover by ListObjectVersions and report hide markers beside the versions they hide (DT0 3, 5)', async () => {
    const { destination, requests } = fakeClient(() => ({
      status: 200,
      body: listing(version(key, '4_zlocked'), marker(key, '4_zhide')),
    }));

    const found = [];
    for await (const entry of destination.listVersions('tenants/user_a/')) {
      found.push(entry);
    }

    expect(requests[0]?.query).toMatchObject({ versions: '' });
    expect(found).toStrictEqual([
      {
        key,
        versionId: '4_zlocked',
        bytes: 3,
        isHideMarker: false,
        modifiedAt: new Date('2026-10-24T00:00:00.000Z'),
      },
      {
        key,
        versionId: '4_zhide',
        bytes: 0,
        isHideMarker: true,
        modifiedAt: new Date('2026-10-24T00:00:01.000Z'),
      },
    ]);
  });

  it('should follow version-listing pages by key and version-id marker', async () => {
    const { destination, requests } = fakeClient((request) =>
      request.query['key-marker'] === undefined
        ? {
            status: 200,
            body: `<?xml version="1.0" encoding="UTF-8"?><ListVersionsResult><IsTruncated>true</IsTruncated><NextKeyMarker>${key}</NextKeyMarker><NextVersionIdMarker>4_za</NextVersionIdMarker>${version(key, '4_za')}</ListVersionsResult>`,
          }
        : { status: 200, body: listing(version(key, '4_zb')) },
    );

    const ids = [];
    for await (const entry of destination.listVersions('tenants/')) {
      ids.push(entry.versionId);
    }

    expect(ids).toStrictEqual(['4_za', '4_zb']);
    expect(requests[1]?.query).toMatchObject({
      'key-marker': key,
      'version-id-marker': '4_za',
    });
  });

  it('should extend a lock in compliance mode on the named version', async () => {
    const { destination, requests } = fakeClient(() => ({ status: 200 }));

    await destination.extendRetention(key, '4_zv', new Date('2026-12-01T00:00:00.000Z'));

    expect(requests[0]?.method).toBe('PUT');
    expect(requests[0]?.query).toMatchObject({
      retention: '',
      versionId: '4_zv',
    });
  });

  /* eslint-disable @typescript-eslint/naming-convention -- AWS SDK inputs are PascalCase */
  const forbiddenSends: ReadonlyArray<readonly [string, (client: S3Client) => Promise<unknown>]> = [
    ['DeleteObjectCommand', async (client) => client.send(new DeleteObjectCommand({ Bucket: 'tau-copy', Key: key }))],
    [
      'DeleteObjectsCommand',
      async (client) =>
        client.send(new DeleteObjectsCommand({ Bucket: 'tau-copy', Delete: { Objects: [{ Key: key }] } })),
    ],
    [
      'PutObjectLegalHoldCommand',
      async (client) => client.send(new PutObjectLegalHoldCommand({ Bucket: 'tau-copy', Key: key })),
    ],
  ];
  /* eslint-enable @typescript-eslint/naming-convention -- end AWS SDK inputs */

  it.each(forbiddenSends)(
    'should refuse %s at the client before anything is signed or sent (W13 B7)',
    async (_name, send) => {
      const { client, requests } = fakeClient(() => ({ status: 204 }));

      await expect(send(client)).rejects.toBeInstanceOf(ForbiddenDestinationCommandError);
      expect(requests).toHaveLength(0);
    },
  );

  it('should allow exactly list, head, get, put and retention', () => {
    expect([...allowedCommands].sort()).toStrictEqual([
      'GetObjectCommand',
      'HeadObjectCommand',
      'ListObjectVersionsCommand',
      'PutObjectCommand',
      'PutObjectRetentionCommand',
    ]);
  });
});
