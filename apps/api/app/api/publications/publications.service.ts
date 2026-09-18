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
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { PublicationOwnerSnapshot } from '@taucad/types';
import { idPrefix, publicationApiCode } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { Environment } from '#config/environment.config.js';
import type {
  PublicationViewResponse,
  PublishRequest,
  PublishResponse,
  PublicationWireRow,
  PublicationAccessGrant,
  PublicationAccessList,
  PublicationVisibilityUpdate,
  ProjectShareEnvelope,
  StoredPublicationManifest,
} from '#api/publications/publications.dto.js';
import { storedPublicationManifestSchema } from '#api/publications/publications.dto.js';
import {
  leaseGitRunner,
  materializePublication,
  materializePublishedTags,
  releaseManifestBlobs,
} from '#api/publications/publication-materializer.js';
import type { MaterializedPublication, MaterializerDependencies } from '#api/publications/publication-materializer.js';
import type { ResolvedViewerIdentity } from '#api/publications/viewer-identity.types.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { hydrateLease } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { repositoryStoreKey } from '#api/git/git.constants.js';
import { resolveLfsObjectLocation } from '#api/git/lfs-keys.js';
import { DatabaseService } from '#database/database.service.js';
import { EmailService } from '#email/email.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import { RedisService } from '#redis/redis.service.js';
import * as schema from '#database/schema.js';
import { ObjectStorageService, isS3ObjectMissing } from '#storage/object-storage.service.js';
import type { StorageTier } from '#storage/object-storage.service.js';
import type { StorageNamespace } from '#storage/storage.constants.js';
import { concatUint8Arrays } from '#storage/concat-uint8-arrays.js';
import { blobKeyFromSha256Hex } from '#storage/sha256.utils.js';
import { MetricsService } from '#telemetry/metrics.js';
import { buildPublicationViewUrl } from '#email/email-link-builder.js';

/** The shared placeholder card image every publication starts with. */
const defaultOgImageKey = 'defaults/og.png';
type ProjectShareCurrentPublication = NonNullable<ProjectShareEnvelope['currentPublication']>;
type ProjectShareProject = ProjectShareEnvelope['project'];

const normalizeRelativePath = (relativePathValue: string): string =>
  relativePathValue.replaceAll('\\', '/').replace(/^\.\/+/, '');

const manifestCacheMaxEntries = 256;

