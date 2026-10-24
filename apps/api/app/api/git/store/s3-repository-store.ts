/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { createHash } from 'node:crypto';
import { Transform, pipeline } from 'node:stream';
import type { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable, Optional } from '@nestjs/common';
import { concatUint8Arrays } from '#storage/concat-uint8-arrays.js';
import { ObjectStorageService, isS3ObjectMissing } from '#storage/object-storage.service.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import type {
  CommitToken,
  ManifestBytes,
  ObjectBody,
  ObjectSource,
  PutObjectOptions,
  RepositoryLocator,
  RepositoryStore,
  StoreCapabilities,
  StoredObject,
} from '#api/git/store/port.js';

/**
 * ===========================================================================
 * Key layout. Charter D5 makes this a single choice inside the adapter: the
 * ref map is one manifest key written with `If-Match`. If W0b's same-key burst
 * test shows R2 `429`s are routine at turn end, the flip is to
 * generation-numbered keys written with `If-None-Match` — and it is confined to
 * the four constants and two functions below plus `readManifest`/
 * `commitManifest`. Never to Postgres refs.
 * ===========================================================================
 */

/** The single mutable key of a repository (D5). */
const manifestKeyName = 'manifest.json';

/** Everything for one repository lives under this prefix (D24). */
const repositoryPrefix = (locator: RepositoryLocator): string => `${locator.ownerId}/repos/${locator.projectId}/`;

const manifestKey = (locator: RepositoryLocator): string => `${repositoryPrefix(locator)}${manifestKeyName}`;

/** S3 and R2 both cap a single-part PUT at 5 GiB. */
const defaultMaxObjectBytes = 5 * 1024 * 1024 * 1024;

/** Part size for an object above the single-part ceiling; S3's minimum non-final part is 5 MiB. */
const multipartPartBytes = 8 * 1024 * 1024;

const manifestContentType = 'application/json';
const objectContentType = 'application/octet-stream';

/**
 * Attempts at a streamed single-part PUT. The AWS SDK retries a buffered body
 * three times on its own and a streamed one never (it cannot rewind a
 * stream), so the adapter reopens the source and keeps the same count.
 */
const streamedPutAttempts = 3;

/** Backoff before the second and third streamed attempt, the curve `commitLease`'s manifest loop uses. */
const streamedPutBackoffMilliseconds = (attempt: number): number => 200 * 3 ** (attempt - 1);

/** Transport failures with no HTTP status that a resend can cure. */
const retryableTransportCodes = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']);

/**
 * Whether a failed streamed PUT is worth sending again: a throttle, a server
 * error or a dropped connection. A 4xx (a bad digest, a refused length) is
 * the request's own fault and is not.
 */
const isRetryablePutFailure = (error: unknown): boolean => {
  const candidate = error as { $metadata?: { httpStatusCode?: number }; code?: string; name?: string } | undefined;
  const status = candidate?.$metadata?.httpStatusCode;
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }
  return (
    (candidate?.code !== undefined && retryableTransportCodes.has(candidate.code)) || candidate?.name === 'TimeoutError'
  );
};

/**
 * Passes `source` through unchanged while counting it, and fails the stream on
 * the first byte past `expected` or at an end that falls short. The backend
 * would refuse either too, but only after reading the whole body; this makes
 * the refusal a `RangeError` the caller can tell apart from a transport fault.
 */
