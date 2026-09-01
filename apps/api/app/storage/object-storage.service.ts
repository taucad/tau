import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
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

export type PutBlobArgs = {
  namespace: StorageNamespace;
  key: string;
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  cacheControl?: string;
  ifNoneMatch?: '*' | string;
  tier?: StorageTier;
};

export type PutBlobResult = { etag: string; alreadyExisted: boolean };

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
  presignGet(args: { namespace: StorageNamespace; key: string; expiresInSeconds: number }): Promise<string>;
  presignPut(args: {
    namespace: StorageNamespace;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;
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
  private readonly client: S3Client;

  private readonly bucket: string;

  private readonly privateBucket: string;

  private readonly publicBaseUrl: string;

  public constructor(private readonly configService: ConfigService<Environment, true>) {
    const endpoint = this.configService.get('TAU_S3_ENDPOINT', { infer: true });
    const region = this.configService.get('TAU_S3_REGION', { infer: true });
    const accessKeyId = this.configService.get('TAU_S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = this.configService.get('TAU_S3_SECRET_ACCESS_KEY', { infer: true });
    const forcePathStyle = this.configService.get('TAU_S3_FORCE_PATH_STYLE', { infer: true });

    this.bucket = this.configService.get('TAU_S3_BUCKET', { infer: true });
    this.privateBucket = this.configService.get('TAU_S3_PRIVATE_BUCKET', { infer: true });
    this.publicBaseUrl = this.configService.get('TAU_S3_PUBLIC_BASE_URL', { infer: true }).replace(/\/$/u, '');

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
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
          ...(args.ifNoneMatch === '*' ? { IfNoneMatch: '*' } : {}),
        }),
      );

      const etag = response.ETag?.replaceAll('"', '') ?? '';

      return { etag, alreadyExisted: false };
    } catch (error) {
      if (args.ifNoneMatch === '*' && isPreconditionFailed(error)) {
        return { etag: '', alreadyExisted: true };
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

  public async presignGet(args: {
    namespace: StorageNamespace;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);

    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: resolvedKey }), {
      expiresIn: args.expiresInSeconds,
    });
  }

  public async presignPut(args: {
    namespace: StorageNamespace;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const { resolvedKey } = this.resolveKey(args.namespace, args.key);

    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: resolvedKey,
        ContentType: args.contentType,
      }),
      { expiresIn: args.expiresInSeconds },
    );
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
