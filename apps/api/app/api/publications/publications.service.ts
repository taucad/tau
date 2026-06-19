import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { PublicationOwnerSnapshot } from '@taucad/types';
import {
  idPrefix,
  publicationApiCode,
  publishForbiddenPathPrefixes,
  isPublishableTauPath,
} from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { Environment } from '#config/environment.config.js';
import { detectKernelIdsFromRelativePaths, resolveRuntimePin } from '#api/publications/publication-runtime.utils.js';
import type {
  PublicationViewResponse,
  PublishManifest,
  PublishResponse,
  PublicationWireRow,
  PublicationAccessGrant,
  PublicationAccessList,
  PublicationVisibilityUpdate,
  ProjectShareEnvelope,
} from '#api/publications/publications.dto.js';
import { storedPublicationManifestSchema } from '#api/publications/publications.dto.js';
import type { ResolvedViewerIdentity } from '#api/publications/viewer-identity.types.js';
import { ViewRateLimiterService } from '#api/publications/view-rate-limiter.service.js';
import { DatabaseService } from '#database/database.service.js';
import { EmailService } from '#email/email.service.js';
import { RedisService } from '#redis/redis.service.js';
import * as schema from '#database/schema.js';
import { concatUint8Arrays } from '#storage/concat-uint8-arrays.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';
import { MetricsService } from '#telemetry/metrics.js';
import { buildPublicationViewUrl } from '#email/email-link-builder.js';

const maxBytesPerFile = 25 * 1024 * 1024;
const maxTotalBytes = 50 * 1024 * 1024;
const maxFiles = 200;
type ProjectShareCurrentPublication = NonNullable<ProjectShareEnvelope['currentPublication']>;
type ProjectShareProject = ProjectShareEnvelope['project'];

const normalizeRelativePath = (relativePathValue: string): string =>
  relativePathValue.replaceAll('\\', '/').replace(/^\.\/+/, '');

const assertAllowedRelativePath = (relativePathValue: string): void => {
  const normalized = normalizeRelativePath(relativePathValue);
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new BadRequestException({ code: publicationApiCode.INVALID_PATH, message: 'Invalid relative path' });
  }

  const isTauPath = normalized === '.tau' || normalized.startsWith('.tau/');
  const tauForbidden = isTauPath && !isPublishableTauPath(normalized);
  const prefixForbidden = publishForbiddenPathPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix) || normalized.includes(`/${prefix}`),
  );

  if (tauForbidden || prefixForbidden) {
    throw new BadRequestException({
      code: publicationApiCode.FORBIDDEN_PATH,
      message: `Path not allowed: ${relativePathValue}`,
    });
  }
};

