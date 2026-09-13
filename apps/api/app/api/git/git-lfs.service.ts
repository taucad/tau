/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
/* eslint-disable @typescript-eslint/naming-convention -- git-lfs wire fields are snake_case */
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
    const present = await Promise.all(
      args.objects.map(async (object) =>
        this.objectStorage.headBlob({
          namespace: 'blobs',
          key: gitLfsObjectKey(args.access.projectId, object.oid),
          tier: 'private',
        }),
      ),
    );

    if (args.operation === 'download') {
      return {
        status: 200,
        body: {
          transfer: 'basic',
          objects: await Promise.all(
            args.objects.map(async (object, index): Promise<LfsObjectResponse> => {
              if (present[index] === undefined) {
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

    const missing = args.objects.filter((_object, index) => present[index] === undefined);
    const incoming = missing.reduce((total, object) => total + object.size, 0);
    if (incoming > args.access.remainingBytes) {
      // D16/AC16: the whole batch is refused with the objects that do not fit,
      // and the client maps them back to paths.
      return {
        status: 413,
        body: {
          code: 'GIT_LFS_QUOTA_EXCEEDED',
          message: `Storage quota exceeded: this push needs ${String(incoming - args.access.remainingBytes)} bytes more than the plan allows.`,
          shortfallBytes: incoming - args.access.remainingBytes,
          remainingBytes: args.access.remainingBytes,
          files: missing.map((object) => ({
            oid: object.oid,
            size: object.size,
          })),
        },
      };
    }

    return {
      status: 200,
      body: {
        transfer: 'basic',
        objects: await Promise.all(
          args.objects.map(async (object, index): Promise<LfsObjectResponse> => {
            if (present[index] !== undefined) {
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
                    expiresInSeconds: transferExpirySeconds,
                    tier: 'private',
                  }),
                  header: { 'Content-Type': objectContentType },
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

  /**
   * Git-lfs calls this once per object it uploaded, and only for objects the
   * batch response said were missing — so counting the size here is exact for
   * every honest client and cannot inflate another account's usage.
   */
  public async verify(args: { access: GitAccess; oid: string; size: number }): Promise<boolean> {
    const stored = await this.objectStorage.headBlob({
      namespace: 'blobs',
      key: gitLfsObjectKey(args.access.projectId, args.oid),
      tier: 'private',
    });
    if (stored === undefined) {
      return false;
    }
    await this.repositories.recordUsage({
      projectId: args.access.projectId,
      lfsBytesDelta: stored.size,
    });
    return true;
  }
}
