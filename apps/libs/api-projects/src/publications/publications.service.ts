import { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PublicationOwnerSnapshot, PublicationVisibility } from '@taucad/types';
import { idPrefix, publicationApiCode } from '@taucad/types/constants';
import type { InviteEmailOutcome } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { Environment } from '@taucad/api-core';
import type {
  PublicationViewResponse,
  PublishRequest,
  PublishResponse,
  PublicationWireRow,
  ProjectShare,
  ProjectShareAccessGrant,
  ProjectShareAccessInviteResponse,
  ProjectShareEnvelope,
  StoredPublicationManifest,
} from '#publications/publications.dto.js';
import { storedPublicationManifestSchema } from '#publications/publications.dto.js';
import {
  materializePublication,
  materializePublishedTags,
  publicationBlobKey,
  publicationContentType,
  releaseManifestBlobs,
} from '#publications/publication-materializer.js';
import type { MaterializedPublication, MaterializerDependencies } from '#publications/publication-materializer.js';
import type { ResolvedViewerIdentity } from '#publications/viewer-identity.types.js';
import { PublicationRateLimiterService, RedisService } from '@taucad/api-redis';
import { decodeManifest } from '@taucad/api-git-core/store/manifest';
import { repositoryLocator } from '@taucad/api-git-core/store/locator';
import type { RepositoryStore } from '@taucad/api-git-core/store/port';
import { repositoryStoreKey } from '@taucad/api-git-core/git.constants';
import { resolveLfsObjectLocation } from '@taucad/api-git-core/lfs-keys';
import { publicationRepositoryLeasesKey } from '#publications/repository-leases.js';
import type { PublicationRepositoryLeases, ReadLease } from '#publications/repository-leases.js';
import { DatabaseService } from '@taucad/api-database';
import { assertProjectActive, assertActiveProjectLocked } from '@taucad/api-database/project-lifecycle';
import { buildCloudLinkUrl, EmailDeliverabilityService, EmailService } from '@taucad/api-email';
import type { CommercialEntitlementsService } from '#entitlements/commercial-entitlements.js';
import { commercialEntitlementsKey } from '#entitlements/commercial-entitlements.js';
import * as schema from '@taucad/api-database/schema';
import { ObjectStorageService, isS3ObjectMissing } from '@taucad/api-object-storage';
import type { StorageTier } from '@taucad/api-object-storage';
import type { StorageNamespace } from '@taucad/api-object-storage/constants';
import { concatUint8Arrays } from '@taucad/api-object-storage/concat-uint8-arrays';
import { MetricsService } from '@taucad/api-observability/metrics';

/** The shared placeholder card image every publication starts with. */
const defaultOgImageKey = 'defaults/og.png';
type PublicationTransaction = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];
type PublicationRow = typeof schema.publication.$inferSelect;
type ProjectShareRow = typeof schema.projectShare.$inferSelect;
type ProjectShareAccessRow = typeof schema.projectShareAccess.$inferSelect;
/** The database or an open transaction: both read the link the same way. */
type ShareReader = Pick<PublicationTransaction, 'select'>;

const normalizeRelativePath = (relativePathValue: string): string =>
  relativePathValue.replaceAll('\\', '/').replace(/^\.\/+/, '');

const manifestCacheMaxEntries = 256;

const isWebp = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  bytes.byteLength >= 12 &&
  new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
  new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';

/**
 * The `blobs` key one manifest file is served from. The thumbnail's is the one
 * its row recorded: a version materialized before the served type joined the
 * key (#2008) holds its thumbnail at the bare digest, and its row says so.
 *
 * @param publication - The row, for its recorded thumbnail key.
 * @param relativePath - The file's manifest path.
 * @param sha256Hex - The file's digest.
 * @returns The namespace-relative key.
 */
const servedKeyOf = (
  publication: Readonly<Pick<typeof schema.publication.$inferSelect, 'thumbnailKey'>>,
  relativePath: string,
  sha256Hex: string,
): string => {
  const recorded = publication.thumbnailKey;
  if (relativePath === 'thumbnail.webp' && recorded?.startsWith('blobs/') === true) {
    return recorded.slice('blobs/'.length);
  }
  return publicationBlobKey(relativePath, sha256Hex);
};

/**
 * Split a namespace-qualified storage key (`defaults/thumb.webp`,
 * `blobs/ab/cd…`) into a public CDN URL. The stored `og_image_key` /
 * `thumbnail_key` columns carry the namespace prefix, so the raw value must not
 * be re-prefixed with a namespace (which previously produced
 * `defaults/defaults/thumb.webp`).
 */
const splitNamespaceKey = (storedKey: string): { namespace: StorageNamespace; key: string } => {
  const slash = storedKey.indexOf('/');
  if (slash === -1) {
    return { namespace: 'defaults', key: storedKey };
  }
  return { namespace: storedKey.slice(0, slash) as StorageNamespace, key: storedKey.slice(slash + 1) };
};

/** The hydrate-budget caller a publication viewer's derived-state repair is charged as. */
const publicationRepairCaller = 'publication-repair';

@Injectable()
export class PublicationsService {
  private readonly logger = new Logger(this.constructor.name);

