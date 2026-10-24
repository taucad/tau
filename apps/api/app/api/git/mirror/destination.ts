import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  PutObjectRetentionCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectSource } from '#api/git/store/port.js';

/**
 * Where the second copy is written (W13 B1, B2): an S3-compatible bucket under
 * compliance-mode Object Lock. B2 is the first destination; MinIO with Object
 * Lock stands in for it in tests.
 *
 * Two B2 facts from the DT0 trial (2026-10-24, us-east-005) shape the adapter:
 * every `PutObject` to a locked bucket must carry a checksum header or B2 answers
 * 400, so each one carries `x-amz-checksum-sha256` (which B2 verifies, T5); and
 * B2 implements no `If-None-Match` (501, T4), so nothing here sends it: the
 * copier writes create-once keys by listing versions before it writes.
 *
 * The port has **no delete and no hide** (W13 B7, B12). Deletion in the copy is
 * DX1's purge and collector, with a separate key this code never reads; hiding
 * is an S3 `DeleteObject` without a version id, which nothing here can send. The
 * S3 adapter below additionally refuses, at the client, every command outside
 * {@link allowedCommands}, so a later edit cannot reach one by accident.
 *
 * Every read is by **version** (W13 Finding 3): a stolen copy key can hide a
 * name, which removes it from name listing while its locked versions survive.
 * Discovery therefore lists versions and never names.
 */

/** One version in a version listing, or a hide marker (an S3 delete marker). */
export type DestinationVersion = {
  readonly key: string;
  readonly versionId: string;
  readonly bytes: number;
  readonly isHideMarker: boolean;
  readonly modifiedAt: Date | undefined;
};

/** What a `HEAD` of one version says. `sha256` is base64, present when the store kept the checksum. */
export type DestinationHead = {
  readonly versionId: string;
  readonly bytes: number;
  readonly retainUntil: Date | undefined;
  readonly sha256: string | undefined;
};

export type DestinationPutOptions = {
  readonly contentLength: number;
  /** Base64 SHA-256 the store verifies against the bytes it receives. */
  readonly sha256: string;
  /** Compliance-mode retain-until for the new version (W13 B6). */
  readonly retainUntil: Date;
};

export type MirrorDestination = {
  /** The label every `tau.mirror.*` series carries. */
  readonly name: 'b2';
  /** True when the store answers with this key's authority: a canary `HEAD` that is found or not found. */
  probe(signal?: AbortSignal): Promise<boolean>;
  /** Every version and hide marker under `prefix`, paginating internally. */
  listVersions(prefix: string, signal?: AbortSignal): AsyncIterable<DestinationVersion>;
  head(key: string, versionId: string, signal?: AbortSignal): Promise<DestinationHead | undefined>;
  /** Reads one version. */
  get(key: string, versionId: string, signal?: AbortSignal): Promise<Readable>;
  /** Writes a new version under compliance lock and returns its version id. */
  put(
    key: string,
    body: Uint8Array<ArrayBuffer> | ObjectSource,
    options: DestinationPutOptions,
    signal?: AbortSignal,
  ): Promise<{ versionId: string }>;
  /** Extends one version's compliance lock. Compliance mode refuses a shortening (W13 B6). */
  extendRetention(key: string, versionId: string, retainUntil: Date, signal?: AbortSignal): Promise<void>;
};

/** The only S3 commands the copier may send. No delete, no hide, no bucket or lock configuration. */
export const allowedCommands: ReadonlySet<string> = new Set([
  'ListObjectVersionsCommand',
  'HeadObjectCommand',
  'GetObjectCommand',
  'PutObjectCommand',
  'PutObjectRetentionCommand',
]);

/**
 * The commands a read-only holder may send: the restore (`TAU_S3_RESTORE_*`,
 * listFiles, readFiles, readFileRetentions) and `tau-mirror`'s verify drill. Its
 * key could not write anyway; the guard makes a write a local refusal too.
 */
export const readCommands: ReadonlySet<string> = new Set([
  'ListObjectVersionsCommand',
  'HeadObjectCommand',
  'GetObjectCommand',
]);

/** What restore and the drill read the copy through: version listing, `HEAD` and `GET` of one version. */
export type CopyReader = Pick<MirrorDestination, 'name' | 'listVersions' | 'head' | 'get'>;

