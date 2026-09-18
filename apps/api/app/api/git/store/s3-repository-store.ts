/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Injectable, Optional } from '@nestjs/common';
import { concatUint8Arrays } from '#storage/concat-uint8-arrays.js';
import { ObjectStorageService, isS3ObjectMissing } from '#storage/object-storage.service.js';
import type {
  CommitToken,
  ManifestBytes,
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
  ): Promise<{ manifest: ManifestBytes; token: CommitToken } | undefined> {
    try {
      const blob = await this.driver(locator).getBlob({
        namespace: 'tenants',
        key: manifestKey(locator),
        tier: 'private',
      });

      return { manifest: await collect(blob.body), token: { token: blob.etag } };
    } catch (error) {
      if (isS3ObjectMissing(error)) {
        return undefined;
      }

      throw error;
    }
  }

  public async commitManifest(
    locator: RepositoryLocator,
    next: ManifestBytes,
    expected: CommitToken | 'absent',
  ): Promise<CommitToken | 'lost'> {
    const result = await this.driver(locator).putBlob({
      namespace: 'tenants',
      key: manifestKey(locator),
      body: next,
      contentType: manifestContentType,
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
    body: Uint8Array<ArrayBuffer>,
    options: PutObjectOptions,
  ): Promise<void> {
    if (options.contentLength !== body.byteLength) {
      throw new RangeError(
        `putObject declared ${String(options.contentLength)} bytes for '${key}' but the body is ${String(body.byteLength)}.`,
      );
    }

    if (body.byteLength > this.capabilities.maxObjectBytes) {
      await this.putMultipart(locator, key, body);
      return;
    }

    await this.driver(locator).putBlob({
      namespace: 'tenants',
      key: `${repositoryPrefix(locator)}${key}`,
      body,
      contentType: objectContentType,
      tier: 'private',
      checksumSha256: options.sha256,
    });
  }

  public async getObject(
    locator: RepositoryLocator,
    key: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    const blob = await this.driver(locator).getBlob({
      namespace: 'tenants',
      key: `${repositoryPrefix(locator)}${key}`,
      tier: 'private',
      ...(range === undefined ? {} : { range }),
    });

    return blob.body;
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

  private async putMultipart(locator: RepositoryLocator, key: string, body: Uint8Array<ArrayBuffer>): Promise<void> {
    const driver = this.driver(locator);
    const resolvedKey = `${repositoryPrefix(locator)}${key}`;
    const uploadId = await driver.createMultipartUpload({
      namespace: 'tenants',
      key: resolvedKey,
      contentType: objectContentType,
      tier: 'private',
    });

    try {
      const parts: Array<{ partNumber: number; etag: string; checksumSha256: string }> = [];
      for (let offset = 0, partNumber = 1; offset < body.byteLength; offset += multipartPartBytes, partNumber += 1) {
        const bytes = body.slice(offset, Math.min(offset + multipartPartBytes, body.byteLength));
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
        });
        parts.push({ partNumber, etag: uploaded.etag, checksumSha256: uploaded.checksumSha256 });
      }

      await driver.completeMultipartUpload({
        namespace: 'tenants',
        key: resolvedKey,
        uploadId,
        parts,
        tier: 'private',
      });
    } catch (error) {
      await driver.abortMultipartUpload({ namespace: 'tenants', key: resolvedKey, uploadId, tier: 'private' });
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