const isWebp = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  bytes.byteLength >= 12 &&
  new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
  new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';

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
  ) {}

  /**
   * Private publications are Pro-gated (tiers doc T4/AD11 — public sharing is
   * never gated). Grandfathering (T16): a user who lost the entitlement may
   * still republish content to a project whose current publication is ALREADY
   * private; only newly-private visibility requires the entitlement.
   */
  /** What the materializer needs, which this service already holds. */
  private get materializer(): MaterializerDependencies {
    return {
      databaseService: this.databaseService,
      storage: this.storage,
      /* This service's children are bounded by the requests that start them —
         one publish, one repair — rather than by the smart-HTTP route's own
         ceiling, which is no longer reachable from here (review R8). */
      git: leaseGitRunner,
      /* The LFS endpoint's own resolver, so a publication reads an object from
         wherever that endpoint serves it: the tenant key, or the pre-D24 one
         for a project the relocation has not reached (W4b). */
      resolveLfsObject: async (object) => {
        const held = await resolveLfsObjectLocation(this.storage, object);
        return held?.location;
      },
    };
  }

  private async assertPrivateVisibilityAllowed(args: { ownerId: string; projectId?: string }): Promise<void> {
    const entitlements = await this.entitlementsService.getEntitlements(args.ownerId);
    if (entitlements.canCreatePrivateShares) {
      return;
    }

    if (args.projectId !== undefined) {
      const [existing] = await this.databaseService.database
        .select({ visibility: schema.publication.visibility })
        .from(schema.project)
        .innerJoin(schema.publication, eq(schema.project.currentPublicationId, schema.publication.id))
        .where(and(eq(schema.project.id, args.projectId), eq(schema.project.ownerId, args.ownerId)))
        .limit(1);
      if (existing?.visibility === 'private') {
        // Content-only update to a grandfathered private publication.
        return;
      }
    }

    throw new ForbiddenException({
      code: publicationApiCode.ENTITLEMENT_REQUIRED,
      message: 'Private publications require the Pro plan',
    });
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
   * Record or re-point one publication on the synced graph (S32, D11, A21).
   *
   * Nothing is uploaded here: by the time this is called the client has pushed
   * the history set — the branch and the named version, LFS objects included —
   * to this project's repository on the Tau Hosted Remote, so the bytes are
   * already on the volume and in R2. What this does is create or re-point the
   * row and materialize the tagged tree into the same sha256-keyed blob store
   * the viewer has always read, which is why the CDN and private-proxy paths
   * are untouched.
   *
   * Re-publishing the same name re-points the row it already has: the share URL
   * is stable, the reference counts move from the old manifest to the new one,
   * and the tag history is the publication history.
   *
   * @param args - The owner and the pointer they are publishing.
   * @returns The publication id and its links.
   */
  public async publishFromRevision(args: { ownerId: string; request: PublishRequest }): Promise<PublishResponse> {
    const { ownerId, request } = args;
    const sharedEmails = request.visibility === 'private' ? (request.sharedEmails ?? []) : [];

    if (request.visibility === 'private') {
      await this.assertPrivateVisibilityAllowed({ ownerId, projectId: request.projectId });
    }

    /* The other route that reaches `ensureRepository`, checked in the same pass
       as N5. Publishing a named version presupposes the push that created it,
       and a push needs this entitlement — so this refuses nobody who could
       otherwise have succeeded, and it stops an un-entitled caller creating a
       bare repository on the volume for a tag that can never exist (review C11). */
    const publishEntitlements = await this.entitlementsService.getEntitlements(ownerId);
    if (!publishEntitlements.canSyncFiles) {
      throw new ForbiddenException({
        code: 'GIT_SYNC_NOT_ENTITLED',
        message: 'Syncing files to Tau Cloud is a paid plan feature.',
      });
    }

    const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true }).replace(/\/$/u, '');
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

    /* The lease is the repository: it is hydrated from the manifest, read, and
       disposed here (D9). It stays open across the transaction below because
       that is where the tagged tree is read and the blobs are written — the
       reference counts must be taken before any of it (D10). */
    const published = await this.withLease({ projectId: request.projectId, ownerId }, async (lease) =>
      db.transaction(async (tx) => {
        /* One writer of this project's publications at a time, the same lock a
           read-side repair takes: the row this reads decides which manifest is
           released below, and two writers reading it before either commits
           would release that manifest twice (review F2). */
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${request.projectId}, 0))`);

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
            projectId: request.projectId,
            ownerId,
            directory: lease.directory,
            tag: request.tag,
            visibility: request.visibility,
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

        await this.writePublicationRows({ tx, ownerId, request, publicationId, sharedEmails, ownerSnapshot, version });
        return { version, publicationId, superseded: currentRow?.manifestKey };
      }),
    );
    const { version: materialized, publicationId } = published;

    /* The superseded manifest's counts go back only once the row points at the
     * new one, so a failure above never drops a live reference. The row it came
     * from was read under the lock, so no second writer released it too. */
    if (published.superseded !== undefined && published.superseded !== materialized.manifestKey) {
      await releaseManifestBlobs(this.materializer, published.superseded);
    }

    const viewUrl = buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId });
    if (request.notifyRecipients === true && sharedEmails.length > 0) {
      await this.sendPublicationInviteNotifications({
        ownerId,
        trigger: 'publish',
        recipientEmails: sharedEmails,
        ownerName: ownerSnapshot?.name ?? 'A Tau user',
        publicationTitle: request.title,
        url: viewUrl,
      });
    }

    return {
      id: publicationId,
      urls: {
        view: viewUrl,
        share: viewUrl,
        og: this.storage.publicUrl(splitNamespaceKey(defaultOgImageKey)),
        thumbnail: this.storage.publicUrl(splitNamespaceKey(materialized.thumbnailKey)),
      },
    };
  }

  public async getPublicationForViewer(args: {
    publicationId: string;
    viewerUserId?: string;
  }): Promise<PublicationViewResponse> {
    const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true }).replace(/\/$/u, '');

    const publication = await this.loadPublicationOrThrow(args.publicationId);
    const viewerRole = await this.authorizePublicationViewer(publication, args.viewerUserId);

    const { manifestKey, ogImageKey, thumbnailKey } = publication;

    const urls = {
      view: buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId: publication.id }),
      share: buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId: publication.id }),
      og: this.storage.publicUrl(splitNamespaceKey(ogImageKey ?? 'defaults/og.png')),
      thumbnail: this.storage.publicUrl(splitNamespaceKey(thumbnailKey ?? 'defaults/thumb.webp')),
    };

    const manifest = await this.loadStoredManifest(manifestKey);
    const files: Record<string, string> = {};

    for (const [relativePath, shaRef] of Object.entries(manifest.files)) {
      const sha256Hex = this.sha256HexFromManifestRef(relativePath, shaRef);

      // Private bytes are only reachable through the authenticated,
      // publication-scoped proxy; public publications keep direct CDN URLs
      // (the public cost model depends on them).
      files[relativePath] =
        publication.visibility === 'private'
          ? this.buildPublicationFileUrl(publication.id, relativePath)
          : this.storage.publicUrl({ namespace: 'blobs', key: blobKeyFromSha256Hex(sha256Hex) });
    }

    const ownerSnapshot = await this.resolveOwnerSnapshot(publication);

    const publicationDto: PublicationWireRow = {
      id: publication.id,
      projectId: publication.projectId,
      tag: publication.tag,
      revisionId: publication.revisionId,
      ownerId: publication.ownerId,
      parentPublicationId: publication.parentPublicationId,
      visibility: publication.visibility as PublicationWireRow['visibility'],
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
   * Re-checks the viewer's grant on EVERY request (revocation is immediate)
   * and validates the requested path against the publication's own manifest,
   * so a sha from another publication can never be re-scoped (threat T5).
   *
   * The returned `etag` is the content sha — a strong validator the controller
   * uses for `If-None-Match` revalidation without touching storage.
   */
  public async resolvePublicationFile(args: {
    publicationId: string;
    viewerUserId?: string;
    path: string;
  }): Promise<{ sha256Hex: string; etag: string; path: string }> {
    if (!args.path) {
      throw new BadRequestException({ code: publicationApiCode.INVALID_PATH, message: 'Missing path query' });
    }

    const publication = await this.loadPublicationOrThrow(args.publicationId);
    await this.authorizePublicationViewer(publication, args.viewerUserId);

    const path = normalizeRelativePath(args.path);
    const manifest = await this.loadStoredManifest(publication.manifestKey);
    const shaRef = manifest.files[path];
    if (shaRef === undefined) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'File not found in publication' });
    }

    const sha256Hex = this.sha256HexFromManifestRef(args.path, shaRef);

    return { sha256Hex, etag: `"${sha256Hex}"`, path };
  }

  /**
   * Opens the blob stream for a resolved publication file. Reads the private
   * tier first and falls back to the public bucket as a defensive cross-tier
   * read. Authorization happened in `resolvePublicationFile` — the source
   * bucket does not affect it.
   */
  public async openPublicationFile(
    sha256Hex: string,
    path: string,
  ): Promise<{ body: Readable; contentType: string; contentLength?: number }> {
    const blob = await this.getBlobPreferPrivate({ namespace: 'blobs', key: blobKeyFromSha256Hex(sha256Hex) });
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

  public async listAccessGrants(args: { publicationId: string; ownerId: string }): Promise<PublicationAccessList> {
    await this.assertPublicationOwner(args);

    const rows = await this.databaseService.database
      .select()
      .from(schema.publicationAccess)
      .where(
        and(
          eq(schema.publicationAccess.publicationId, args.publicationId),
          eq(schema.publicationAccess.status, 'active'),
        ),
      )
      .orderBy(desc(schema.publicationAccess.createdAt));

    return { grants: rows.map((row) => this.toAccessGrantDto(row)) };
  }

  public async updateVisibility(args: {
    publicationId: string;
    ownerId: string;
    visibility: PublicationVisibilityUpdate['visibility'];
  }): Promise<PublicationVisibilityUpdate> {
    const publication = await this.assertPublicationOwner(args);

    if (publication.unpublishedAt) {
      throw new GoneException({
        code: publicationApiCode.GONE,
        message: 'Publication is no longer available',
      });
    }

    if (publication.visibility === args.visibility) {
      return { id: publication.id, visibility: args.visibility };
    }

    // Changing TO private is the entitlement-gated direction (T4/T16); flipping
    // back to public is always allowed.
    if (args.visibility === 'private') {
      await this.assertPrivateVisibilityAllowed({ ownerId: args.ownerId });
    }

    // Storage first, DB second: if any copy/delete fails the publication keeps
    // its current visibility, so the serving tier never lags the DB flag
    // (a private flip can never leave bytes only on the anonymous origin, and
    // a public flip can never emit CDN URLs that 404).
    await this.reconcileStorageTier(publication, args.visibility);

    const [updated] = await this.databaseService.database
      .update(schema.publication)
      .set({ visibility: args.visibility })
      .where(eq(schema.publication.id, publication.id))
      .returning({
        id: schema.publication.id,
        visibility: schema.publication.visibility,
      });

    if (!updated) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
    }

    return {
      id: updated.id,
      visibility: updated.visibility as PublicationVisibilityUpdate['visibility'],
    };
  }

  public async getProjectShareEnvelope(args: { projectId: string; ownerId: string }): Promise<ProjectShareEnvelope> {
    const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true }).replace(/\/$/u, '');
    const db = this.databaseService.database;

    const projectRows = await db.select().from(schema.project).where(eq(schema.project.id, args.projectId)).limit(1);
    const project = projectRows[0];

    if (!project) {
      return this.toUnpublishedProjectShareEnvelope({
        id: args.projectId,
        name: null,
        description: null,
      });
    }

    if (project.ownerId !== args.ownerId) {
      throw new ForbiddenException({
        code: publicationApiCode.PROJECT_FORBIDDEN,
        message: 'Project is owned by another user',
      });
    }

    const projectSummary = {
      id: project.id,
      name: project.name,
      description: project.description,
    };

    if (!project.currentPublicationId) {
      return this.toUnpublishedProjectShareEnvelope(projectSummary);
    }

    const publicationRows = await db
      .select()
      .from(schema.publication)
      .where(and(eq(schema.publication.id, project.currentPublicationId), eq(schema.publication.projectId, project.id)))
      .limit(1);
    const publication = publicationRows[0];

    if (!publication || publication.unpublishedAt) {
      return this.toUnpublishedProjectShareEnvelope(projectSummary);
    }

    const grants = await db
      .select()
      .from(schema.publicationAccess)
      .where(
        and(eq(schema.publicationAccess.publicationId, publication.id), eq(schema.publicationAccess.status, 'active')),
      )
      .orderBy(desc(schema.publicationAccess.createdAt));

    const shareUrl = buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId: publication.id });

    return {
      project: projectSummary,
      currentPublication: {
        id: publication.id,
        tag: publication.tag,
        title: publication.title,
        description: publication.description,
        visibility: publication.visibility as ProjectShareCurrentPublication['visibility'],
        createdAt: publication.createdAt.toISOString(),
        urls: { share: shareUrl },
        access: { grants: grants.map((grant) => this.toAccessGrantDto(grant)) },
      },
      snapshot: {
        state: 'published-current',
        lastPublishedAt: publication.createdAt.toISOString(),
      },
    };
  }

  public async inviteAccess(args: {
    publicationId: string;
    ownerId: string;
    recipientEmail: string;
    notifyRecipient?: boolean;
  }): Promise<PublicationAccessGrant> {
    const publication = await this.assertPublicationOwner(args);
    const recipientEmail = this.normalizeEmail(args.recipientEmail);

    if (publication.visibility !== 'private') {
      throw new BadRequestException({
        code: publicationApiCode.FORBIDDEN,
        message: 'Only private publications can invite recipients',
      });
    }

    const existingRows = await this.databaseService.database
      .select()
      .from(schema.publicationAccess)
      .where(
        and(
          eq(schema.publicationAccess.publicationId, publication.id),
          eq(schema.publicationAccess.recipientEmail, recipientEmail),
        ),
      )
      .limit(1);
    const existingGrant = existingRows[0];

    const [grant] = await this.databaseService.database
      .insert(schema.publicationAccess)
      .values({
        id: generatePrefixedId(idPrefix.publicationAccess),
        publicationId: publication.id,
        ownerId: args.ownerId,
        recipientEmail,
        status: 'active',
        createdAt: new Date(),
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: [schema.publicationAccess.publicationId, schema.publicationAccess.recipientEmail],
        set: { status: 'active', revokedAt: null },
      })
      .returning();

    if (!grant) {
      throw new HttpException('Publication invite failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (args.notifyRecipient === true && existingGrant?.status !== 'active') {
      const ownerSnapshot = await this.resolveOwnerSnapshot(publication);
      const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true }).replace(/\/$/u, '');
      await this.sendPublicationInviteNotifications({
        ownerId: args.ownerId,
        trigger: 'invite',
        recipientEmails: [recipientEmail],
        ownerName: ownerSnapshot?.name ?? 'A Tau user',
        publicationTitle: publication.title,
        url: buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId: publication.id }),
      });
    }

    return this.toAccessGrantDto(grant);
  }

  public async revokeAccess(args: {
    publicationId: string;
    ownerId: string;
    accessId: string;
  }): Promise<PublicationAccessGrant> {
    await this.assertPublicationOwner(args);

    const [grant] = await this.databaseService.database
      .update(schema.publicationAccess)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(
        and(
          eq(schema.publicationAccess.id, args.accessId),
          eq(schema.publicationAccess.publicationId, args.publicationId),
        ),
      )
      .returning();

    if (!grant) {
      throw new NotFoundException({
        code: publicationApiCode.NOT_FOUND,
        message: 'Publication access grant not found',
      });
    }

    return this.toAccessGrantDto(grant);
  }

  /**
   * Records a publication view ping. Increments durable `viewCount` only when:
   * (1) caller is not the owner, (2) the per-identity 5/day cap is not exceeded,
   * (3) Redis HLL `PFADD` reports the viewer as new for the day.
   *
   * Throws `429 RATE_LIMITED` when the cap is hit, `404` when the publication does not exist,
   * `410` when it has been unpublished.
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
      await this.databaseService.database
        .update(schema.publication)
        .set({ viewCount: sql`${schema.publication.viewCount} + 1` })
        .where(eq(schema.publication.id, publication.id));
    }
  }

  /**
   * One lease over this project's repository, disposed however the body ends.
   *
   * The publish path and the derived-state repair both read a tagged tree, and
   * a tagged tree only exists inside a lease: the manifest and the packs it
   * names are the repository, and this directory is a disposable copy of them
   * (charter D9, NI1).
   *
   * @param args - Whose repository, and which project.
   * @param body - What to do with the lease.
   * @returns Whatever the body returned.
   */
  private async withLease<T>(
    args: { readonly projectId: string; readonly ownerId: string },
    body: (lease: RepositoryLease) => Promise<T>,
  ): Promise<T> {
    const lease = await hydrateLease({
      store: this.repositoryStore,
      locator: repositoryLocator({ ownerId: args.ownerId, projectId: args.projectId }),
    });
    try {
      return await body(lease);
    } finally {
      await lease.dispose();
    }
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
   * @returns Whether anything was re-materialized, so the caller re-reads.
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

      return await this.withLease(publication, async (lease) => {
        /* Every tag the manifest holds, not just the ones a push moved: after a
           crash nobody knows which ones were done, and a tag whose publication
           already records that oid is skipped without reading a byte. */
        const materialized = await materializePublishedTags(this.materializer, {
          projectId: publication.projectId,
          ownerId: publication.ownerId,
          directory: lease.directory,
          tags: tags.map(([ref, value]) => ({ ref, oid: value.oid })),
        });
        return materialized.length > 0;
      });
    } catch (error) {
      /* The read still serves what the row points at; nothing moved, and the
         next observation retries. */
      this.logger.warn({ err: error, projectId: publication.projectId }, 'Publications could not be re-derived');
      return false;
    }
  }

  /**
   * The rows one publish writes, inside the transaction that took its counts.
   *
   * Extracted only so the publish path reads as what it is: one lease, one
   * transaction, and the same row writes it always made.
   *
   * @param args - The open transaction, the request, and the version written.
   */
  private async writePublicationRows(args: {
    tx: Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];
    ownerId: string;
    request: PublishRequest;
    publicationId: string;
    sharedEmails: readonly string[];
    /* oxlint-disable-next-line typescript/no-restricted-types -- `loadOwnerSnapshot` answers `null`, as the nullable column does */
    ownerSnapshot: PublicationOwnerSnapshot | null;
    version: MaterializedPublication;
  }): Promise<void> {
    const { tx, ownerId, request, publicationId, sharedEmails, ownerSnapshot, version } = args;
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- Drizzle `onConflictDoUpdate.target` column refs */
    await tx
      .insert(schema.project)
      .values({
        id: request.projectId,
        ownerId,
        name: request.projectName,
        description: request.description,
        origin: 'local-mirror',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.project.id,
        set: { name: request.projectName, description: request.description, updatedAt: new Date() },
      });

    await tx
      .insert(schema.publication)
      .values({
        id: publicationId,
        projectId: request.projectId,
        ownerId,
        tag: request.tag,
        revisionId: version.revisionId,
        visibility: request.visibility,
        manifestKey: version.manifestKey,
        ogImageKey: defaultOgImageKey,
        thumbnailKey: version.thumbnailKey,
        runtimePin: version.runtimePin,
        kernels: [...version.kernels],
        entryPath: request.entryPath,
        title: request.title,
        description: request.description,
        ownerSnapshot,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.publication.projectId, schema.publication.tag],
        set: {
          revisionId: version.revisionId,
          visibility: request.visibility,
          manifestKey: version.manifestKey,
          thumbnailKey: version.thumbnailKey,
          runtimePin: version.runtimePin,
          kernels: [...version.kernels],
          entryPath: request.entryPath,
          title: request.title,
          description: request.description,
          unpublishedAt: null,
        },
      });
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment */

    await tx
      .update(schema.project)
      .set({ currentPublicationId: publicationId, updatedAt: new Date() })
      .where(eq(schema.project.id, request.projectId));

    if (sharedEmails.length > 0) {
      await tx
        .insert(schema.publicationAccess)
        .values(
          sharedEmails.map((recipientEmail) => ({
            id: generatePrefixedId(idPrefix.publicationAccess),
            publicationId,
            ownerId,
            recipientEmail,
            status: 'active',
            createdAt: new Date(),
            revokedAt: null,
          })),
        )
        .onConflictDoUpdate({
          target: [schema.publicationAccess.publicationId, schema.publicationAccess.recipientEmail],
          set: { status: 'active', revokedAt: null },
        });
    }
  }

  private async loadPublicationOrThrow(publicationId: string): Promise<typeof schema.publication.$inferSelect> {
    const publication = await this.selectPublicationOrThrow(publicationId);
    /* Every read of a publication routes through here, which is where D19 puts
       the repair: a row behind the manifest is re-derived and then re-read, so
       what this returns is never a version the push already superseded. */
    return (await this.rederivePublications(publication)) ? this.selectPublicationOrThrow(publicationId) : publication;
  }

  /** One publication row, refused when it is absent or withdrawn. */
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

    return publication;
  }

  /**
   * Layered access check for a publication: public → everyone; private →
   * 401 unauthenticated, 403 unless owner or active email-grantee.
   * Shared by the envelope route and the file proxy so both boundaries
   * enforce identical semantics.
   */
  private async authorizePublicationViewer(
    publication: { readonly id: string; readonly ownerId: string; readonly visibility: string },
    viewerUserId: string | undefined,
  ): Promise<PublicationViewResponse['viewerRole']> {
    let viewerRole: PublicationViewResponse['viewerRole'] = 'public';
    if (viewerUserId === publication.ownerId) {
      viewerRole = 'owner';
    }

    if (publication.visibility === 'private') {
      if (viewerUserId === undefined) {
        throw new UnauthorizedException({
          code: publicationApiCode.UNAUTHORIZED,
          message: 'Authentication required',
        });
      }

      if (viewerUserId !== publication.ownerId) {
        const viewerEmail = await this.loadViewerEmail(viewerUserId);
        const hasGrant = viewerEmail
          ? await this.hasActivePublicationAccess({
              publicationId: publication.id,
              recipientEmail: viewerEmail,
            })
          : false;

        if (!hasGrant) {
          throw new ForbiddenException({
            code: publicationApiCode.FORBIDDEN,
            message: 'Publication is private',
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
    publication: { readonly id: string; readonly manifestKey: string },
    targetVisibility: PublicationVisibilityUpdate['visibility'],
  ): Promise<void> {
    const manifest = await this.loadStoredManifest(publication.manifestKey);
    const targetTier: StorageTier = targetVisibility === 'private' ? 'private' : 'public';

    await Promise.all(
      Object.entries(manifest.files).map(async ([relativePath, shaRef]) => {
        const key = blobKeyFromSha256Hex(this.sha256HexFromManifestRef(relativePath, shaRef));
        const contentType = relativePath === 'thumbnail.webp' ? 'image/webp' : 'application/octet-stream';
        const existing = await this.storage.headBlob({ namespace: 'blobs', key, tier: targetTier });
        if (existing && existing.contentType === contentType) {
          return;
        }

        const source = existing
          ? await this.storage.getBlob({ namespace: 'blobs', key, tier: targetTier })
          : await this.getBlobPreferPrivate({ namespace: 'blobs', key });
        const bytes = await this.readStreamToBuffer(source.body);
        await this.storage.putBlob({
          namespace: 'blobs',
          key,
          body: bytes,
          contentType,
          ...(existing ? {} : { ifNoneMatch: '*' }),
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
    readonly ownerSnapshot: PublicationOwnerSnapshot | null;
  }): Promise<PublicationOwnerSnapshot | null> {
    if (publication.ownerSnapshot !== null) {
      return publication.ownerSnapshot;
    }
    const backfilled = await this.loadOwnerSnapshot(publication.ownerId);
    if (backfilled === null) {
      return null;
    }
    await this.databaseService.database
      .update(schema.publication)
      .set({ ownerSnapshot: backfilled })
      .where(eq(schema.publication.id, publication.id));
    return backfilled;
  }
  /* oxlint-enable typescript-eslint/no-restricted-types -- end null-type window */

  private async assertPublicationOwner(args: {
    readonly publicationId: string;
    readonly ownerId: string;
  }): Promise<typeof schema.publication.$inferSelect> {
    const rows = await this.databaseService.database
      .select()
      .from(schema.publication)
      .where(eq(schema.publication.id, args.publicationId))
      .limit(1);

    const publication = rows[0];
    if (!publication) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
    }

    if (publication.ownerId !== args.ownerId) {
      throw new ForbiddenException({
        code: publicationApiCode.FORBIDDEN,
        message: 'Publication is owned by another user',
      });
    }

    return publication;
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

  private async hasActivePublicationAccess(args: {
    readonly publicationId: string;
    readonly recipientEmail: string;
  }): Promise<boolean> {
    const rows = await this.databaseService.database
      .select({ id: schema.publicationAccess.id })
      .from(schema.publicationAccess)
      .where(
        and(
          eq(schema.publicationAccess.publicationId, args.publicationId),
          eq(schema.publicationAccess.recipientEmail, this.normalizeEmail(args.recipientEmail)),
          eq(schema.publicationAccess.status, 'active'),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async sendPublicationInviteNotifications(args: {
    readonly ownerId: string;
    readonly trigger: 'publish' | 'invite';
    readonly recipientEmails: readonly string[];
    readonly ownerName: string;
    readonly publicationTitle: string;
    readonly url: string;
  }): Promise<void> {
    const emailCount = args.recipientEmails.length;

    let limit: { allowed: boolean; count: number };
    try {
      limit = await this.publicationRateLimiter.consumeInviteEmailSlots({ ownerId: args.ownerId, count: emailCount });
    } catch (error) {
      // Fail closed: notification is best-effort, but sender reputation is not — if the
      // limiter is unavailable we drop the emails rather than risk unbounded sending.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Invite email rate limiter unavailable; suppressing ${emailCount} notification(s) for owner ${args.ownerId}: ${message}`,
      );
      this.metrics.publicationInviteEmailsSuppressedTotal.add(emailCount, {
        trigger: args.trigger,
        reason: 'limiter_unavailable',
      });
      return;
    }

    if (!limit.allowed) {
      this.logger.warn(
        `Owner ${args.ownerId} exceeded the daily invite email cap (${limit.count} consumed); suppressing ${emailCount} notification(s)`,
      );
      this.metrics.publicationInviteEmailsSuppressedTotal.add(emailCount, {
        trigger: args.trigger,
        reason: 'cap_exceeded',
      });
      return;
    }

    await Promise.all(
      args.recipientEmails.map(async (recipientEmail) => {
        try {
          await this.emailService.sendPublicationInvite({
            recipientEmail,
            ownerName: args.ownerName,
            publicationTitle: args.publicationTitle,
            url: args.url,
          });
          this.metrics.publicationInviteEmailsTotal.add(1, { trigger: args.trigger, outcome: 'sent' });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Publication invite email failed for ${this.describeRecipient(recipientEmail)}: ${message}`);
          this.metrics.publicationInviteEmailsTotal.add(1, { trigger: args.trigger, outcome: 'failed' });
        }
      }),
    );
  }

  private describeRecipient(email: string): string {
    const [, domain = 'unknown-domain'] = email.split('@');
    return `recipient@${domain}`;
  }

  private toUnpublishedProjectShareEnvelope(project: ProjectShareProject): ProjectShareEnvelope {
    return {
      project,
      currentPublication: null,
      snapshot: { state: 'unpublished' },
    };
  }

  private toAccessGrantDto(row: typeof schema.publicationAccess.$inferSelect): PublicationAccessGrant {
    return {
      id: row.id,
      publicationId: row.publicationId,
      recipientEmail: row.recipientEmail,
      status: row.status as PublicationAccessGrant['status'],
      createdAt: row.createdAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
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