/** Thrown at the client when code tries to send a command outside {@link allowedCommands}. */
export class ForbiddenDestinationCommandError extends Error {
  public constructor(command: string) {
    super(`tau-mirror never sends ${command} to the second copy (W13 B7)`);
    this.name = 'ForbiddenDestinationCommandError';
  }
}

/** The copy key's account (`TAU_S3_COPY_*`). */
export type DestinationAccount = {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly forcePathStyle: boolean;
  readonly credentials: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
};

/** The canary the probe heads; under `tenants/` because the copy key reaches nothing else. */
const canaryKey = 'tenants/.tau-mirror-canary';

const isNotFound = (error: unknown): boolean => {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined;
  return (
    candidate?.$metadata?.httpStatusCode === 404 || candidate?.name === 'NotFound' || candidate?.name === 'NoSuchKey'
  );
};

const isForbidden = (error: unknown): boolean =>
  (error as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata?.httpStatusCode === 403;

/** Refuses any command outside the allow-list before it is signed. */
const guardCommands = (client: S3Client, allowed: ReadonlySet<string>): void => {
  client.middlewareStack.add(
    (next, context) => async (arguments_) => {
      const command = context.commandName ?? 'UnknownCommand';
      if (!allowed.has(command)) {
        throw new ForbiddenDestinationCommandError(command);
      }
      return next(arguments_);
    },
    { step: 'initialize', name: 'tauMirrorCommandGuard' },
  );
};

/**
 * Sends a lock extension with `Content-MD5` and no flexible checksum. Under
 * `WHEN_REQUIRED` the SDK gives `PutObjectRetention` an `x-amz-checksum-crc32`;
 * DT0 proved the extension on B2 with `Content-MD5` only (`dt0-b2-lock-trial.mjs`),
 * so the request B2 sees is that one. Runs last in the build step, after the
 * checksum middleware and before signing, so the header is signed.
 */
const retentionContentMd5 = (client: S3Client): void => {
  client.middlewareStack.add(
    (next, context) => async (arguments_) => {
      const request = arguments_.request as { headers?: Record<string, string>; body?: unknown } | undefined;
      if (context.commandName === 'PutObjectRetentionCommand' && request?.headers !== undefined) {
        const body: unknown = request.body;
        request.headers = {
          ...Object.fromEntries(
            Object.entries(request.headers).filter(([name]) => {
              const lower = name.toLowerCase();
              return !lower.startsWith('x-amz-checksum-') && lower !== 'x-amz-sdk-checksum-algorithm';
            }),
          ),
          'content-md5': createHash('md5')
            .update(typeof body === 'string' || body instanceof Uint8Array ? body : '')
            .digest('base64'),
        };
      }
      return next(arguments_);
    },
    { step: 'build', priority: 'low', name: 'tauMirrorRetentionContentMd5' },
  );
};

/* eslint-disable @typescript-eslint/naming-convention -- AWS SDK inputs are PascalCase */

/** The S3 adapter: B2's S3-compatible API, or MinIO with Object Lock. */
export class S3MirrorDestination implements MirrorDestination {
  public get name(): 'b2' {
    return 'b2';
  }

  private readonly client: S3Client;

  private readonly bucket: string;

  /**
   * @param account - The bucket and the key that reaches it.
   * @param client - A client to reuse (tests).
   * @param options - `readOnly` narrows the guard to {@link readCommands}.
   */
  public constructor(account: DestinationAccount, client?: S3Client, options: { readOnly?: boolean } = {}) {
    this.bucket = account.bucket;
    this.client =
      client ??
      new S3Client({
        endpoint: account.endpoint,
        region: account.region,
        forcePathStyle: account.forcePathStyle,
        credentials: { ...account.credentials },
        // B2 rejects the SDK's default CRC32 trailers; send a checksum only where the operation needs one (L8).
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    guardCommands(this.client, options.readOnly === true ? readCommands : allowedCommands);
    retentionContentMd5(this.client);
  }

  /**
   * A one-key version listing of the canary prefix. Not a `HEAD`: B2 answers a
   * `HEAD` of an absent key with 403 for a bucket-scoped key (DT0 2c), which a
   * probe could not tell from a revoked one. A listing answers 200 when the key
   * works, absent or not, and 403 only when it does not.
   */
  public async probe(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: this.bucket,
          Prefix: canaryKey,
          MaxKeys: 1,
        }),
        { abortSignal: signal },
      );
      return true;
    } catch {
      return false;
    }
  }

  public async *listVersions(prefix: string, signal?: AbortSignal): AsyncIterable<DestinationVersion> {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      // oxlint-disable-next-line no-await-in-loop -- version listing pages are sequential by marker
      const page = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(keyMarker === undefined ? {} : { KeyMarker: keyMarker }),
          ...(versionIdMarker === undefined ? {} : { VersionIdMarker: versionIdMarker }),
        }),
        { abortSignal: signal },
      );
      for (const version of page.Versions ?? []) {
        if (version.Key !== undefined && version.VersionId !== undefined) {
          yield {
            key: version.Key,
            versionId: version.VersionId,
            bytes: Number(version.Size ?? 0),
            isHideMarker: false,
            modifiedAt: version.LastModified,
          };
        }
      }
      for (const marker of page.DeleteMarkers ?? []) {
        if (marker.Key !== undefined) {
          yield {
            key: marker.Key,
            versionId: marker.VersionId ?? '',
            bytes: 0,
            isHideMarker: true,
            modifiedAt: marker.LastModified,
          };
        }
      }
      const truncated = page.IsTruncated === true;
      keyMarker = truncated ? page.NextKeyMarker : undefined;
      versionIdMarker = truncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker !== undefined);
  }

  /**
   * A `HEAD` of one version. B2 answers 403, not 404, for a version or key that
   * is not there (DT0 2c), so a 403 is "absent" only when a version listing of
   * the key agrees; otherwise it is a real refusal and is raised.
   */
  public async head(key: string, versionId: string, signal?: AbortSignal): Promise<DestinationHead | undefined> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
          VersionId: versionId,
          ChecksumMode: 'ENABLED',
        }),
        { abortSignal: signal },
      );
      return {
        versionId: response.VersionId ?? versionId,
        bytes: Number(response.ContentLength ?? 0),
        retainUntil: response.ObjectLockRetainUntilDate,
        sha256: response.ChecksumSHA256,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      if (isForbidden(error) && !(await this.listsVersion(key, versionId, signal))) {
        return undefined;
      }
      throw error;
    }
  }

  public async get(key: string, versionId: string, signal?: AbortSignal): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        VersionId: versionId,
      }),
      {
        abortSignal: signal,
      },
    );
    if (!response.Body || !(typeof response.Body === 'object' && 'pipe' in response.Body)) {
      throw new Error('the second copy returned an empty body');
    }
    return response.Body as Readable;
  }

  // oxlint-disable-next-line max-params -- the port's own signature, with optional cancellation
  public async put(
    key: string,
    body: Uint8Array<ArrayBuffer> | ObjectSource,
    options: DestinationPutOptions,
    signal?: AbortSignal,
  ): Promise<{ versionId: string }> {
    const payload = typeof body === 'function' ? await body() : body;
    try {
      const response = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: payload,
          ContentLength: options.contentLength,
          ContentType: key.endsWith('.json') ? 'application/json' : 'application/octet-stream',
          ChecksumSHA256: options.sha256,
          ObjectLockMode: 'COMPLIANCE',
          ObjectLockRetainUntilDate: options.retainUntil,
        }),
        { abortSignal: signal },
      );
      if (response.VersionId === undefined) {
        throw new Error(`the second copy returned no version id for '${key}': is versioning (Object Lock) on?`);
      }
      return { versionId: response.VersionId };
    } finally {
      if (typeof body === 'function') {
        (payload as Readable).destroy();
      }
    }
  }

  // oxlint-disable-next-line max-params -- one version, its new lock, and optional cancellation
  public async extendRetention(key: string, versionId: string, retainUntil: Date, signal?: AbortSignal): Promise<void> {
    await this.client.send(
      new PutObjectRetentionCommand({
        Bucket: this.bucket,
        Key: key,
        VersionId: versionId,
        Retention: { Mode: 'COMPLIANCE', RetainUntilDate: retainUntil },
      }),
      { abortSignal: signal },
    );
  }

  public destroy(): void {
    this.client.destroy();
  }

  private async listsVersion(key: string, versionId: string, signal?: AbortSignal): Promise<boolean> {
    for await (const version of this.listVersions(key, signal)) {
      if (version.key === key && version.versionId === versionId && !version.isHideMarker) {
        return true;
      }
    }
    return false;
  }
}
/* eslint-enable @typescript-eslint/naming-convention -- end AWS SDK inputs */
