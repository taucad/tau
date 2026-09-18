/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
/* eslint-disable @typescript-eslint/naming-convention -- git-lfs wire fields are snake_case */
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';
import { withOwnerLock } from '#database/owner-lock.js';
import { projectGitLfsObject } from '#database/schema.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import type { LfsObjectLocation } from '#api/git/lfs-keys.js';
import { resolveLfsObjectLocation, tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import type { GitAccess } from '#api/git/git.service.js';

/** Presigned transfers are short-lived; a push uploads immediately. */
const transferExpirySeconds = 900;
const objectContentType = 'application/octet-stream';

type LfsObjectRequest = { readonly oid: string; readonly size: number };

/** D16/AC16: the whole batch is refused with the objects that do not fit. */
const quotaRefusal = (reservation: {
  readonly shortfallBytes: number;
  readonly remainingBytes: number;
  readonly files: ReadonlyArray<{ readonly oid: string; readonly size: number }>;
}): LfsBatchOutcome => ({
  status: 413,
  body: {
    code: 'GIT_LFS_QUOTA_EXCEEDED',
    message: `Storage quota exceeded: this push needs ${String(reservation.shortfallBytes)} bytes more than the plan allows.`,
    shortfallBytes: reservation.shortfallBytes,
    remainingBytes: reservation.remainingBytes,
    files: reservation.files,
  },
});

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
 * R2 transfers (A24, S49). Objects live under their owner's tenant prefix
 * (D24) keyed by git-lfs's own `oid`, so the bytes a stock `git lfs push`
 * uploads are the bytes a stock `git lfs pull` reads back, and nothing here
 * touches a repository on disk — reachability is decided over a lease by
 * `lfs-reachability.ts`.
 */
@Injectable()
export class GitLfsService {
  public constructor(
    private readonly objectStorage: ObjectStorageService,
    private readonly repositories: GitRepositoryService,
    private readonly databaseService: DatabaseService,
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
      const located = await Promise.all(
        args.objects.map(async (object) => {
          const record = finalized.get(object.oid);
          const stored =
            record?.finalized === true && record.size === object.size
              ? await this.#storedAt(args.access, object.oid)
              : undefined;
          return stored?.size === object.size ? ([object.oid, stored] as const) : undefined;
        }),
      );
      const held = new Map(located.filter((entry) => entry !== undefined));

      /* The clear decides, not the head: it runs under the owner lock that
         retirement deletes rows under, so an object retirement took while this
         batch was looking at it comes back as absent rather than as a download
         URL for bytes that are gone (D18). */
      const confirmed = await this.#clearUnreachable(args.access, [...held.keys()]);

      const objects = await Promise.all(
        args.objects.map(async (object): Promise<LfsObjectResponse> => {
          const stored = confirmed.has(object.oid) ? held.get(object.oid) : undefined;
          if (stored === undefined) {
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
                  ...stored.location,
                  expiresInSeconds: transferExpirySeconds,
                }),
                expires_in: transferExpirySeconds,
              },
            },
          };
        }),
      );
      return { status: 200, body: { transfer: 'basic', objects } };
    }

    const reservation = await this.repositories.reserveLfsObjects({ access: args.access, objects: args.objects });
    if (reservation.status === 'quota') {
      // The client maps the refused objects back to paths.
      return quotaRefusal(reservation);
    }
    const states = new Map(reservation.objects.map((object) => [object.oid, object]));
    const present = await Promise.all(
      args.objects.map(async (object) => {
        const record = states.get(object.oid);
        if (record?.finalized !== true || record.size !== object.size) {
          return false;
        }
        const held = await this.#storedAt(args.access, object.oid);
        return held?.size === object.size;
      }),
    );
    /* Same rule as the download branch, and the one that matters most: an
       answer with no actions tells git-lfs to skip the upload, so it may only
       be given for an object whose reservation row survived the clear under
       the owner lock. Anything else is handed an upload action — worst case
       the client re-uploads bytes that are already there. */
    const confirmed = await this.#clearUnreachable(
      args.access,
      args.objects.filter((_, index) => present[index] === true).map((object) => object.oid),
    );

    /* An object the clear could not confirm is one retirement removed while
       this batch was looking at it: its bytes are gone, its row is gone, and
       the client is about to upload it again. Reserve it again here, or the
       `verify` that follows the upload would answer `unreserved` and fail the
       push. The reservation is owner-locked and counts the bytes once. */
    const unconfirmed = args.objects.filter((object, index) => present[index] === true && !confirmed.has(object.oid));
    if (unconfirmed.length > 0) {
      const again = await this.repositories.reserveLfsObjects({ access: args.access, objects: unconfirmed });
      if (again.status === 'quota') {
        return quotaRefusal(again);
      }
    }

    return {
      status: 200,
      body: {
        transfer: 'basic',
        objects: await Promise.all(
          args.objects.map(async (object, index): Promise<LfsObjectResponse> => {
            if (present[index] === true && confirmed.has(object.oid)) {
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
                    namespace: 'tenants',
                    key: tenantLfsObjectKey(args.access.ownerId, args.access.projectId, object.oid),
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
    const stored = await this.#storedAt(args.access, args.oid);
    if (stored === undefined || stored.size !== args.size) {
      return false;
    }
    const blob = await this.objectStorage.getBlob(stored.location);
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

  /**
   * Where this project's bytes for `oid` actually are, or `undefined`.
   *
   * The tenant key first, then the legacy one: every upload since D24 lands
   * under the tenant prefix, and a project whose objects predate the move is
   * still served from where its bytes are until the handbook relocates them.
   *
   * @param access - The authorized request, which names the owner and project.
   * @param oid - git-lfs's own SHA-256 object identity.
   * @returns The location holding the bytes and their stored length.
   */
  async #storedAt(access: GitAccess, oid: string): Promise<{ location: LfsObjectLocation; size: number } | undefined> {
    return resolveLfsObjectLocation(this.objectStorage, {
      ownerId: access.ownerId,
      projectId: access.projectId,
      oid,
    });
  }

  /**
   * A batch answer of "present" restarts the object's retirement clock (D18, ND17).
   *
   * `unreachable_at` is the first moment no retained tree reached an object, and
   * thirty days after it the object is collected. But a client that has the
   * object still holds it: git-lfs asks the batch endpoint before it pushes the
   * pointer that will make it reachable again, and that question is the earliest
   * evidence there is. Clearing the mark there closes the window where an object
   * is deleted between the batch answer and the push that would have saved it.
   *
   * Under the owner-keyed advisory lock, which is the same lock the retirement
   * pass and the quota recheck take, so a "present" answer and a destructive
   * recheck cannot interleave.
   *
   * @param access - The authorized request, which names the owner to lock on.
   * @param oids - The objects this batch found present; none is not an error.
   * @returns The subset whose reservation row still existed under the lock.
   */
  async #clearUnreachable(access: GitAccess, oids: readonly string[]): Promise<ReadonlySet<string>> {
    const present = [...new Set(oids)];
    if (present.length === 0) {
      return new Set();
    }
    return withOwnerLock(this.databaseService.database, access.ownerId, async (transaction) => {
      const cleared = await transaction
        .update(projectGitLfsObject)
        .set({ unreachableAt: null })
        .where(and(eq(projectGitLfsObject.projectId, access.projectId), inArray(projectGitLfsObject.oid, present)))
        .returning({ oid: projectGitLfsObject.oid });
      return new Set(cleared.map((row) => row.oid));
    });
  }
}
