import type { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { STORAGE_HEALTH_PROBE_KEY, STORAGE_NAMESPACE_PREFIXES } from '#storage/storage.constants.js';
import type { StorageNamespace } from '#storage/storage.constants.js';

/* eslint-disable @typescript-eslint/naming-convention -- AWS SDK command inputs use PascalCase fields */

/**
 * Physical bucket selector. `public` is the CDN-served content bucket
 * (anonymous read); `private` is the fail-closed bucket with no custom
 * domain — readable only through the API's S3 credentials, so private
 * publication bytes are never anonymously fetchable.
 */
export type StorageTier = 'public' | 'private';

/**
 * Where a tenant's authoritative bytes live: endpoint, region, bucket and
 * credentials. Tau's own account is the only one that exists at launch
 * (charter D26); `project.storage_account_id` and credential decryption are
 * W3's, so this descriptor deliberately carries no secret handling of its own.
 */
export type StorageAccount = {
  /** Stable identity used to decide whether a scoped driver is needed. */
  id: string;
  endpoint: string;
  region: string;
  /** The account's single bucket. For the Tau default this is the public content bucket. */
  bucket: string;
  forcePathStyle: boolean;
  credentials: { accessKeyId: string; secretAccessKey: string };
};

/** Identity of the account the environment configures. */
export const TAU_DEFAULT_STORAGE_ACCOUNT_ID = 'tau-default';

export type PutBlobArgs = {
  namespace: StorageNamespace;
  key: string;
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  cacheControl?: string;
  /** `'*'` creates only when absent; any other value is an ETag precondition. Both are forwarded. */
  ifNoneMatch?: '*' | string;
  /** ETag precondition for a compare-and-swap write. A refusal is reported, never thrown. */
  ifMatch?: string;
  /** Base64 SHA-256 the backend verifies against the received bytes. */
  checksumSha256?: string;
  tier?: StorageTier;
};

/**
 * The outcome of a put, discriminated on `lost` so a caller cannot read an
 * ETag that a refused write never produced.
 *
 * `lost` is true whenever a precondition refused the write — a `412`, or the
 * `404`/`NoSuchKey` an `ifMatch` against an absent key produces (AR-A E7).
 * `alreadyExisted` is its `ifNoneMatch: '*'` spelling, kept for the callers
 * that predate conditional writes. An unconditional put is never lost.
 */
export type PutBlobResult =
  | { lost: false; etag: string; alreadyExisted: boolean }
  | { lost: true; alreadyExisted: boolean };

/** One object in a prefix listing, keyed relative to its namespace. */
export type ListedObject = { key: string; bytes: number; modifiedAt: Date | undefined };

export type ObjectStorageServiceContract = {
  putBlob(args: PutBlobArgs): Promise<PutBlobResult>;
  getBlob(args: {
    namespace: StorageNamespace;
    key: string;
    range?: { start: number; end: number };
    tier?: StorageTier;
  }): Promise<{ body: Readable; contentType: string; etag: string; contentLength?: number }>;
  headBlob(args: { namespace: StorageNamespace; key: string; tier?: StorageTier }): Promise<
    | {
        contentType: string;
        size: number;
        etag: string;
        cacheControl: string;
      }
    | undefined
  >;
  deleteBlob(args: { namespace: StorageNamespace; key: string; tier?: StorageTier }): Promise<void>;
  deleteBlobs(args: {
    namespace: StorageNamespace;
    keys: readonly string[];
    tier?: StorageTier;
  }): Promise<{ deleted: number }>;
  listObjects(args: {
    namespace: StorageNamespace;
    keyPrefix: string;
    tier?: StorageTier;
    pageSize?: number;
  }): AsyncIterable<ListedObject>;
  presignGet(args: {
    namespace: StorageNamespace;
    key: string;
    expiresInSeconds: number;
    tier?: StorageTier;
  }): Promise<string>;
  presignPut(args: {
    namespace: StorageNamespace;
    key: string;
    contentType: string;
    expiresInSeconds: number;
    contentLength?: number;
    checksumSha256?: string;
    tier?: StorageTier;
  }): Promise<string>;
  createMultipartUpload(args: {
    namespace: StorageNamespace;
    key: string;
    contentType: string;
    tier?: StorageTier;
  }): Promise<string>;
  uploadPart?(args: {
    namespace: StorageNamespace;
    key: string;
    uploadId: string;
    partNumber: number;
    body: Uint8Array<ArrayBuffer>;
    checksumSha256: string;
    tier?: StorageTier;
  }): Promise<{ etag: string; checksumSha256: string }>;
  presignUploadPart(args: {
    namespace: StorageNamespace;
    key: string;
    uploadId: string;
    partNumber: number;
    checksumSha256: string;
    expiresInSeconds: number;
    tier?: StorageTier;
  }): Promise<string>;
  completeMultipartUpload(args: {
    namespace: StorageNamespace;
    key: string;
    uploadId: string;
    parts: ReadonlyArray<{ partNumber: number; etag: string; checksumSha256: string }>;
    tier?: StorageTier;
  }): Promise<void>;
  abortMultipartUpload(args: {
    namespace: StorageNamespace;
    key: string;
    uploadId: string;
    tier?: StorageTier;
  }): Promise<void>;
  copyBlob?(args: {
    namespace: StorageNamespace;
    sourceKey: string;
    destinationKey: string;
    tier?: StorageTier;
  }): Promise<void>;
  listBlobs?(args: {
    namespace: StorageNamespace;
    keyPrefix: string;
    tier?: StorageTier;
  }): Promise<ReadonlyArray<{ key: string; size: number; lastModified: Date | undefined }>>;
  publicUrl(args: { namespace: StorageNamespace; key: string }): string;
  headProbeObject(): Promise<
    | {
        etag: string;
        size: number;
        contentType: string;
        cacheControl: string;
      }
    | undefined
  >;
  headPrivateBucket(): Promise<boolean>;
};

/** Maximum keys one `DeleteObjects` request accepts, per the S3 API. */
const DELETE_OBJECTS_BATCH_SIZE = 1000;

/**
 * True only for "this key does not exist". Deliberately narrower than
 * {@link isS3ObjectMissing}: a `404 NoSuchBucket` is a misconfiguration and
 * must not be reported as a lost conditional write.
 */
const isNoSuchKey = (error: unknown): boolean =>
  error !== null &&
  typeof error === 'object' &&
  'name' in error &&
  ((error as { name: string }).name === 'NoSuchKey' || (error as { name: string }).name === 'NotFound');

/**
 * True only for genuine AWS S3, the endpoint the SDK's default checksum mode
 * was designed against.
 *
 * Charter D8 puts every other endpoint on `WHEN_REQUIRED`, which still sends
 * the checksums an operation requires (`DeleteObjects`) and the ones callers
 * pass explicitly (multipart SHA-256, `checksumSha256`), and stops the SDK
 * adding a CRC32 trailer of its own to every request.
 *
 * What is actually established: the local MinIO accepts a default-mode put, so
 * `WHEN_REQUIRED` is not a fix for a reproduced MinIO failure. It is the mode
 * D8 specifies for non-AWS endpoints, and the R2 evidence is owed by W0b.
 */
const isAwsEndpoint = (endpoint: string): boolean => {
  try {
    return new URL(endpoint).hostname.endsWith('.amazonaws.com');
  } catch {
    return false;
  }
};

export const isPreconditionFailed = (error: unknown): boolean =>
  error !== null &&
  typeof error === 'object' &&
  'name' in error &&
  (error as { name: string }).name === 'PreconditionFailed';

export const isS3ObjectMissing = (error: unknown): boolean => {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.$metadata?.httpStatusCode === 404 || candidate.name === 'NotFound' || candidate.name === 'NoSuchKey';
};

@Injectable()
export class ObjectStorageService implements ObjectStorageServiceContract {
  /** The storage account this instance addresses. See {@link forAccount}. */
  public readonly account: StorageAccount;

  private readonly client: S3Client;

  private readonly bucket: string;

  private readonly privateBucket: string;

  private readonly publicBaseUrl: string;

  // Pnpm currently resolves the presigner and S3 client through two compatible
  // @smithy/types patch versions. Keep that package-manager detail at this
  // boundary instead of leaking casts into every caller.
  private readonly signingClient: Parameters<typeof getSignedUrl>[0];

  public constructor(
    private readonly configService: ConfigService<Environment, true>,
    // oxlint-disable-next-line eslint/new-cap -- Nest's Optional decorator is a function by contract.
    @Optional() scopedAccount?: StorageAccount,
  ) {
    const configuredEndpoint = this.configService.get('TAU_S3_ENDPOINT', { infer: true });
    const configuredRegion = this.configService.get('TAU_S3_REGION', { infer: true });
    const configuredAccessKeyId = this.configService.get('TAU_S3_ACCESS_KEY_ID', { infer: true });
    const configuredSecretAccessKey = this.configService.get('TAU_S3_SECRET_ACCESS_KEY', { infer: true });
    const configuredForcePathStyle = this.configService.get('TAU_S3_FORCE_PATH_STYLE', { infer: true });

    const endpoint = scopedAccount?.endpoint ?? configuredEndpoint;
    const region = scopedAccount?.region ?? configuredRegion;
    const accessKeyId = scopedAccount?.credentials.accessKeyId ?? configuredAccessKeyId;
    const secretAccessKey = scopedAccount?.credentials.secretAccessKey ?? configuredSecretAccessKey;
    const forcePathStyle = scopedAccount?.forcePathStyle ?? configuredForcePathStyle;

    // A non-default account has one bucket, so both tiers resolve to it: the
    // public/private split is Tau's own CDN arrangement, and publications are
    // never placed in another account's bucket.
    this.bucket = scopedAccount?.bucket ?? this.configService.get('TAU_S3_BUCKET', { infer: true });
    this.privateBucket = scopedAccount?.bucket ?? this.configService.get('TAU_S3_PRIVATE_BUCKET', { infer: true });
    this.publicBaseUrl =
      scopedAccount === undefined
        ? this.configService.get('TAU_S3_PUBLIC_BASE_URL', { infer: true }).replace(/\/$/u, '')
        : '';

    this.account = scopedAccount ?? {
      id: TAU_DEFAULT_STORAGE_ACCOUNT_ID,
      endpoint,
      region,
      bucket: this.bucket,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    };

    const clientConfig: S3ClientConfig = {
      region,
      endpoint,
      forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    if (!isAwsEndpoint(endpoint)) {
      clientConfig.requestChecksumCalculation = 'WHEN_REQUIRED';
      clientConfig.responseChecksumValidation = 'WHEN_REQUIRED';
    }

    this.client = new S3Client(clientConfig);
    this.signingClient = this.client as unknown as Parameters<typeof getSignedUrl>[0];
  }

  /**
   * Returns a driver bound to `account`. The Tau default account returns this
   * instance; any other account builds one client for that endpoint.
   *
   * Only the Tau default exists at launch (charter D26), so there is
   * deliberately no registry and no client cache: a second account arrives
   * with `storage_account` in W3, and the cache belongs with it.
   */
  public forAccount(account: StorageAccount): ObjectStorageService {
    if (account.id === this.account.id) {
      return this;
    }

    return new ObjectStorageService(this.configService, account);
  }

  public async putBlob(args: PutBlobArgs): Promise<PutBlobResult> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);

    try {
      const response = await this.client.send(
        new PutObjectCommand({
          Bucket: this.resolveBucket(args.tier),
          Key: resolvedKey,
          Body: args.body,
          ContentType: args.contentType,
          ...(args.cacheControl ? { CacheControl: args.cacheControl } : {}),
          ...(args.ifNoneMatch === undefined ? {} : { IfNoneMatch: args.ifNoneMatch }),
          ...(args.ifMatch === undefined ? {} : { IfMatch: args.ifMatch }),
          ...(args.checksumSha256 === undefined ? {} : { ChecksumSHA256: args.checksumSha256 }),
        }),
      );

      const etag = response.ETag?.replaceAll('"', '') ?? '';

      return { lost: false, etag, alreadyExisted: false };
    } catch (error) {
      const conditional = args.ifNoneMatch !== undefined || args.ifMatch !== undefined;

      // A conditional write that loses is an outcome, not a fault. MinIO and R2
      // answer `404 NoSuchKey` rather than `412` when an `If-Match` names an
      // absent key (AR-A E7); that is a lost race, never a create.
      const absentTarget = args.ifMatch !== undefined && isNoSuchKey(error);

      if (conditional && (isPreconditionFailed(error) || absentTarget)) {
        return { lost: true, alreadyExisted: args.ifNoneMatch === '*' };
      }

      throw error;
    }
  }

  public async getBlob(args: {
    namespace: StorageNamespace;
    key: string;
    range?: { start: number; end: number };
    tier?: StorageTier;
  }): Promise<{ body: Readable; contentType: string; etag: string; contentLength?: number }> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.resolveBucket(args.tier),
        Key: resolvedKey,
        ...(args.range ? { Range: `bytes=${String(args.range.start)}-${String(args.range.end)}` } : {}),
      }),
    );

    if (!response.Body || !(typeof response.Body === 'object' && 'pipe' in response.Body)) {
      throw new Error('S3 GetObject returned empty body');
    }

    return {
      body: response.Body as Readable,
      contentType: response.ContentType ?? 'application/octet-stream',
      etag: response.ETag?.replaceAll('"', '') ?? '',
      ...(response.ContentLength === undefined ? {} : { contentLength: Number(response.ContentLength) }),
    };
  }

  public async headBlob(args: { namespace: StorageNamespace; key: string; tier?: StorageTier }): Promise<
    | {
        contentType: string;
        size: number;
        etag: string;
        cacheControl: string;
      }
    | undefined
  > {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);

    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.resolveBucket(args.tier),
          Key: resolvedKey,
        }),
      );

      return {
        contentType: response.ContentType ?? 'application/octet-stream',
        size: Number(response.ContentLength ?? 0),
        etag: response.ETag?.replaceAll('"', '') ?? '',
        cacheControl: response.CacheControl ?? '',
      };
    } catch (error) {
      if (isS3ObjectMissing(error)) {
        return undefined;
      }

      throw error;
    }
  }

  public async deleteBlob(args: { namespace: StorageNamespace; key: string; tier?: StorageTier }): Promise<void> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.resolveBucket(args.tier),
        Key: resolvedKey,
      }),
    );
  }

  /**
   * Deletes the named keys in `DeleteObjects` batches. Deleting a key that was
   * never written is not an error, so this is safe to call with a manifest's
   * retired-pack list after a partial sweep.
   */
  public async deleteBlobs(args: {
    namespace: StorageNamespace;
    keys: readonly string[];
    tier?: StorageTier;
  }): Promise<{ deleted: number }> {
    const bucket = this.resolveBucket(args.tier);
    let deleted = 0;

    for (let offset = 0; offset < args.keys.length; offset += DELETE_OBJECTS_BATCH_SIZE) {
      const batch = args.keys.slice(offset, offset + DELETE_OBJECTS_BATCH_SIZE);
      // oxlint-disable-next-line no-await-in-loop -- batches are sequential so a failure stops the sweep.
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((key) => ({ Key: this.resolveKey(args.namespace, key).resolvedKey })) },
        }),
      );

      const failure = response.Errors?.[0];
      if (failure !== undefined) {
        throw new Error(
          `S3 DeleteObjects failed for ${failure.Key ?? '<unknown>'}: ${failure.Message ?? failure.Code ?? 'unknown error'}`,
        );
      }

      deleted += batch.length;
    }

    return { deleted };
  }

  /**
   * Deletes every object under a namespace-relative prefix and reports what it
   * listed and removed.
   *
   * Charter D31: the purge job is the only permitted caller, gated on a
   * tombstone whose `purge_after` has passed, planning before it deletes and
   * requiring explicit confirmation above a bounded object count. No request
   * path and no other job may call this. With no bucket versioning, no object
   * lock and no second copy yet, an unbounded prefix delete is the one
   * irrecoverable action the system can take — hence the name.
   *
   * The repository-store conformance suite is the single sanctioned exception
   * (D32): it runs against a dedicated scratch bucket, under a tenant prefix it
   * created itself, and never against `tau-staging-content*`.
   */
  public async deleteEntirePrefixForPurgeJob(args: {
    namespace: StorageNamespace;
    keyPrefix: string;
    tier?: StorageTier;
  }): Promise<{ listed: number; deleted: number }> {
    const keys: string[] = [];
    for await (const object of this.listObjects(args)) {
      keys.push(object.key);
    }

    const { deleted } = await this.deleteBlobs({
      namespace: args.namespace,
      keys,
      ...(args.tier === undefined ? {} : { tier: args.tier }),
    });

    return { listed: keys.length, deleted };
  }

  /**
   * Yields every object under a namespace-relative prefix, following
   * continuation tokens. `pageSize` exists so tests can force pagination
   * without writing a thousand objects; production leaves it at the S3 default.
   */
  public async *listObjects(args: {
    namespace: StorageNamespace;
    keyPrefix: string;
    tier?: StorageTier;
    pageSize?: number;
  }): AsyncIterable<ListedObject> {
    const prefix = this.resolveKey(args.namespace, args.keyPrefix).resolvedKey;
    const namespacePrefix = STORAGE_NAMESPACE_PREFIXES[args.namespace];
    const bucket = this.resolveBucket(args.tier);
    let continuationToken: string | undefined;

    do {
      // oxlint-disable-next-line no-await-in-loop -- S3 pagination is sequential by token.
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ...(args.pageSize === undefined ? {} : { MaxKeys: args.pageSize }),
          ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
        }),
      );

      for (const object of response.Contents ?? []) {
        if (object.Key !== undefined) {
          yield {
            key: object.Key.slice(namespacePrefix.length),
            bytes: Number(object.Size ?? 0),
            modifiedAt: object.LastModified,
          };
        }
      }

      continuationToken = response.IsTruncated === true ? response.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
  }

  public async presignGet(args: {
    namespace: StorageNamespace;
    key: string;
    expiresInSeconds: number;
    tier?: StorageTier;
  }): Promise<string> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);

    return this.presign(
      new GetObjectCommand({ Bucket: this.resolveBucket(args.tier), Key: resolvedKey }),
      args.expiresInSeconds,
    );
  }

  public async presignPut(args: {
    namespace: StorageNamespace;
    key: string;
    contentType: string;
    expiresInSeconds: number;
    contentLength?: number;
    checksumSha256?: string;
    tier?: StorageTier;
  }): Promise<string> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);

    return this.presign(
      new PutObjectCommand({
        Bucket: this.resolveBucket(args.tier),
        Key: resolvedKey,
        ContentType: args.contentType,
        ...(args.contentLength === undefined ? {} : { ContentLength: args.contentLength }),
        ...(args.checksumSha256 === undefined ? {} : { ChecksumSHA256: args.checksumSha256 }),
      }),
      args.expiresInSeconds,
    );
  }

  public async createMultipartUpload(args: {
    namespace: StorageNamespace;
    key: string;
    contentType: string;
    tier?: StorageTier;
  }): Promise<string> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.resolveBucket(args.tier),
        Key: resolvedKey,
        ContentType: args.contentType,
        ChecksumAlgorithm: 'SHA256',
      }),
    );
    if (!response.UploadId) {
      throw new Error('S3 CreateMultipartUpload returned no upload ID');
    }
    return response.UploadId;
  }

  public async presignUploadPart(args: {
    namespace: StorageNamespace;
    key: string;
    uploadId: string;
    partNumber: number;
    checksumSha256: string;
    expiresInSeconds: number;
    tier?: StorageTier;
  }): Promise<string> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);
    return this.presign(
      new UploadPartCommand({
        Bucket: this.resolveBucket(args.tier),
        Key: resolvedKey,
        UploadId: args.uploadId,
        PartNumber: args.partNumber,
        ChecksumSHA256: args.checksumSha256,
      }),
      args.expiresInSeconds,
    );
  }

  public async uploadPart(args: {
    namespace: StorageNamespace;
    key: string;
    uploadId: string;
    partNumber: number;
    body: Uint8Array<ArrayBuffer>;
    checksumSha256: string;
    tier?: StorageTier;
  }): Promise<{ etag: string; checksumSha256: string }> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);
    const response = await this.client.send(
      new UploadPartCommand({
        Bucket: this.resolveBucket(args.tier),
        Key: resolvedKey,
        UploadId: args.uploadId,
        PartNumber: args.partNumber,
        Body: args.body,
        ChecksumSHA256: args.checksumSha256,
      }),
    );
    return {
      etag: response.ETag?.replaceAll('"', '') ?? '',
      checksumSha256: response.ChecksumSHA256 ?? args.checksumSha256,
    };
  }

  public async completeMultipartUpload(args: {
    namespace: StorageNamespace;
    key: string;
    uploadId: string;
    parts: ReadonlyArray<{ partNumber: number; etag: string; checksumSha256: string }>;
    tier?: StorageTier;
  }): Promise<void> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.resolveBucket(args.tier),
        Key: resolvedKey,
        UploadId: args.uploadId,
        MultipartUpload: {
          Parts: args.parts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
            ChecksumSHA256: part.checksumSha256,
          })),
        },
      }),
    );
  }

  public async abortMultipartUpload(args: {
    namespace: StorageNamespace;
    key: string;
    uploadId: string;
    tier?: StorageTier;
  }): Promise<void> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.resolveBucket(args.tier),
        Key: resolvedKey,
        UploadId: args.uploadId,
      }),
    );
  }

  public async copyBlob(args: {
    namespace: StorageNamespace;
    sourceKey: string;
    destinationKey: string;
    tier?: StorageTier;
  }): Promise<void> {
    const bucket = this.resolveBucket(args.tier);
    const source = this.resolveKey(args.namespace, args.sourceKey).resolvedKey;
    const destination = this.resolveKey(args.namespace, args.destinationKey).resolvedKey;
    await this.client.send(
      new CopyObjectCommand({ Bucket: bucket, Key: destination, CopySource: `${bucket}/${source}` }),
    );
  }

  public async listBlobs(args: {
    namespace: StorageNamespace;
    keyPrefix: string;
    tier?: StorageTier;
  }): Promise<ReadonlyArray<{ key: string; size: number; lastModified: Date | undefined }>> {
    const objects: Array<{ key: string; size: number; lastModified: Date | undefined }> = [];
    for await (const object of this.listObjects(args)) {
      objects.push({ key: object.key, size: object.bytes, lastModified: object.modifiedAt });
    }
    return objects;
  }

  /**
   * The physical bucket a tier resolves to on this account. Exposed so a
   * destructive test suite can apply the D32 allowlist to the bucket it will
   * actually write to, which for the default account differs per tier and is
   * never `account.bucket` for the private tier.
   */
  public bucketFor(tier?: StorageTier): string {
    return this.resolveBucket(tier);
  }

  public publicUrl(args: { namespace: StorageNamespace; key: string }): string {
    const prefix = STORAGE_NAMESPACE_PREFIXES[args.namespace];
    const encodedKey = args.key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${this.publicBaseUrl}/${prefix}${encodedKey}`;
  }

  /**
   * Issues HeadObject against the bucket-root health probe key (`__health/probe.txt`).
   * NOT namespace-prefixed — the probe lives outside all namespace prefixes so that
   * the `/__health/*` no-store cache rule never interferes with namespace paths.
   * Used only by `S3HealthIndicator`.
   */
  public async headProbeObject(): Promise<
    | {
        etag: string;
        size: number;
        contentType: string;
        cacheControl: string;
      }
    | undefined
  > {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: STORAGE_HEALTH_PROBE_KEY,
        }),
      );

      return {
        etag: response.ETag?.replaceAll('"', '') ?? '',
        size: Number(response.ContentLength ?? 0),
        contentType: response.ContentType ?? 'text/plain',
        cacheControl: response.CacheControl ?? '',
      };
    } catch (error) {
      if (isS3ObjectMissing(error)) {
        return undefined;
      }

      throw error;
    }
  }

  /**
   * Verifies the fail-closed private bucket is provisioned and reachable.
   * Used by `S3HealthIndicator` so a deploy missing the paired
   * `repos/tau-cloud` private-bucket change fails readiness instead of
   * 500ing on the first private publish.
   */
  public async headPrivateBucket(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.privateBucket }));
      return true;
    } catch (error) {
      if (isS3ObjectMissing(error)) {
        return false;
      }

      throw error;
    }
  }

  private async presign(command: unknown, expiresIn: number): Promise<string> {
    return getSignedUrl(this.signingClient, command as Parameters<typeof getSignedUrl>[1], { expiresIn });
  }

  /**
   * Resolves a namespace + namespace-relative key to the physical bucket key.
   * Prefix already ends with `/`, so concatenation is always correct:
   * `blobs/` + `ab/cde...` → `blobs/ab/cde...`
   */
  private resolveKey(namespace: StorageNamespace, key: string): { resolvedKey: string } {
    return { resolvedKey: `${STORAGE_NAMESPACE_PREFIXES[namespace]}${key}` };
  }

  private resolveBucket(tier: StorageTier | undefined): string {
    return tier === 'private' ? this.privateBucket : this.bucket;
  }
}
/* eslint-enable @typescript-eslint/naming-convention -- end AWS SDK PascalCase inputs scope */