  /**
   * Write-once manifests keyed by their storage key — see {@link loadStoredManifest}.
   *
   * Keyed by the key rather than by the publication because a re-publish points
   * the same publication at a *new* manifest object (W8): keying by id would
   * serve the superseded keyring until the process restarted.
   */
  private readonly manifestCache = new Map<string, StoredPublicationManifest>();

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly configService: ConfigService<Environment, true>,
    private readonly redisService: RedisService,
    private readonly publicationRateLimiter: PublicationRateLimiterService,
    private readonly metrics: MetricsService,
    private readonly emailService: EmailService,
    @Inject(commercialEntitlementsKey) private readonly entitlementsService: CommercialEntitlementsService,
    /*
     * The repository store, not the git service: publishing and repairing a
     * publication both need a lease of their own, and nothing about them needs
     * the smart-HTTP route that also hydrates one (charter D9). It arrives as
     * the port under `GitModule`'s token, never as the S3 adapter, because no
     * code above the adapter names a provider (D25, NI14).
     */
    @Inject(repositoryStoreKey) private readonly repositoryStore: RepositoryStore,
    /*
     * Leases only, so publishing and a viewer's repair take the same disk
     * admission, owner fairness and hydrate budget as every git route (I11).
     */
    @Inject(publicationRepositoryLeasesKey) private readonly repositories: PublicationRepositoryLeases,
    /*
     * Tau's mirror of Resend's suppression list (email bounce blueprint R9): invites skip an undeliverable
     * recipient before the owner's daily cap and its grant reads "Not delivered". The API module always
     * provides it; without one (unit fixtures) every address counts as deliverable, which is Resend's view
     * too until a bounce arrives.
     */
    // oxlint-disable-next-line eslint/new-cap -- Nest's Optional decorator is a function by contract.
    @Optional() private readonly deliverability?: EmailDeliverabilityService,
  ) {}

  /** What the materializer needs, which this service already holds. */
  private get materializer(): MaterializerDependencies {
    return {
      databaseService: this.databaseService,
      storage: this.storage,
      /* Git over the read lease, on tau-storage (DC1): this API runs no git
         child, and each command is one bounded `git-read` (review R8). */
      git: this.repositories.leaseGit,
      /* The LFS endpoint's own resolver, so a publication reads an object from
         wherever that endpoint serves it: the tenant key, or the pre-D24 one
         for a project the relocation has not reached (W4b). */
      resolveLfsObject: async (object) => {
        const held = await resolveLfsObjectLocation(this.storage, object);
        return held?.location;
      },
    };
  }

  /**
   * Reads the current Better Auth `user` row and returns a denormalised snapshot suitable
   * for persisting on the publication record. Returns `null` when the user no longer exists
   * (preserves publish/fork on dangling owner ids without throwing — the snapshot can be
   * reconstructed lazily later).
   */
  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- DB columns and wire DTO use null
  public async loadOwnerSnapshot(ownerId: string): Promise<PublicationOwnerSnapshot | null> {
    const rows = await this.databaseService.database
      .select({ id: schema.user.id, name: schema.user.name, image: schema.user.image })
      .from(schema.user)
      .where(eq(schema.user.id, ownerId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }

    const snapshot: PublicationOwnerSnapshot = { id: row.id, name: row.name };
    if (typeof row.image === 'string') {
      snapshot.image = row.image;
    }

    return snapshot;
  }

  /**
   * Record or re-point one version on the synced graph and point the project's
   * one cloud link at it (S32, D11, A21; stable cloud link blueprint D1).
   *
   * Nothing is uploaded here: by the time this is called the client has pushed
   * the history set — the branch and the named version, LFS objects included —
   * to this project's repository on the Tau Hosted Remote, so the bytes are
   * already on the volume and in R2. What this does is create or re-point the
   * version's row and materialize the tagged tree into the same sha256-keyed
   * blob store the viewer has always read, at the tier the link's setting asks.
   *
   * The first publish creates the link, private unless the request says
   * otherwise. Every later one keeps the link's id, its setting and its invited
   * people, turns a stopped link back on and moves what it shows. Publishing
   * sends no email (D4).
   *
   * @param args - The owner and the pointer they are publishing.
   * @returns The version's id, the link and its setting.
   */
  public async publishFromRevision(args: { ownerId: string; request: PublishRequest }): Promise<PublishResponse> {
    const { ownerId, request } = args;
    await assertProjectActive(this.databaseService.database, request.projectId, ownerId);

    /* The other route that reaches `ensureRepository`, checked in the same pass
       as N5. Publishing a named version presupposes the push that created it,
       and a push needs this entitlement — so this refuses nobody who could
       otherwise have succeeded, and it stops an un-entitled caller creating a
       bare repository on the volume for a tag that can never exist (review C11). */
    const publishEntitlements = await this.entitlementsService.getEntitlements(ownerId);
    if (!publishEntitlements.canSyncFiles) {
      throw new ForbiddenException({
        code: 'GIT_SYNC_NOT_ENTITLED',
        message: 'Syncing files to the cloud is a paid plan feature.',
      });
    }

    const ownerSnapshot = await this.loadOwnerSnapshot(ownerId);
    const db = this.databaseService.database;

    const existingRows = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, request.projectId))
      .limit(1);
    const existingProject = existingRows[0];
    if (existingProject !== undefined && existingProject.ownerId !== ownerId) {
      throw new ForbiddenException({
        code: publicationApiCode.PROJECT_FORBIDDEN,
        message: 'Project is owned by another user',
      });
    }

    /* Checked before the lease as well as under the lock, so a refused setting
       costs no hydrate. A first publish is private unless the request names another default. */
    const existingShare = await this.selectShareOfProject(db, request.projectId);
    const requestedVisibility = this.publishVisibility(request, existingShare);
    await this.assertVisibilityAllowed({ ownerId, visibility: requestedVisibility, current: existingShare });

    /* The lease is the repository: it is hydrated from the manifest, read, and
       disposed here (D9). It stays open across the transaction below because
       that is where the tagged tree is read and the blobs are written — the
       reference counts must be taken before any of it (D10). */
    const published = await this.withLease(
      { projectId: request.projectId, ownerId, callerId: ownerId },
      async (lease) =>
        db.transaction(async (tx) => {
          /* One writer of this project's publications at a time, the same lock a
           read-side repair and every link write take: the row this reads decides
           which manifest is released below, and two writers reading it before
           either commits would release that manifest twice (review F2). */
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${request.projectId}, 0))`);
          await assertProjectActive(tx, request.projectId, ownerId);

          /* The ref-removal verb retires a publication under this same lock
           (D24). A lease hydrated before a removal still holds the removed
           name, so the name is re-read from the store under the lock: a
           publish never brings back a name removed while it was running. */
          const tagRef = `refs/tags/${request.tag}`;
          const stored = await this.repositoryStore.readManifest(
            repositoryLocator({ ownerId, projectId: request.projectId }),
          );
          const storedTip = stored === undefined ? undefined : decodeManifest(stored.manifest).refs[tagRef]?.oid;
          if (storedTip === undefined || storedTip !== lease.manifest?.refs[tagRef]?.oid) {
            throw new ConflictException({
              code: publicationApiCode.REVISION_MOVED,
              message: `${request.tag} changed while it was being published. Publish again to pick it up.`,
            });
          }

          /* Re-read under the lock: a change of who can open the link may have
             landed since the check above. */
          const lockedShare = await this.selectShareOfProject(tx, request.projectId);
          const visibility = this.publishVisibility(request, lockedShare);
          if (visibility !== requestedVisibility || lockedShare?.visibility !== existingShare?.visibility) {
            await this.assertVisibilityAllowed({ ownerId, visibility, current: lockedShare });
          }

          const [currentRow] = await tx
            .select()
            .from(schema.publication)
            .where(and(eq(schema.publication.projectId, request.projectId), eq(schema.publication.tag, request.tag)))
            .limit(1);
          const publicationId = currentRow?.id ?? generatePrefixedId(idPrefix.publication);

          const version = await materializePublication(
            this.materializer,
            {
              publicationId,
              heldManifestKey: currentRow?.manifestKey,
              projectId: request.projectId,
              ownerId,
              directory: lease.directory,
              tag: request.tag,
              visibility,
              entryPath: request.entryPath,
            },
            tx,
          );

          /* The row records the revision the server resolved, never the client's
           claim, and a mismatch is a refusal rather than a silent disagreement
           between the row and the bytes a viewer is served (review R6). The
           throw rolls the counts above back with it. */
          if (version.revisionId !== request.revisionId) {
            throw new ConflictException({
              code: publicationApiCode.REVISION_MOVED,
              message: `${request.tag} now points at a different revision. Publish again to pick it up.`,
            });
          }

          const share = await this.writePublicationRows({
            tx,
            ownerId,
            request,
            publicationId,
            visibility,
            ownerSnapshot,
            version,
          });
          return { version, publicationId, share, superseded: currentRow?.manifestKey };
        }),
    );
    const { version: materialized, publicationId, share } = published;

    /* The superseded manifest's counts go back only once the row points at the
     * new one, so a failure above never drops a live reference. The row it came
     * from was read under the lock, so no second writer released it too. */
    if (published.superseded !== undefined && published.superseded !== materialized.manifestKey) {
      await releaseManifestBlobs(this.materializer, published.superseded);
    }

    const shareUrl = this.cloudLinkUrl(share.id);
    return {
      id: publicationId,
      urls: {
        view: shareUrl,
        share: shareUrl,
        og: this.storage.publicUrl(splitNamespaceKey(defaultOgImageKey)),
        thumbnail: this.storage.publicUrl(splitNamespaceKey(materialized.thumbnailKey)),
      },
      share: { id: share.id, url: shareUrl, visibility: this.linkVisibility(share) },
      version: { tag: request.tag },
    };
  }

  /**
   * The version a cloud link shows, for whoever opens it (`GET /v1/shares/:shareId`).
   *
   * Only a link id resolves. A publication id is not a link, so an old
   * `tau~pub_…` address answers `404` by construction (stable cloud link
   * blueprint C1). A stopped link answers `410`.
   *
   * @param args - The link id and the signed-in viewer, if any.
   * @returns The current version, its manifest and where each file is served from.
   */
  public async getShareForViewer(args: { shareId: string; viewerUserId?: string }): Promise<PublicationViewResponse> {
    const link = await this.selectLinkOrThrow(eq(schema.projectShare.id, args.shareId));
    const { share, publication, viewerRole } = await this.repairCurrentOrThrow({
      ...link,
      viewerUserId: args.viewerUserId,
      viewerRole: await this.authorizeShareViewer(link.share, args.viewerUserId),
    });

    const { manifestKey, ogImageKey, thumbnailKey } = publication;
    const shareUrl = this.cloudLinkUrl(share.id);
    const visibility = this.linkVisibility(share);

    const urls = {
      view: shareUrl,
      share: shareUrl,
      og: this.storage.publicUrl(splitNamespaceKey(ogImageKey ?? 'defaults/og.png')),
      thumbnail: this.storage.publicUrl(splitNamespaceKey(thumbnailKey ?? 'defaults/thumb.webp')),
    };

    const manifest = await this.loadStoredManifest(manifestKey);
    const files: Record<string, string> = {};

    for (const [relativePath, shaRef] of Object.entries(manifest.files)) {
      const sha256Hex = this.sha256HexFromManifestRef(relativePath, shaRef);

      // Private bytes are only reachable through the authenticated,
      // link-authorized proxy; public links keep direct CDN URLs (the public
      // cost model depends on them).
      files[relativePath] =
        visibility === 'private'
          ? this.buildPublicationFileUrl(publication.id, relativePath)
          : this.storage.publicUrl({ namespace: 'blobs', key: servedKeyOf(publication, relativePath, sha256Hex) });
    }

    const ownerSnapshot = await this.resolveOwnerSnapshot(publication);

    const publicationDto: PublicationWireRow = {
      id: publication.id,
      projectId: publication.projectId,
      tag: publication.tag,
      revisionId: publication.revisionId,
      ownerId: publication.ownerId,
      parentPublicationId: publication.parentPublicationId,
      visibility,
      runtimePin: publication.runtimePin,
      kernels: publication.kernels,
      entryPath: publication.entryPath,
      title: publication.title,
      description: publication.description,
      forkCount: publication.forkCount,
      viewCount: publication.viewCount,
      ownerSnapshot,
      createdAt: publication.createdAt.toISOString(),
      unpublishedAt: null,
    };

    await this.assertActiveProject(publication.projectId);
    return {
      publication: publicationDto,
      viewerRole,
      urls,
      manifest,
      files,
    };
  }

  /**
   * Authorizes and resolves a single publication file for the proxy endpoint.
   * Re-checks the viewer against the project's cloud link on EVERY request
   * (removing access or stopping the link takes effect at once) and validates
   * the requested path against the publication's own manifest, so a sha from
   * another publication can never be re-scoped (threat T5).
   *
   * The returned `etag` is the content sha — a strong validator the controller
   * uses for `If-None-Match` revalidation without touching storage.
   */
  public async resolvePublicationFile(args: {
    publicationId: string;
    viewerUserId?: string;
    path: string;
  }): Promise<{ sha256Hex: string; etag: string; path: string; key: string }> {
    if (!args.path) {
      throw new BadRequestException({ code: publicationApiCode.INVALID_PATH, message: 'Missing path query' });
    }

    const row = await this.selectPublicationOrThrow(args.publicationId);
    /* Only the version the link shows, read with the link that authorizes it:
       an earlier version is served by nothing, whoever can open the link now. */
    const { share, current } = await this.selectLinkOrThrow(eq(schema.projectShare.projectId, row.projectId));
    if (current?.id !== row.id) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
    }
    const viewerRole = await this.authorizeShareViewer(share, args.viewerUserId);
    const { publication } = await this.repairCurrentOrThrow({
      share,
      current,
      viewerUserId: args.viewerUserId,
      viewerRole,
    });

    const path = normalizeRelativePath(args.path);
    const manifest = await this.loadStoredManifest(publication.manifestKey);
    const shaRef = manifest.files[path];
    if (shaRef === undefined) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'File not found in publication' });
    }

    const sha256Hex = this.sha256HexFromManifestRef(args.path, shaRef);

    await this.assertActiveProject(publication.projectId);
    return { sha256Hex, etag: `"${sha256Hex}"`, path, key: servedKeyOf(publication, path, sha256Hex) };
  }

  /**
   * Opens the blob stream for a resolved publication file. Reads the private
   * tier first and falls back to the public bucket as a defensive cross-tier
   * read. Authorization happened in `resolvePublicationFile` — the source
   * bucket does not affect it.
   *
   * `key` is the one `resolvePublicationFile` answered; without it the key is
   * derived from the path's served type.
   */
  public async openPublicationFile(
    sha256Hex: string,
    path: string,
    key: string = publicationBlobKey(path, sha256Hex),
  ): Promise<{ body: Readable; contentType: string; contentLength?: number }> {
    const blob = await this.getBlobPreferPrivate({ namespace: 'blobs', key });
    if (path !== 'thumbnail.webp' || blob.contentType === 'image/webp') {
      return {
        body: blob.body,
        contentType: path === 'thumbnail.webp' ? 'image/webp' : 'application/octet-stream',
        ...(blob.contentLength === undefined ? {} : { contentLength: blob.contentLength }),
      };
    }

    const bytes = await this.readStreamToBuffer(blob.body);
    return {
      body: Readable.from([bytes]),
      contentType: isWebp(bytes) ? 'image/webp' : 'application/octet-stream',
      contentLength: bytes.byteLength,
    };
  }

  /**
   * The project and its cloud link, as the owner's Share pane reads them
   * (`GET /v1/projects/:id/share`). `share` is `null` until the first publish.
   *
   * @param args - The project and the signed-in owner.
   * @returns The project summary and its link.
   */
  public async getProjectShareEnvelope(args: { projectId: string; ownerId: string }): Promise<ProjectShareEnvelope> {
    const db = this.databaseService.database;
    await this.assertActiveProject(args.projectId, args.ownerId);

    const [project] = await db.select().from(schema.project).where(eq(schema.project.id, args.projectId)).limit(1);
    if (!project) {
      return { project: { id: args.projectId, name: null, description: null }, share: null };
    }

    if (project.ownerId !== args.ownerId) {
      throw new ForbiddenException({
        code: publicationApiCode.PROJECT_FORBIDDEN,
        message: 'Project is owned by another user',
      });
    }

    const share = await this.selectShareOfProject(db, project.id);
    return {
      project: { id: project.id, name: project.name, description: project.description },
      share: share === undefined ? null : await this.toProjectShareDto(share),
    };
  }

  /**
   * Changes who can open the project's cloud link (`PATCH /v1/projects/:id/share`).
   *
   * Only people you invite needs `canCreatePrivateShares`, unless the link is
   * already private (T16). Under the project lock the version the link shows is
   * copied into the target tier first and the link row changes second, so the
   * row never points at a tier the bytes are not in. Earlier versions are not
   * touched: nothing serves them.
   *
   * @param args - The project, the owner and the new setting.
   * @returns The link as the envelope shows it.
   */
  public async updateProjectShare(args: {
    projectId: string;
    ownerId: string;
    visibility: PublicationVisibility;
  }): Promise<ProjectShare> {
    await this.assertProjectOwner(args);
    const share = await this.selectShareOfProjectOrThrow(args.projectId);

    if (share.visibility !== args.visibility) {
      await this.assertVisibilityAllowed({ ownerId: args.ownerId, visibility: args.visibility, current: share });

      await this.databaseService.database.transaction(async (transaction) => {
        await assertActiveProjectLocked(transaction, args.projectId);
        const fresh = await this.selectShareOfProject(transaction, args.projectId);
        this.assertShareLive(fresh);
        /* Another request may have made the same change while this one waited. */
        if (fresh.visibility === args.visibility) {
          return;
        }

        const current = await this.selectCurrentPublication(transaction, args.projectId);
        if (current !== undefined) {
          // Storage first, row second (see the method comment).
          await this.reconcileStorageTier(current, args.visibility);
          await transaction
            .update(schema.publication)
            .set({ visibility: args.visibility })
            .where(eq(schema.publication.id, current.id));
        }

        await transaction
          .update(schema.projectShare)
          .set({ visibility: args.visibility, updatedAt: new Date() })
          .where(eq(schema.projectShare.id, fresh.id));
      });
    }

    return this.toProjectShareDto(await this.selectShareOfProjectOrThrow(args.projectId));
  }

  /**
   * "Stop sharing" (`DELETE /v1/projects/:id/share`), on every plan (D5).
   *
   * Keeps the link id and its invited people; the next publish turns the same
   * link back on (C4). The viewer, the file proxy and the view ping answer
   * `410` on their next request, because each reads the link row. No bytes move.
   * Idempotent, and a project with no link has nothing to stop.
   *
   * @param args - The project and the owner.
   */
  public async stopProjectShare(args: { projectId: string; ownerId: string }): Promise<void> {
    await this.assertProjectOwner(args);
    await this.databaseService.database.transaction(async (transaction) => {
      await assertActiveProjectLocked(transaction, args.projectId);
      const at = new Date();
      await transaction
        .update(schema.projectShare)
        .set({ disabledAt: at, updatedAt: at })
        .where(and(eq(schema.projectShare.projectId, args.projectId), isNull(schema.projectShare.disabledAt)));
    });
  }

  /**
   * Invites an address to open a private cloud link (`POST /v1/projects/:id/share/access`).
   *
   * The address is emailed when it gains access (it had no grant, or a removed
   * one) unless `notifyRecipient` is `false`. The answer says what happened to
   * that email, so the client never claims an email that was not sent (D7).
   *
   * @param args - The project, the owner, the address and whether to email it.
   * @returns The grant and its email outcome.
   */
  public async inviteProjectShareAccess(args: {
    projectId: string;
    ownerId: string;
    recipientEmail: string;
    notifyRecipient?: boolean;
  }): Promise<ProjectShareAccessInviteResponse> {
    const project = await this.assertProjectOwner(args);
    const recipientEmail = this.normalizeEmail(args.recipientEmail);

    const { share, grant, existingGrant } = await this.databaseService.database.transaction(async (transaction) => {
      await assertActiveProjectLocked(transaction, args.projectId);
      const share = await this.selectShareOfProject(transaction, args.projectId);
      this.assertShareLive(share);
      if (share.visibility !== 'private') {
        throw new BadRequestException({
          code: publicationApiCode.FORBIDDEN,
          message: 'Only a link for people you invite can have invited people',
        });
      }

      const [existingGrant] = await transaction
        .select()
        .from(schema.projectShareAccess)
        .where(
          and(
            eq(schema.projectShareAccess.shareId, share.id),
            eq(schema.projectShareAccess.recipientEmail, recipientEmail),
          ),
        )
        .limit(1);

      /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- Drizzle `onConflictDoUpdate.target` column refs */
      const [grant] = await transaction
        .insert(schema.projectShareAccess)
        .values({
          id: generatePrefixedId(idPrefix.projectShareAccess),
          shareId: share.id,
          ownerId: args.ownerId,
          recipientEmail,
          status: 'active',
          createdAt: new Date(),
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: [schema.projectShareAccess.shareId, schema.projectShareAccess.recipientEmail],
          set: { status: 'active', revokedAt: null },
        })
        .returning();
      /* oxlint-enable @typescript-eslint/no-unsafe-assignment */

      if (!grant) {
        throw new HttpException('Link invite failed', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return { share, grant, existingGrant };
    });

    const undeliverable = await this.undeliverableRecipients([recipientEmail]);
    let email: InviteEmailOutcome = { status: 'not_requested' };
    if (args.notifyRecipient !== false && existingGrant?.status !== 'active') {
      /* The grant is committed: a failure preparing its email must still answer
         it, so the owner can copy the link instead. */
      try {
        const ownerSnapshot = await this.loadOwnerSnapshot(args.ownerId);
        email = await this.sendLinkInviteEmail({
          ownerId: args.ownerId,
          recipientEmail,
          undeliverable: undeliverable.has(recipientEmail),
          ownerName: ownerSnapshot?.name ?? 'A Tau user',
          projectName: project.name,
          url: this.cloudLinkUrl(share.id),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Link invite email could not be prepared for owner ${args.ownerId}: ${message}`);
        this.metrics.publicationInviteEmailsTotal.add(1, { trigger: 'invite', outcome: 'failed' });
        email = { status: 'skipped', reason: 'send_failed' };
      }
    }

    return { ...this.toAccessGrantDto(grant, undeliverable), email };
  }

  /**
   * Removes an invited address from the project's cloud link
   * (`DELETE /v1/projects/:id/share/access/:accessId`). Works on a stopped link too.
   *
   * @param args - The project, the owner and the grant.
   * @returns The removed grant.
   */
  public async revokeProjectShareAccess(args: {
    projectId: string;
    ownerId: string;
    accessId: string;
  }): Promise<ProjectShareAccessGrant> {
    await this.assertProjectOwner(args);
    return this.databaseService.database.transaction(async (transaction) => {
      await assertActiveProjectLocked(transaction, args.projectId);
      const share = await this.selectShareOfProject(transaction, args.projectId);
      if (share === undefined) {
        throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Link not found' });
      }

      const [grant] = await transaction
        .update(schema.projectShareAccess)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(and(eq(schema.projectShareAccess.id, args.accessId), eq(schema.projectShareAccess.shareId, share.id)))
        .returning();

      if (!grant) {
        throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Link access grant not found' });
      }

      return this.toAccessGrantDto(grant, new Set());
    });
  }

  /**
   * Records a publication view ping. Increments durable `viewCount` only when:
   * (1) caller is not the owner, (2) the per-identity 5/day cap is not exceeded,
   * (3) Redis HLL `PFADD` reports the viewer as new for the day.
   *
   * Throws `429 RATE_LIMITED` when the cap is hit, `404` when the publication or its
   * project's cloud link does not exist or the link shows another version, `410` when
   * either has been withdrawn, and `401`/`403` when the link is for invited people and
   * the caller is not one of them (nor its owner).
   */
  public async recordView(args: { publicationId: string; identity: ResolvedViewerIdentity }): Promise<void> {
    const { publicationId, identity } = args;

    const rows = await this.databaseService.database
      .select()
      .from(schema.publication)
      .where(eq(schema.publication.id, publicationId))
      .limit(1);

    const publication = rows[0];
    if (!publication) {
      this.metrics.publicationViewsRejectedTotal.add(1, { reason: 'invalid_publication' });
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
    }

    if (publication.unpublishedAt) {
      this.metrics.publicationViewsRejectedTotal.add(1, { reason: 'invalid_publication' });
      throw new GoneException({ code: publicationApiCode.GONE, message: 'Publication is no longer available' });
    }

    try {
      /* The link and the version it shows, in one read; a view of any other version is not a view of it. */
      const { share, current } = await this.selectLinkOrThrow(eq(schema.projectShare.projectId, publication.projectId));
      if (current?.id !== publication.id) {
        throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
      }
      /* Only someone the link lets in counts a view: a private link's count is its invited people's. A link anyone
         can open asks nothing more, so an anonymous ping still counts. */
      await this.authorizeShareViewer(share, identity.sessionUserId);
    } catch (error) {
      this.metrics.publicationViewsRejectedTotal.add(1, { reason: 'invalid_publication' });
      throw error;
    }

    if (identity.sessionUserId !== undefined && identity.sessionUserId === publication.ownerId) {
      this.metrics.publicationViewsRejectedTotal.add(1, { reason: 'owner_self_view' });
      return;
    }

    const limit = await this.publicationRateLimiter.consumePublicationViewSlot({
      publicationId: publication.id,
      viewerHash: identity.viewerHash,
    });
    if (!limit.allowed) {
      this.metrics.publicationViewsRejectedTotal.add(1, { reason: 'cap_exceeded' });
      throw new HttpException(
        { code: publicationApiCode.RATE_LIMITED, message: 'View rate limit exceeded' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const yyyymmdd = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const dayKey = `pub:${publication.id}:viewers:${yyyymmdd}`;
    /* Seconds — 26h covers the daily HLL window with safety margin. */
    const hllTtlSeconds = 60 * 60 * 26;

    const added = await this.redisService.client.pfadd(dayKey, identity.viewerHash);
    await this.redisService.client.expire(dayKey, hllTtlSeconds);

    this.metrics.publicationViewsTotal.add(1, { deduped: added === 1 ? 'unique' : 'duplicate' });

    if (added === 1) {
      await this.withActivePublication(publication, async (transaction) => {
        await transaction
          .update(schema.publication)
          .set({ viewCount: sql`${schema.publication.viewCount} + 1` })
          .where(eq(schema.publication.id, publication.id));
      });
    }
  }

  /**
   * Only people you invite is a paid feature (tiers doc T4/AD11 — anyone with
   * the link is never gated). Grandfathering (T16): an owner who lost the
   * entitlement keeps a link that is already private and can still publish to
   * it; only making a link private needs the entitlement.
   */
  private async assertVisibilityAllowed(args: {
    ownerId: string;
    visibility: PublicationVisibility;
    current: Pick<ProjectShareRow, 'visibility'> | undefined;
  }): Promise<void> {
    if (args.visibility !== 'private' || args.current?.visibility === 'private') {
      return;
    }

    const entitlements = await this.entitlementsService.getEntitlements(args.ownerId);
    if (entitlements.canCreatePrivateShares) {
      return;
    }

    throw new ForbiddenException({
      code: publicationApiCode.ENTITLEMENT_REQUIRED,
      message: 'Links for people you invite need the Pro plan',
    });
  }

  /**
   * The setting a publish leaves the link at: the request's, else the link's; a link the publish makes takes the
   * request's default, else private. Read under the lock, a default never changes a link made since the client looked.
   */
  private publishVisibility(
    request: Pick<PublishRequest, 'visibility' | 'defaultVisibility'>,
    share: Pick<ProjectShareRow, 'visibility'> | undefined,
  ): PublicationVisibility {
    return (
      request.visibility ??
      (share === undefined ? (request.defaultVisibility ?? 'private') : this.linkVisibility(share))
    );
  }

  private linkVisibility(share: Pick<ProjectShareRow, 'visibility'>): PublicationVisibility {
    return share.visibility === 'public' ? 'public' : 'private';
  }

  private cloudLinkUrl(shareId: string): string {
    const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true }).replace(/\/$/u, '');
    return buildCloudLinkUrl({ frontendURL: frontendUrl, shareId });
  }

  /**
   * One lease over this project's repository, disposed however the body ends.
   *
   * The publish path and the derived-state repair both read a tagged tree, and
   * a tagged tree only exists inside a lease: the manifest and the packs it
   * names are the repository, and this directory is a disposable copy of them
   * (charter D9, NI1).
   *
   * Taken through the git service's `withLease` (the {@link PublicationRepositoryLeases}
   * port), so it is admitted like
   * every other lease on this worker (I11): disk, owner fairness, and the
   * hydrate budget of whoever asked.
   *
   * @param args - Whose repository, which project, and who asked.
   * @param body - What to do with the lease.
   * @returns Whatever the body returned.
   */
  private async withLease<T>(
    args: { readonly projectId: string; readonly ownerId: string; readonly callerId: string },
    body: (lease: ReadLease) => Promise<T>,
  ): Promise<T> {
    return this.repositories.withLease({ ...args, role: 'owner', remainingBytes: 0, storageLimitBytes: 0 }, body);
  }

  /**
   * Re-materialize this project's publications when they are behind the push.
   *
   * D19: materialization is derived state, and derived state is repaired by
   * whoever notices it is stale. A worker killed between committing a manifest
   * and materializing what it published leaves `derived_generation` behind
   * `generation`; the next request that reads one of those publications — this
   * one — re-derives from a lease and then serves. A failure changes nothing,
   * so the next observation retries: no queue, no sweep.
   *
   * Two reads stand between the mismatch and a lease, because the lease is the
   * expensive part: the marker, and then the manifest's own tag, which says
   * whether this publication is one of the stale ones. The marker is **not**
   * advanced here. `GitRepositoryService` owns it, because its repair also
   * rebuilds accounting and the LFS reachability marks; a publication read that
   * claimed the marker would leave both of those behind forever.
   *
   * @param publication - The publication being read.
   * @returns Whether the row may have moved, so the caller re-reads: true once it was behind the manifest and the
   *   repair ran, including when another request's repair moved it while this one waited for the project's lock.
   */
  private async rederivePublications(
    publication: Readonly<{ projectId: string; ownerId: string; tag: string; revisionId: string }>,
  ): Promise<boolean> {
    /* W4a hand-off: `generation` and `derived_generation` are W3's columns on
       `project_git`, landed in lane a's 0043 migration. */
    const [derived] = await this.databaseService.database
      .select({
        generation: schema.projectGit.generation,
        derivedGeneration: schema.projectGit.derivedGeneration,
      })
      .from(schema.projectGit)
      .where(eq(schema.projectGit.projectId, publication.projectId))
      .limit(1);
    if (derived === undefined || derived.derivedGeneration >= derived.generation) {
      return false;
    }

    try {
      const read = await this.repositoryStore.readManifest(
        repositoryLocator({ ownerId: publication.ownerId, projectId: publication.projectId }),
      );
      if (read === undefined) {
        return false;
      }
      const tags = Object.entries(decodeManifest(read.manifest).refs).filter(([ref]) => ref.startsWith('refs/tags/'));
      const own = tags.find(([ref]) => ref === `refs/tags/${publication.tag}`)?.[1];
      /* The marker can be behind for work that is not this publication's — the
         accounting, an LFS mark — so a row already at the manifest's commit is
         served without hydrating anything. */
      if (own !== undefined && (own.peeled ?? own.oid) === publication.revisionId) {
        return false;
      }

      /* A viewer is nobody's account, so the repair is charged as one named
         caller in the owner's third-party aggregate (D22). */
      return await this.withLease({ ...publication, callerId: publicationRepairCaller }, async (lease) => {
        /* Every tag the manifest holds, not just the ones a push moved: after a
           crash nobody knows which ones were done, and a tag whose publication
           already records that oid is skipped without reading a byte. */
        await materializePublishedTags(this.materializer, {
          projectId: publication.projectId,
          ownerId: publication.ownerId,
          directory: lease.directory,
          tags: tags.map(([ref, value]) => ({ ref, oid: value.oid })),
        });
        /* Re-read even when this call moved nothing: the row this read holds was behind, and a repair that
           committed while this one waited (it skips work already done) left the row this read holds superseded. */
        return true;
      });
    } catch (error) {
      /* The read still serves what the row points at; nothing moved, and the
         next observation retries. */
      this.logger.warn({ err: error, projectId: publication.projectId }, 'Publications could not be re-derived');
      return false;
    }
  }

  /**
   * The rows one publish writes, inside the transaction that took its counts:
   * the project, the version, the project's pointer at it, and the cloud link.
   *
   * The version's title and description are the project's (D3). The link is
   * created at the first publish and otherwise keeps its id and its invited
   * people; a publish clears "Stop sharing" and records when it moved.
   *
   * @param args - The open transaction, the request, and the version written.
   * @returns The link row as it now stands.
   */
  private async writePublicationRows(args: {
    tx: PublicationTransaction;
    ownerId: string;
    request: PublishRequest;
    publicationId: string;
    visibility: PublicationVisibility;
    /* oxlint-disable-next-line typescript/no-restricted-types -- `loadOwnerSnapshot` answers `null`, as the nullable column does */
    ownerSnapshot: PublicationOwnerSnapshot | null;
    version: MaterializedPublication;
  }): Promise<ProjectShareRow> {
    const { tx, ownerId, request, publicationId, visibility, ownerSnapshot, version } = args;
    const now = new Date();
    /* The project's own description, or none: an absent one clears what an earlier publish wrote, since Drizzle
       leaves an `undefined` column out of the update. */
    const description = request.description ?? null;
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- Drizzle `onConflictDoUpdate.target` column refs */
    await tx
      .insert(schema.project)
      .values({
        id: request.projectId,
        ownerId,
        name: request.projectName,
        description,
        origin: 'local-mirror',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.project.id,
        set: { name: request.projectName, description, updatedAt: now },
      });

    await tx
      .insert(schema.publication)
      .values({
        id: publicationId,
        projectId: request.projectId,
        ownerId,
        tag: request.tag,
        revisionId: version.revisionId,
        visibility,
        manifestKey: version.manifestKey,
        ogImageKey: defaultOgImageKey,
        thumbnailKey: version.thumbnailKey,
        runtimePin: version.runtimePin,
        kernels: [...version.kernels],
        entryPath: request.entryPath,
        title: request.projectName,
        description,
        ownerSnapshot,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.publication.projectId, schema.publication.tag],
        set: {
          revisionId: version.revisionId,
          visibility,
          manifestKey: version.manifestKey,
          thumbnailKey: version.thumbnailKey,
          runtimePin: version.runtimePin,
          kernels: [...version.kernels],
          entryPath: request.entryPath,
          title: request.projectName,
          description,
          unpublishedAt: null,
        },
      });

    await tx
      .update(schema.project)
      .set({ currentPublicationId: publicationId, updatedAt: now })
      .where(eq(schema.project.id, request.projectId));

    const [share] = await tx
      .insert(schema.projectShare)
      .values({
        id: generatePrefixedId(idPrefix.projectShare),
        projectId: request.projectId,
        ownerId,
        visibility,
        disabledAt: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.projectShare.projectId,
        set: { visibility, disabledAt: null, publishedAt: now, updatedAt: now },
      })
      .returning();
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment */

    if (!share) {
      throw new HttpException('Cloud link write failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return share;
  }

  private async selectPublicationOrThrow(publicationId: string): Promise<typeof schema.publication.$inferSelect> {
    const rows = await this.databaseService.database
      .select()
      .from(schema.publication)
      .where(eq(schema.publication.id, publicationId))
      .limit(1);

    const publication = rows[0];
    if (!publication) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
    }

    if (publication.unpublishedAt) {
      throw new GoneException({ code: publicationApiCode.GONE, message: 'Publication is no longer available' });
    }

    await this.assertActiveProject(publication.projectId);
    return publication;
  }

  /**
   * Layered access check for a cloud link: anyone with the link → everyone;
   * people you invite → 401 signed out, 403 unless owner or an active invited
   * address. Shared by the viewer route and the file proxy so both boundaries
   * enforce identical semantics.
   */
  private async authorizeShareViewer(
    share: Pick<ProjectShareRow, 'id' | 'ownerId' | 'visibility'>,
    viewerUserId: string | undefined,
  ): Promise<PublicationViewResponse['viewerRole']> {
    let viewerRole: PublicationViewResponse['viewerRole'] = 'public';
    if (viewerUserId === share.ownerId) {
      viewerRole = 'owner';
    }

    if (this.linkVisibility(share) === 'private') {
      if (viewerUserId === undefined) {
        throw new UnauthorizedException({
          code: publicationApiCode.UNAUTHORIZED,
          message: 'Authentication required',
        });
      }

      if (viewerUserId !== share.ownerId) {
        const viewerEmail = await this.loadViewerEmail(viewerUserId);
        const hasGrant = viewerEmail
          ? await this.hasActiveShareAccess({ shareId: share.id, recipientEmail: viewerEmail })
          : false;

        if (!hasGrant) {
          throw new ForbiddenException({
            code: publicationApiCode.FORBIDDEN,
            message: 'This link is for invited people only',
          });
        }

        viewerRole = 'grantee';
      }
    }

    return viewerRole;
  }

  /**
   * Loads and validates a stored publication manifest. Manifests are written
   * once per publication id (`ifNoneMatch: '*'`) and never mutated, so the
   * bounded in-memory cache needs no invalidation. Reads prefer the private
   * tier (the manifest home) with a defensive public-bucket fallback.
   */
  private async loadStoredManifest(manifestKey: string): Promise<StoredPublicationManifest> {
    const cached = this.manifestCache.get(manifestKey);
    if (cached) {
      return cached;
    }

    const fetched = await this.getBlobPreferPrivate({ namespace: 'derivatives', key: manifestKey });
    const manifestBytes = await this.readStreamToBuffer(fetched.body);
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(new TextDecoder().decode(manifestBytes));
    } catch {
      throw new HttpException('Stored manifest is not valid JSON', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const manifestResult = storedPublicationManifestSchema.safeParse(parsedJson);

    if (!manifestResult.success) {
      throw new HttpException('Stored manifest failed validation', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (this.manifestCache.size >= manifestCacheMaxEntries) {
      // FIFO eviction is enough: entries are immutable and equally cheap to reload.
      const oldest = this.manifestCache.keys().next().value;
      if (oldest !== undefined) {
        this.manifestCache.delete(oldest);
      }
    }

    this.manifestCache.set(manifestKey, manifestResult.data);
    return manifestResult.data;
  }

  /**
   * Brings storage in line with a pending visibility change BEFORE the DB
   * flips: every manifest-listed blob is copied into the target tier
   * (content-addressed — already-present objects are skipped), the manifest's
   * private-tier home is ensured, and any world-readable manifest object at
   * the share-link-derivable public key is deleted (defensive — new publishes
   * never create one).
   *
   * Blobs are deliberately left in their source tier: public copies of
   * previously-public content are irrevocably cached downstream anyway, and
   * deleting shared content-addressed blobs safely requires the per-tier
   * refcount GC that is explicitly out of scope.
   */
  private async reconcileStorageTier(
    publication: Readonly<Pick<typeof schema.publication.$inferSelect, 'id' | 'manifestKey' | 'thumbnailKey'>>,
    targetVisibility: PublicationVisibility,
  ): Promise<void> {
    const manifest = await this.loadStoredManifest(publication.manifestKey);
    const targetTier: StorageTier = targetVisibility === 'private' ? 'private' : 'public';

    await Promise.all(
      Object.entries(manifest.files).map(async ([relativePath, shaRef]) => {
        const key = servedKeyOf(publication, relativePath, this.sha256HexFromManifestRef(relativePath, shaRef));
        /* The key carries how the blob is served (#2008), so a key the target
           tier already holds is never written again: another publication may
           be serving it. */
        if (await this.storage.headBlob({ namespace: 'blobs', key, tier: targetTier })) {
          return;
        }

        const source = await this.getBlobPreferPrivate({ namespace: 'blobs', key });
        const bytes = await this.readStreamToBuffer(source.body);
        await this.storage.putBlob({
          namespace: 'blobs',
          key,
          body: bytes,
          contentType: publicationContentType(relativePath),
          ifNoneMatch: '*',
          cacheControl: targetTier === 'private' ? 'private, no-cache' : 'public, max-age=31536000, immutable',
          tier: targetTier,
        });
      }),
    );

    /* The manifest is written to the private tier by the materializer whatever
       the visibility, so there is no public-origin copy to rescue or delete.
       The upload-era rows that had one are gone with migration 0035 (I15,
       review R9). */
  }

  private async getBlobPreferPrivate(args: {
    namespace: StorageNamespace;
    key: string;
  }): Promise<Awaited<ReturnType<ObjectStorageService['getBlob']>>> {
    try {
      return await this.storage.getBlob({ ...args, tier: 'private' });
    } catch (error) {
      if (!isS3ObjectMissing(error)) {
        throw error;
      }

      return this.storage.getBlob(args);
    }
  }

  private sha256HexFromManifestRef(relativePath: string, shaRef: string): string {
    const match = /^sha256:([0-9a-f]{64})$/iu.exec(shaRef);
    if (!match?.[1]) {
      throw new HttpException(
        `Manifest references invalid digest for ${relativePath}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return match[1];
  }

  private buildPublicationFileUrl(publicationId: string, relativePath: string): string {
    const apiUrl = this.configService.get('TAU_API_URL', { infer: true }).replace(/\/$/u, '');
    return `${apiUrl}/v1/publications/${publicationId}/files?path=${encodeURIComponent(relativePath)}`;
  }

  /**
   * Returns the persisted owner snapshot, or backfills from the Better Auth `user`
   * row when missing (publications created before the `ownerSnapshot` column existed).
   */
  /* oxlint-disable typescript-eslint/no-restricted-types -- DB columns and wire DTO use null */
  private async resolveOwnerSnapshot(publication: {
    readonly id: string;
    readonly ownerId: string;
    readonly projectId: string;
    readonly ownerSnapshot: PublicationOwnerSnapshot | null;
  }): Promise<PublicationOwnerSnapshot | null> {
    if (publication.ownerSnapshot !== null) {
      return publication.ownerSnapshot;
    }
    const backfilled = await this.loadOwnerSnapshot(publication.ownerId);
    if (backfilled === null) {
      return null;
    }
    await this.withActivePublication(publication, async (transaction) => {
      await transaction
        .update(schema.publication)
        .set({ ownerSnapshot: backfilled })
        .where(eq(schema.publication.id, publication.id));
    });
    return backfilled;
  }
  /* oxlint-enable typescript-eslint/no-restricted-types -- end null-type window */

  /** The project, refused unless it is active and the caller owns it. */
  private async assertProjectOwner(args: {
    readonly projectId: string;
    readonly ownerId: string;
  }): Promise<typeof schema.project.$inferSelect> {
    await this.assertActiveProject(args.projectId, args.ownerId);
    const [project] = await this.databaseService.database
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, args.projectId))
      .limit(1);

    if (!project) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Project not found' });
    }

    if (project.ownerId !== args.ownerId) {
      throw new ForbiddenException({
        code: publicationApiCode.PROJECT_FORBIDDEN,
        message: 'Project is owned by another user',
      });
    }

    return project;
  }

  private async selectShareOfProject(database: ShareReader, projectId: string): Promise<ProjectShareRow | undefined> {
    const [share] = await database
      .select()
      .from(schema.projectShare)
      .where(eq(schema.projectShare.projectId, projectId))
      .limit(1);
    return share;
  }

  /** `404` when the link does not exist, `410` when it is stopped. */
  private assertShareLive(share: ProjectShareRow | undefined): asserts share is ProjectShareRow {
    if (share === undefined) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Link not found' });
    }

    if (share.disabledAt !== null) {
      throw new GoneException({ code: publicationApiCode.GONE, message: 'This link is no longer shared' });
    }
  }

  /** The project's live link: `404` when it has none, `410` when it is stopped. */
  private async selectShareOfProjectOrThrow(projectId: string): Promise<ProjectShareRow> {
    const share = await this.selectShareOfProject(this.databaseService.database, projectId);
    this.assertShareLive(share);
    return share;
  }

  /**
   * A live link of an active project and the version it shows, read in one
   * statement so who may open it and what it shows come from the same commit:
   * a publish between two reads could otherwise swap in a version the
   * authorization never saw.
   */
  private async selectLinkOrThrow(
    where: SQL | undefined,
  ): Promise<{ share: ProjectShareRow; current: PublicationRow | undefined }> {
    const [row] = await this.databaseService.database
      .select({ share: schema.projectShare, publication: schema.publication })
      .from(schema.projectShare)
      .innerJoin(schema.project, eq(schema.project.id, schema.projectShare.projectId))
      .leftJoin(
        schema.publication,
        and(eq(schema.publication.id, schema.project.currentPublicationId), isNull(schema.publication.unpublishedAt)),
      )
      .where(where)
      .limit(1);
    const share = row?.share;
    if (share !== undefined) {
      await this.assertActiveProject(share.projectId);
    }
    this.assertShareLive(share);
    return { share, current: row?.publication ?? undefined };
  }

  /** The version the project points at, if it still has one. */
  private async selectCurrentPublication(
    database: ShareReader,
    projectId: string,
  ): Promise<PublicationRow | undefined> {
    const [current] = await database
      .select({ publication: schema.publication })
      .from(schema.project)
      .innerJoin(schema.publication, eq(schema.project.currentPublicationId, schema.publication.id))
      .where(and(eq(schema.project.id, projectId), isNull(schema.publication.unpublishedAt)))
      .limit(1);
    return current?.publication;
  }

  /**
   * The version a live link shows, repaired when it is behind the push. Every read of a publication's bytes routes
   * through here, which is where D19 puts the repair: a row behind the manifest is re-derived and then re-read. A
   * repair that fails leaves the row as it was, so the read serves the version it already recorded once the project
   * is checked active again.
   *
   * The re-read after a repair takes the link and its version together, as the first read did, and authorizes the
   * viewer again: a publish that committed meanwhile (a same-name publish to people you invite reuses the version's
   * id) is served only to someone that link lets in, and a version the link no longer shows is not served at all.
   *
   * @param args - The link and version as first read, the viewer, and the role that read authorized.
   * @returns The link, the version to serve and the viewer's role, all from the same read.
   */
  private async repairCurrentOrThrow(args: {
    share: ProjectShareRow;
    current: PublicationRow | undefined;
    viewerUserId: string | undefined;
    viewerRole: PublicationViewResponse['viewerRole'];
  }): Promise<{
    share: ProjectShareRow;
    publication: PublicationRow;
    viewerRole: PublicationViewResponse['viewerRole'];
  }> {
    const { share, current, viewerUserId, viewerRole } = args;
    if (current === undefined) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Link not found' });
    }

    const repaired = await this.rederivePublications(current);
    // Repair can swallow a lifecycle refusal; check again before serving an earlier row.
    await this.assertActiveProject(current.projectId);
    if (!repaired) {
      return { share, publication: current, viewerRole };
    }

    const reread = await this.selectLinkOrThrow(eq(schema.projectShare.id, share.id));
    if (reread.current?.id !== current.id) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
    }
    return {
      share: reread.share,
      publication: reread.current,
      viewerRole: await this.authorizeShareViewer(reread.share, viewerUserId),
    };
  }

  private async toProjectShareDto(share: ProjectShareRow): Promise<ProjectShare> {
    const db = this.databaseService.database;
    const current = await this.selectCurrentPublication(db, share.projectId);
    const grants = await db
      .select()
      .from(schema.projectShareAccess)
      .where(and(eq(schema.projectShareAccess.shareId, share.id), eq(schema.projectShareAccess.status, 'active')))
      .orderBy(desc(schema.projectShareAccess.createdAt));

    return {
      id: share.id,
      url: this.cloudLinkUrl(share.id),
      visibility: this.linkVisibility(share),
      status: share.disabledAt === null ? 'active' : 'stopped',
      stoppedAt: share.disabledAt?.toISOString() ?? null,
      publishedAt: share.publishedAt?.toISOString() ?? null,
      currentVersion:
        current === undefined ? null : { publicationId: current.id, tag: current.tag, revisionId: current.revisionId },
      access: { grants: await this.toAccessGrantDtos(grants) },
    };
  }

  private async assertActiveProject(projectId: string, userId?: string): Promise<void> {
    await this.databaseService.database.transaction(async (transaction) => {
      await assertActiveProjectLocked(transaction, projectId, userId);
    });
  }

  /** Keep publication mutations and their lifecycle check in the same commit. */
  private async withActivePublication<T>(
    publication: { readonly id: string; readonly projectId: string },
    body: (transaction: PublicationTransaction, fresh: typeof schema.publication.$inferSelect) => Promise<T>,
  ): Promise<T> {
    return this.databaseService.database.transaction(async (transaction) => {
      await assertActiveProjectLocked(transaction, publication.projectId);
      const [fresh] = await transaction
        .select()
        .from(schema.publication)
        .where(eq(schema.publication.id, publication.id))
        .limit(1);
      if (fresh === undefined) {
        throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
      }
      if (fresh.unpublishedAt !== null) {
        throw new GoneException({ code: publicationApiCode.GONE, message: 'Publication is no longer available' });
      }
      return body(transaction, fresh);
    });
  }

  private async loadViewerEmail(viewerUserId: string): Promise<string | undefined> {
    const rows = await this.databaseService.database
      .select({ email: schema.user.email, emailVerified: schema.user.emailVerified })
      .from(schema.user)
      .where(eq(schema.user.id, viewerUserId))
      .limit(1);

    const row = rows[0];
    if (!row?.emailVerified) {
      return undefined;
    }

    return this.normalizeEmail(row.email);
  }

  private async hasActiveShareAccess(args: {
    readonly shareId: string;
    readonly recipientEmail: string;
  }): Promise<boolean> {
    const rows = await this.databaseService.database
      .select({ id: schema.projectShareAccess.id })
      .from(schema.projectShareAccess)
      .where(
        and(
          eq(schema.projectShareAccess.shareId, args.shareId),
          eq(schema.projectShareAccess.recipientEmail, this.normalizeEmail(args.recipientEmail)),
          eq(schema.projectShareAccess.status, 'active'),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Emails one link invite and answers what happened (stable cloud link
   * blueprint E4). The grant exists whatever this answers.
   *
   * An address Resend suppresses would be accepted and then silently dropped,
   * so it is skipped before the owner's daily cap is consumed (bounce blueprint
   * R9). A deployment without an email provider skips before the cap too. The
   * limiter fails closed: sender reputation is not best-effort.
   */
  private async sendLinkInviteEmail(args: {
    readonly ownerId: string;
    readonly recipientEmail: string;
    readonly undeliverable: boolean;
    readonly ownerName: string;
    readonly projectName: string;
    readonly url: string;
  }): Promise<InviteEmailOutcome> {
    const trigger = 'invite';
    if (args.undeliverable) {
      this.logger.log(`Skipping an invite email to an undeliverable recipient for owner ${args.ownerId}`);
      this.metrics.publicationInviteEmailsSuppressedTotal.add(1, { trigger, reason: 'recipient_undeliverable' });
      return { status: 'skipped', reason: 'undeliverable' };
    }

    if (!this.emailService.isDeliveryEnabled) {
      this.metrics.publicationInviteEmailsSuppressedTotal.add(1, { trigger, reason: 'email_disabled' });
      return { status: 'skipped', reason: 'email_disabled' };
    }

    let limit: { allowed: boolean; count: number };
    try {
      limit = await this.publicationRateLimiter.consumeInviteEmailSlots({ ownerId: args.ownerId, count: 1 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Invite email rate limiter unavailable; suppressing an invite email for owner ${args.ownerId}: ${message}`,
      );
      this.metrics.publicationInviteEmailsSuppressedTotal.add(1, { trigger, reason: 'limiter_unavailable' });
      return { status: 'skipped', reason: 'limiter_unavailable' };
    }

    if (!limit.allowed) {
      this.logger.warn(
        `Owner ${args.ownerId} exceeded the daily invite email cap (${limit.count} consumed); suppressing an invite email`,
      );
      this.metrics.publicationInviteEmailsSuppressedTotal.add(1, { trigger, reason: 'cap_exceeded' });
      return { status: 'skipped', reason: 'daily_cap' };
    }

    try {
      const sent = await this.emailService.sendPublicationInvite({
        recipientEmail: args.recipientEmail,
        ownerName: args.ownerName,
        publicationTitle: args.projectName,
        url: args.url,
      });
      if (sent === 'disabled') {
        this.metrics.publicationInviteEmailsSuppressedTotal.add(1, { trigger, reason: 'email_disabled' });
        return { status: 'skipped', reason: 'email_disabled' };
      }
      this.metrics.publicationInviteEmailsTotal.add(1, { trigger, outcome: 'sent' });
      return { status: 'sent' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Link invite email failed for ${this.describeRecipient(args.recipientEmail)}: ${message}`);
      this.metrics.publicationInviteEmailsTotal.add(1, { trigger, outcome: 'failed' });
      return { status: 'skipped', reason: 'send_failed' };
    }
  }

  private describeRecipient(email: string): string {
    const [, domain = 'unknown-domain'] = email.split('@');
    return `recipient@${domain}`;
  }

  /**
   * The undeliverable addresses among the given recipients. A failed read is not a reason to drop invites:
   * Resend still suppresses at send time, so this fails open.
   */
  private async undeliverableRecipients(recipientEmails: readonly string[]): Promise<ReadonlySet<string>> {
    if (this.deliverability === undefined || recipientEmails.length === 0) {
      return new Set();
    }
    try {
      return await this.deliverability.undeliverableAmong(recipientEmails);
    } catch (error) {
      /* The error's message can quote the query, and the query names the addresses. */
      const name = error instanceof Error ? error.name : 'unknown';
      this.logger.warn(`Email deliverability lookup failed (${name}); treating recipients as deliverable`);
      return new Set();
    }
  }

  private async toAccessGrantDtos(rows: readonly ProjectShareAccessRow[]): Promise<ProjectShareAccessGrant[]> {
    const undeliverable = await this.undeliverableRecipients(rows.map((row) => row.recipientEmail));
    return rows.map((row) => this.toAccessGrantDto(row, undeliverable));
  }

  private toAccessGrantDto(row: ProjectShareAccessRow, undeliverable: ReadonlySet<string>): ProjectShareAccessGrant {
    return {
      id: row.id,
      recipientEmail: row.recipientEmail,
      status: row.status as ProjectShareAccessGrant['status'],
      createdAt: row.createdAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      // Only "Not delivered": whether the mailbox is missing or its owner reported the mail is theirs (D5).
      notDelivered: undeliverable.has(this.normalizeEmail(row.recipientEmail)),
    };
  }

  private async readStreamToBuffer(body: Readable): Promise<Uint8Array<ArrayBuffer>> {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of body) {
      if (chunk instanceof Uint8Array) {
        chunks.push(new Uint8Array(chunk));
        continue;
      }

      if (typeof chunk === 'string') {
        chunks.push(new TextEncoder().encode(chunk));
        continue;
      }

      throw new HttpException('Unexpected manifest stream chunk', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return concatUint8Arrays(chunks);
  }
}
