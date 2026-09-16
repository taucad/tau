/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
/* eslint-disable @typescript-eslint/naming-convention -- git-lfs wire fields are snake_case */
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import type { GitAccess } from '#api/git/git.service.js';

/** Presigned transfers are short-lived; a push uploads immediately. */
const transferExpirySeconds = 900;
const objectContentType = 'application/octet-stream';

type LfsObjectRequest = { readonly oid: string; readonly size: number };

type LfsAction = {
  readonly href: string;
  readonly header?: Readonly<Record<string, string>>;
  readonly expires_in: number;
};

type LfsObjectResponse = {
  readonly oid: string;
  readonly size: number;
  readonly authenticated: true;
  readonly actions?: Readonly<Record<string, LfsAction>>;
  readonly error?: { readonly code: number; readonly message: string };
};

export type LfsBatchResponse = {
  readonly transfer: 'basic';
  readonly objects: readonly LfsObjectResponse[];
};

/**
 * Git-lfs reads `message` from an error body and shows it to the user, so a
 * refusal is answered in git-lfs's own shape rather than the API's envelope —
 * `files` is the list D16/AC16 require, which the client maps back to paths.
 */
export type LfsQuotaRefusal = {
  readonly message: string;
  readonly code: 'GIT_LFS_QUOTA_EXCEEDED';
  readonly shortfallBytes: number;
  readonly remainingBytes: number;
  readonly files: ReadonlyArray<{ readonly oid: string; readonly size: number }>;
};

export type LfsBatchOutcome =
  | { readonly status: 200; readonly body: LfsBatchResponse }
  | { readonly status: 413; readonly body: LfsQuotaRefusal };

/**
 * The Tau Hosted Remote's LFS store: git-lfs's batch API in front of presigned
 * R2 transfers (A24, S49). Objects live at git-lfs's own `oid` layout under a
 * per-project prefix in the private bucket, so the bytes a stock `git lfs push`
 * uploads are the bytes a stock `git lfs pull` reads back.
 */
@Injectable()
export class GitLfsService {
  public constructor(
    private readonly objectStorage: ObjectStorageService,
    private readonly repositories: GitRepositoryService,
  ) {}

  public async batch(args: {
    access: GitAccess;
    operation: 'upload' | 'download';
    objects: readonly LfsObjectRequest[];
    /** The caller's own credential, echoed so git-lfs can call `verify`. */
    authorization: string | undefined;
    /** Absolute base of this repository's LFS endpoints. */
    endpoint: string;
  }): Promise<LfsBatchOutcome> {
    if (args.operation === 'download') {
      const records = await this.repositories.readLfsObjects(
        args.access.projectId,
        args.objects.map((object) => object.oid),
      );
      const finalized = new Map(records.map((object) => [object.oid, object]));
      return {
        status: 200,
        body: {
          transfer: 'basic',
          objects: await Promise.all(
            args.objects.map(async (object): Promise<LfsObjectResponse> => {
              const record = finalized.get(object.oid);
              const stored =
                record?.finalized === true && record.size === object.size
                  ? await this.objectStorage.headBlob({
                      namespace: 'blobs',
                      key: gitLfsObjectKey(args.access.projectId, object.oid),
                      tier: 'private',
                    })
                  : undefined;
              if (stored === undefined || stored.size !== object.size) {
                return {
                  oid: object.oid,
                  size: object.size,
                  authenticated: true,
                  error: {
                    code: 404,
                    message: 'Object does not exist on the Tau Hosted Remote',
                  },
                };
              }
              return {
                oid: object.oid,
                size: object.size,
                authenticated: true,
                actions: {
                  download: {
                    href: await this.objectStorage.presignGet({
                      namespace: 'blobs',
                      key: gitLfsObjectKey(args.access.projectId, object.oid),
                      expiresInSeconds: transferExpirySeconds,
                      tier: 'private',
                    }),
                    expires_in: transferExpirySeconds,
                  },
                },
              };
            }),
          ),
        },
      };
    }

    const reservation = await this.repositories.reserveLfsObjects({ access: args.access, objects: args.objects });
    if (reservation.status === 'quota') {
      // D16/AC16: the whole batch is refused with the objects that do not fit,
      // and the client maps them back to paths.
      return {
        status: 413,
        body: {
          code: 'GIT_LFS_QUOTA_EXCEEDED',
          message: `Storage quota exceeded: this push needs ${String(reservation.shortfallBytes)} bytes more than the plan allows.`,
          shortfallBytes: reservation.shortfallBytes,
          remainingBytes: reservation.remainingBytes,
          files: reservation.files,
        },
      };
    }
    const states = new Map(reservation.objects.map((object) => [object.oid, object]));
    const present = await Promise.all(
      args.objects.map(async (object) => {
        const record = states.get(object.oid);
        if (record?.finalized !== true || record.size !== object.size) {
          return false;
        }
        const stored = await this.objectStorage.headBlob({
          namespace: 'blobs',
          key: gitLfsObjectKey(args.access.projectId, object.oid),
          tier: 'private',
        });
        return stored?.size === object.size;
      }),
    );

    return {
      status: 200,
      body: {
        transfer: 'basic',
        objects: await Promise.all(
          args.objects.map(async (object, index): Promise<LfsObjectResponse> => {
            if (present[index] === true) {
              // Already stored: git-lfs skips an object that has no actions.
              return {
                oid: object.oid,
                size: object.size,
                authenticated: true,
              };
            }
            return {
              oid: object.oid,
              size: object.size,
              authenticated: true,
              actions: {
                upload: {
                  href: await this.objectStorage.presignPut({
                    namespace: 'blobs',
                    key: gitLfsObjectKey(args.access.projectId, object.oid),
                    contentType: objectContentType,
                    contentLength: object.size,
                    checksumSha256: Buffer.from(object.oid, 'hex').toString('base64'),
                    expiresInSeconds: transferExpirySeconds,
                    tier: 'private',
                  }),
                  header: {
                    'Content-Type': objectContentType,
                    'Content-Length': String(object.size),
                    'x-amz-checksum-sha256': Buffer.from(object.oid, 'hex').toString('base64'),
                  },
                  expires_in: transferExpirySeconds,
                },
                verify: {
                  href: `${args.endpoint}/verify`,
                  ...(args.authorization === undefined ? {} : { header: { Authorization: args.authorization } }),
                  expires_in: transferExpirySeconds,
                },
              },
            };
          }),
        ),
      },
    };
  }

  /** Verify exact stored bytes before making the reserved object readable. */
  public async verify(args: { access: GitAccess; oid: string; size: number }): Promise<boolean> {
    const stored = await this.objectStorage.headBlob({
      namespace: 'blobs',
      key: gitLfsObjectKey(args.access.projectId, args.oid),
      tier: 'private',
    });
    if (stored === undefined || stored.size !== args.size) {
      return false;
    }
    const blob = await this.objectStorage.getBlob({
      namespace: 'blobs',
      key: gitLfsObjectKey(args.access.projectId, args.oid),
      tier: 'private',
    });
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of blob.body) {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array<ArrayBuffer>);
      size += bytes.byteLength;
      if (size > args.size) {
        blob.body.destroy();
        return false;
      }
      hash.update(bytes);
    }
    if (size !== args.size || hash.digest('hex') !== args.oid) {
      return false;
    }
    return (await this.repositories.finalizeLfsObject(args)) !== 'unreserved';
  }
}