@Injectable()
export class PublicationsService {
  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly configService: ConfigService<Environment, true>,
    private readonly redisService: RedisService,
    private readonly viewRateLimiter: ViewRateLimiterService,
    private readonly metrics: MetricsService,
    private readonly emailService: EmailService,
  ) {}

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

  public async publishFromUpload(args: {
    ownerId: string;
    manifest: PublishManifest;
    files: Map<string, Uint8Array<ArrayBuffer>>;
  }): Promise<PublishResponse> {
    const { ownerId, manifest, files } = args;
    const sharedEmails = manifest.visibility === 'private' ? (manifest.sharedEmails ?? []) : [];

    if (!files.has(manifest.entryFile)) {
      throw new BadRequestException({
        code: publicationApiCode.MISSING_ENTRY_FILE,
        message: `Upload is missing entry file ${manifest.entryFile}`,
      });
    }

    if (files.size > maxFiles) {
      throw new BadRequestException({
        code: publicationApiCode.TOO_MANY_FILES,
        message: `Maximum ${maxFiles} files exceeded`,
      });
    }

    let totalBytes = 0;
    for (const [path, buf] of files) {
      assertAllowedRelativePath(path);
      if (buf.byteLength > maxBytesPerFile) {
        throw new BadRequestException({
          code: publicationApiCode.FILE_TOO_LARGE,
          message: `File exceeds ${maxBytesPerFile} bytes`,
        });
      }

      totalBytes += buf.byteLength;
    }

    if (totalBytes > maxTotalBytes) {
      throw new BadRequestException({
        code: publicationApiCode.PAYLOAD_TOO_LARGE,
        message: 'Total upload exceeds limit',
      });
    }

    if (manifest.visibility === 'public' && (manifest.sharedEmails?.length ?? 0) > 0) {
      throw new BadRequestException({
        code: publicationApiCode.FORBIDDEN,
        message: 'Shared emails can only be used with private publications',
      });
    }

    const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true }).replace(/\/$/u, '');

    const publicationId = generatePrefixedId(idPrefix.publication);
    const runtimePin = resolveRuntimePin();
    const kernels = detectKernelIdsFromRelativePaths([...files.keys()]);

    const manifestKey = `publications/${publicationId}/manifest.json`;
    const ogImageKey = 'defaults/og.png';
    const thumbnailKey = 'defaults/thumb.webp';

    const ownerSnapshot = await this.loadOwnerSnapshot(ownerId);

    const db = this.databaseService.database;

    const incrementBlobRef = async (sha256Hex: string, sizeBytes: number): Promise<void> => {
      await db
        .insert(schema.blobRef)
        .values({ sha256: sha256Hex, sizeBytes: BigInt(sizeBytes), refcount: 1 })
        .onConflictDoUpdate({
          target: schema.blobRef.sha256,
          set: { refcount: sql`${schema.blobRef.refcount} + 1` },
        });
    };

    await Promise.all(
      [...files.entries()].map(async ([, buf]) => {
        const sha = sha256HexFromBytes(new Uint8Array(buf));
        const key = blobKeyFromSha256Hex(sha);
        await this.storage.putBlob({
          namespace: 'blobs',
          key,
          body: buf,
          contentType: 'application/octet-stream',
          ifNoneMatch: '*',
          cacheControl: 'public, max-age=31536000, immutable',
        });
        await incrementBlobRef(sha, buf.byteLength);
      }),
    );

    const manifestDocument = {
      version: 1,
      projectId: manifest.projectId,
      entryFile: manifest.entryFile,
      files: Object.fromEntries(
        [...files.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([path, buf]) => [path, `sha256:${sha256HexFromBytes(new Uint8Array(buf))}`]),
      ),
      kernels,
      runtime: `@taucad/runtime@${runtimePin}`,
      parameters: manifest.parameters ?? {},
      createdAt: new Date().toISOString(),
    };

    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifestDocument));
    await this.storage.putBlob({
      namespace: 'derivatives',
      key: manifestKey,
      body: manifestBytes,
      contentType: 'application/json',
      ifNoneMatch: '*',
      cacheControl: 'public, max-age=3600, immutable',
    });

    await db.transaction(async (tx) => {
      const existing = await tx.select().from(schema.project).where(eq(schema.project.id, manifest.projectId)).limit(1);

      type ProjectRow = typeof schema.project.$inferSelect;
      const existingProject = existing[0] as ProjectRow | undefined;
      if (existingProject !== undefined && existingProject.ownerId !== ownerId) {
        throw new ForbiddenException({
          code: publicationApiCode.PROJECT_FORBIDDEN,
          message: 'Project is owned by another user',
        });
      }

      /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- Drizzle `onConflictDoUpdate.target` column refs */
      await tx
        .insert(schema.project)
        .values({
          id: manifest.projectId,
          ownerId,
          name: manifest.projectName,
          description: manifest.description,
          origin: 'local-mirror',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.project.id,
          set: {
            name: manifest.projectName,
            description: manifest.description,
            updatedAt: new Date(),
          },
        });
      /* oxlint-enable @typescript-eslint/no-unsafe-assignment */

      await tx.insert(schema.publication).values({
        id: publicationId,
        projectId: manifest.projectId,
        ownerId,
        visibility: manifest.visibility,
        manifestKey,
        ogImageKey,
        thumbnailKey,
        runtimePin,
        kernels,
        entryFile: manifest.entryFile,
        title: manifest.title,
        description: manifest.description,
        ownerSnapshot,
        createdAt: new Date(),
      });

      await tx
        .update(schema.project)
        .set({ currentPublicationId: publicationId, updatedAt: new Date() })
        .where(eq(schema.project.id, manifest.projectId));

      for (const recipientEmail of sharedEmails) {
        await tx
          .insert(schema.publicationAccess)
          .values({
            id: generatePrefixedId(idPrefix.publicationAccess),
            publicationId,
            ownerId,
            recipientEmail,
            status: 'active',
            createdAt: new Date(),
            revokedAt: null,
          })
          .onConflictDoUpdate({
            target: [schema.publicationAccess.publicationId, schema.publicationAccess.recipientEmail],
            set: { status: 'active', revokedAt: null },
          });
      }
    });

    const viewUrl = buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId });
    if (manifest.notifyRecipients === true && sharedEmails.length > 0) {
      await this.sendPublicationInviteNotifications({
        recipientEmails: sharedEmails,
        ownerName: ownerSnapshot?.name ?? 'A Tau user',
        publicationTitle: manifest.title,
        url: viewUrl,
      });
    }

    return {
      id: publicationId,
      urls: {
        view: viewUrl,
        share: viewUrl,
        og: this.storage.publicUrl({ namespace: 'defaults', key: 'og.png' }),
        thumbnail: this.storage.publicUrl({ namespace: 'defaults', key: 'thumb.webp' }),
        manifest: this.storage.publicUrl({ namespace: 'derivatives', key: manifestKey }),
      },
    };
  }

  public async getPublicationForViewer(args: {
    publicationId: string;
    viewerUserId?: string;
  }): Promise<PublicationViewResponse> {
    const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true }).replace(/\/$/u, '');

    const db = this.databaseService.database;

    const rows = await db
      .select()
      .from(schema.publication)
      .where(eq(schema.publication.id, args.publicationId))
      .limit(1);

    const publication = rows[0];
    if (!publication) {
      throw new NotFoundException({ code: publicationApiCode.NOT_FOUND, message: 'Publication not found' });
    }

    if (publication.unpublishedAt) {
      throw new GoneException({ code: publicationApiCode.GONE, message: 'Publication is no longer available' });
    }

    let viewerRole: PublicationViewResponse['viewerRole'] = 'public';
    if (args.viewerUserId === publication.ownerId) {
      viewerRole = 'owner';
    }

    if (publication.visibility === 'private') {
      if (args.viewerUserId === undefined) {
        throw new UnauthorizedException({
          code: publicationApiCode.UNAUTHORIZED,
          message: 'Authentication required',
        });
      }

      if (args.viewerUserId !== publication.ownerId) {
        const viewerEmail = await this.loadViewerEmail(args.viewerUserId);
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

    const { manifestKey, ogImageKey, thumbnailKey } = publication;

    const urls = {
      view: buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId: publication.id }),
      share: buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId: publication.id }),
      og: this.storage.publicUrl({
        namespace: 'defaults',
        key: ogImageKey ?? 'og.png',
      }),
      thumbnail: this.storage.publicUrl({
        namespace: 'defaults',
        key: thumbnailKey ?? 'thumb.webp',
      }),
      manifest: this.storage.publicUrl({ namespace: 'derivatives', key: manifestKey }),
    };

    const manifestFetched = await this.storage.getBlob({
      namespace: 'derivatives',
      key: manifestKey,
    });
    const manifestBytes = await this.readStreamToBuffer(manifestFetched.body);
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

    const manifest = manifestResult.data;
    const files: Record<string, string> = {};

    for (const [relativePath, shaRef] of Object.entries(manifest.files)) {
      const match = /^sha256:([0-9a-f]{64})$/iu.exec(shaRef);

      if (!match?.[1]) {
        throw new HttpException(
          `Manifest references invalid digest for ${relativePath}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const blobKey = blobKeyFromSha256Hex(match[1]);
      files[relativePath] = this.storage.publicUrl({ namespace: 'blobs', key: blobKey });
    }

    const ownerSnapshot = await this.resolveOwnerSnapshot(publication);

    const publicationDto: PublicationWireRow = {
      id: publication.id,
      projectId: publication.projectId,
      ownerId: publication.ownerId,
      parentPublicationId: publication.parentPublicationId,
      visibility: publication.visibility as PublicationWireRow['visibility'],
      manifestKey: publication.manifestKey,
      ogImageKey: publication.ogImageKey,
      thumbnailKey: publication.thumbnailKey,
      runtimePin: publication.runtimePin,
      kernels: publication.kernels,
      entryFile: publication.entryFile,
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

    const limit = await this.viewRateLimiter.consumePublicationViewSlot({
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
    readonly recipientEmails: readonly string[];
    readonly ownerName: string;
    readonly publicationTitle: string;
    readonly url: string;
  }): Promise<void> {
    await Promise.all(
      args.recipientEmails.map(async (recipientEmail) => {
        try {
          await this.emailService.sendPublicationInvite({
            recipientEmail,
            ownerName: args.ownerName,
            publicationTitle: args.publicationTitle,
            url: args.url,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Publication invite email failed for ${this.describeRecipient(recipientEmail)}: ${message}`);
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