const lengthChecked = (source: Readable, key: string, expected: number): Readable => {
  let seen = 0;
  const counter = new Transform({
    transform(chunk: Uint8Array<ArrayBuffer>, _encoding, callback) {
      seen += chunk.byteLength;
      if (seen > expected) {
        callback(new RangeError(`putObject declared ${String(expected)} bytes for '${key}' but the source is longer.`));
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      callback(
        seen === expected
          ? null
          : new RangeError(
              `putObject declared ${String(expected)} bytes for '${key}' but the source ended at ${String(seen)}.`,
            ),
      );
    },
  });
  return pipeline(source, counter, () => {
    // An error reaches the consumer through `counter`, which pipeline destroys with it.
  });
};

/**
 * Yields `chunks` regrouped into parts of exactly `partBytes` (the last one
 * shorter), copying into one buffer per part so a part never holds more than
 * its own bytes however the source happened to chunk them.
 */
async function* partsOf(
  chunks: AsyncIterable<Uint8Array<ArrayBuffer>>,
  partBytes: number,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  let part = new Uint8Array(new ArrayBuffer(partBytes));
  let filled = 0;
  for await (const chunk of chunks) {
    let offset = 0;
    while (offset < chunk.byteLength) {
      const taken = Math.min(partBytes - filled, chunk.byteLength - offset);
      part.set(chunk.subarray(offset, offset + taken), filled);
      filled += taken;
      offset += taken;
      if (filled === partBytes) {
        yield part;
        part = new Uint8Array(new ArrayBuffer(partBytes));
        filled = 0;
      }
    }
  }
  if (filled > 0) {
    yield part.slice(0, filled);
  }
}

/** A buffered body as a one-chunk sequence, without copying it. */
const bytesAsChunks = (body: Uint8Array<ArrayBuffer>): AsyncIterable<Uint8Array<ArrayBuffer>> => ({
  async *[Symbol.asyncIterator]() {
    yield body;
  },
});

export type S3RepositoryStoreOptions = {
  /** Overrides the single-part ceiling. The conformance suite lowers it to exercise multipart cheaply. */
  maxObjectBytes?: number;
  /** Overrides the listing page size. Tests lower it to force continuation tokens. */
  listPageSize?: number;
};

/**
 * The one `RepositoryStore` adapter at launch (charter D25). It carries the
 * ETag inside the commit token and resolves every locator to
 * `tenants/<ownerId>/repos/<projectId>/…` in the private tier, so no caller
 * above this file knows the key shape, the bucket or the provider.
 */
@Injectable()
export class S3RepositoryStore implements RepositoryStore {
  public readonly capabilities: StoreCapabilities;

  private readonly listPageSize: number | undefined;

  public constructor(
    private readonly storage: ObjectStorageService,
    @Optional() options?: S3RepositoryStoreOptions,
  ) {
    this.capabilities = {
      conditionalWrite: true,
      delete: true,
      list: true,
      maxObjectBytes: options?.maxObjectBytes ?? defaultMaxObjectBytes,
    };
    this.listPageSize = options?.listPageSize;
  }

  public async readManifest(
    locator: RepositoryLocator,
    signal?: AbortSignal,
  ): Promise<{ manifest: ManifestBytes; token: CommitToken } | undefined> {
    try {
      const blob = await this.driver(locator).getBlob({
        namespace: 'tenants',
        key: manifestKey(locator),
        tier: 'private',
        ...(signal === undefined ? {} : { signal }),
      });

      return { manifest: await collect(blob.body), token: { token: blob.etag } };
    } catch (error) {
      if (isS3ObjectMissing(error)) {
        return undefined;
      }

      throw error;
    }
  }

  // oxlint-disable-next-line max-params -- optional cancellation preserves the existing store port.
  public async commitManifest(
    locator: RepositoryLocator,
    next: ManifestBytes,
    expected: CommitToken | 'absent',
    signal?: AbortSignal,
  ): Promise<CommitToken | 'lost'> {
    const result = await this.driver(locator).putBlob({
      namespace: 'tenants',
      key: manifestKey(locator),
      body: next,
      contentType: manifestContentType,
      // One request per call: the committer's own loop owns the backoff, and
      // its `reconcile` owns "did a write that threw actually land" (FR21).
      singleAttempt: true,
      ...(signal === undefined ? {} : { signal }),
      tier: 'private',
      ...(expected === 'absent' ? { ifNoneMatch: '*' } : { ifMatch: expected.token }),
    });

    if (result.lost) {
      return 'lost';
    }

    return { token: result.etag };
  }

  // oxlint-disable-next-line max-params -- the port's putObject signature is the north star's.
  public async putObject(
    locator: RepositoryLocator,
    key: string,
    body: ObjectBody,
    options: PutObjectOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    if (typeof body === 'function') {
      await this.putStreamed(locator, key, body, options, signal);
      return;
    }

    if (options.contentLength !== body.byteLength) {
      throw new RangeError(
        `putObject declared ${String(options.contentLength)} bytes for '${key}' but the body is ${String(body.byteLength)}.`,
      );
    }

    if (body.byteLength > this.capabilities.maxObjectBytes) {
      await this.putMultipart(locator, key, bytesAsChunks(body), options, signal);
      return;
    }

    await this.driver(locator).putBlob({
      namespace: 'tenants',
      key: `${repositoryPrefix(locator)}${key}`,
      body,
      contentType: objectContentType,
      tier: 'private',
      checksumSha256: options.sha256,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  public async getObject(
    locator: RepositoryLocator,
    key: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    try {
      const blob = await this.driver(locator).getBlob({
        namespace: 'tenants',
        key: `${repositoryPrefix(locator)}${key}`,
        tier: 'private',
        ...(range === undefined ? {} : { range }),
      });

      return blob.body;
    } catch (error) {
      if (isS3ObjectMissing(error)) {
        throw new RepositoryStoreError('missing-pack', `the store holds no '${key}'`, { cause: error });
      }

      throw error;
    }
  }

  public async *listObjects(locator: RepositoryLocator, prefix: string): AsyncIterable<StoredObject> {
    const absolutePrefix = `${repositoryPrefix(locator)}${prefix}`;

    for await (const object of this.driver(locator).listObjects({
      namespace: 'tenants',
      keyPrefix: absolutePrefix,
      tier: 'private',
      ...(this.listPageSize === undefined ? {} : { pageSize: this.listPageSize }),
    })) {
      yield { ...object, key: object.key.slice(repositoryPrefix(locator).length) };
    }
  }

  public async deleteObjects(locator: RepositoryLocator, keys: readonly string[]): Promise<void> {
    await this.driver(locator).deleteBlobs({
      namespace: 'tenants',
      keys: keys.map((key) => `${repositoryPrefix(locator)}${key}`),
      tier: 'private',
    });
  }

  /**
   * Resolves the locator's opaque account id to a driver. Absent, or the Tau
   * default's own id, means the default account.
   *
   * Only the Tau default exists at launch (charter D26), so any other id is a
   * programming error rather than a lookup miss. W3 adds `storage_account` and
   * the descriptor lookup; this is the one place that changes.
   */
  private driver(locator: RepositoryLocator): ObjectStorageService {
    if (locator.accountId === undefined || locator.accountId === this.storage.account.id) {
      return this.storage;
    }

    throw new Error(
      `Unknown storage account '${locator.accountId}': only the Tau default account exists (charter D26).`,
    );
  }

  /**
   * A streamed write (DA4): memory is one stream chunk below the single-part
   * ceiling and one part above it, never the object.
   *
   * Below the ceiling it is one single-part PUT carrying `x-amz-checksum-sha256`,
   * the one place R2 verifies SHA-256 (W0b §2b, M4), so the integrity check is
   * the backend's, exactly as for a buffered body. The SDK will not resend a
   * stream, so a throttle, 5xx or dropped connection reopens the source and
   * sends the whole object again, up to the SDK's own three attempts; the key
   * is unique to this upload, so a resend never overwrites anything else.
   */
  // oxlint-disable-next-line max-params -- mirrors the store port's optional cancellation.
  private async putStreamed(
    locator: RepositoryLocator,
    key: string,
    source: ObjectSource,
    options: PutObjectOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    if (options.contentLength > this.capabilities.maxObjectBytes) {
      const stream = await source();
      try {
        await this.putMultipart(locator, key, lengthChecked(stream, key, options.contentLength), options, signal);
      } finally {
        stream.destroy();
      }
      return;
    }

    for (let attempt = 1; ; attempt += 1) {
      signal?.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- each attempt reopens the source; attempts cannot overlap
      const stream = await source();
      const body = lengthChecked(stream, key, options.contentLength);
      // The SDK's HTTP handler `pipe`s the body, which drops a body's error and
      // would leave the request waiting for bytes that never come. A failed
      // body (a refused length, a read error) therefore aborts the request, and
      // its own error is the one the caller sees.
      const bodyFailed = new AbortController();
      let bodyError: Error | undefined;
      body.once('error', (error) => {
        bodyError = error;
        bodyFailed.abort(error);
      });
      try {
        // oxlint-disable-next-line no-await-in-loop -- same reason
        await this.driver(locator).putBlobStream({
          namespace: 'tenants',
          key: `${repositoryPrefix(locator)}${key}`,
          body,
          contentLength: options.contentLength,
          contentType: objectContentType,
          tier: 'private',
          checksumSha256: options.sha256,
          signal: signal === undefined ? bodyFailed.signal : AbortSignal.any([signal, bodyFailed.signal]),
        });
        return;
      } catch (error) {
        if (bodyError !== undefined) {
          throw bodyError;
        }
        if (attempt >= streamedPutAttempts || signal?.aborted === true || !isRetryablePutFailure(error)) {
          throw error;
        }
      } finally {
        body.destroy();
        stream.destroy();
      }
      // oxlint-disable-next-line no-await-in-loop -- a retry is by definition sequential
      await delay(streamedPutBackoffMilliseconds(attempt), undefined, signal === undefined ? {} : { signal });
    }
  }

  /**
   * An object above the single-part ceiling, as parts of `multipartPartBytes`
   * read from `chunks` one at a time.
   *
   * R2 refuses a part checksum (W0b §2b), so off AWS the driver sends none and
   * nothing on the backend verifies SHA-256 for these bytes. The adapter
   * therefore hashes what it sends and aborts rather than completes when the
   * bytes do not match `options.sha256`, or their count `contentLength`: a
   * multipart object never becomes visible under a digest it does not have.
   */
  // oxlint-disable-next-line max-params -- mirrors the store port's optional cancellation.
  private async putMultipart(
    locator: RepositoryLocator,
    key: string,
    chunks: AsyncIterable<Uint8Array<ArrayBuffer>>,
    options: PutObjectOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    const driver = this.driver(locator);
    const resolvedKey = `${repositoryPrefix(locator)}${key}`;
    const uploadId = await driver.createMultipartUpload({
      namespace: 'tenants',
      key: resolvedKey,
      contentType: objectContentType,
      tier: 'private',
      ...(signal === undefined ? {} : { signal }),
    });

    try {
      const parts: Array<{ partNumber: number; etag: string; checksumSha256: string }> = [];
      const whole = createHash('sha256');
      let sent = 0;
      let partNumber = 1;
      for await (const bytes of partsOf(chunks, multipartPartBytes)) {
        whole.update(bytes);
        sent += bytes.byteLength;
        const checksumSha256 = createHash('sha256').update(bytes).digest('base64');
        // oxlint-disable-next-line no-await-in-loop -- parts upload sequentially so an abort has one boundary.
        const uploaded = await driver.uploadPart({
          namespace: 'tenants',
          key: resolvedKey,
          uploadId,
          partNumber,
          body: bytes,
          checksumSha256,
          tier: 'private',
          ...(signal === undefined ? {} : { signal }),
        });
        parts.push({ partNumber, etag: uploaded.etag, checksumSha256: uploaded.checksumSha256 });
        partNumber += 1;
      }

      if (sent !== options.contentLength) {
        throw new RangeError(
          `putObject declared ${String(options.contentLength)} bytes for '${key}' but sent ${String(sent)}.`,
        );
      }
      if (whole.digest('base64') !== options.sha256) {
        throw new Error(`the bytes uploaded for '${key}' do not hash to the declared SHA-256; the upload was aborted`);
      }

      await driver.completeMultipartUpload({
        namespace: 'tenants',
        key: resolvedKey,
        uploadId,
        parts,
        tier: 'private',
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      // The transfer signal is spent; await bounded cleanup with its own signal.
      await driver.abortMultipartUpload({
        namespace: 'tenants',
        key: resolvedKey,
        uploadId,
        tier: 'private',
        signal: AbortSignal.timeout(5000),
      });
      throw error;
    }
  }
}

const collect = async (body: Readable): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('unexpected readable chunk');
    }

    chunks.push(new Uint8Array(chunk));
  }

  return concatUint8Arrays(chunks);
};
