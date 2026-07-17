import { Readable } from 'node:stream';
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
  isPublicationSystemArtifact,
  publicationMaxUserFiles,
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
  StoredPublicationManifest,
} from '#api/publications/publications.dto.js';
import { storedPublicationManifestSchema } from '#api/publications/publications.dto.js';
import type { ResolvedViewerIdentity } from '#api/publications/viewer-identity.types.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { DatabaseService } from '#database/database.service.js';
import { EmailService } from '#email/email.service.js';
import { RedisService } from '#redis/redis.service.js';
import * as schema from '#database/schema.js';
import { concatUint8Arrays } from '#storage/concat-uint8-arrays.js';
import { ObjectStorageService, isS3ObjectMissing } from '#storage/object-storage.service.js';
import type { StorageTier } from '#storage/object-storage.service.js';
import type { StorageNamespace } from '#storage/storage.constants.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';
import { MetricsService } from '#telemetry/metrics.js';
import { buildPublicationViewUrl } from '#email/email-link-builder.js';

const maxBytesPerFile = 25 * 1024 * 1024;
export const maxTotalBytes = 50 * 1024 * 1024;
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

const manifestCacheMaxEntries = 256;

const isWebp = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  bytes.byteLength >= 12 &&
  new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
  new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';

const publicationContentType = (path: string): string =>
  path === 'thumbnail.webp' ? 'image/webp' : 'application/octet-stream';

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

  /** Write-once manifests keyed by publication id — see {@link loadStoredManifest}. */
  private readonly manifestCache = new Map<string, StoredPublicationManifest>();

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly configService: ConfigService<Environment, true>,
    private readonly redisService: RedisService,
    private readonly publicationRateLimiter: PublicationRateLimiterService,
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

    const userFileCount = [...files.keys()].filter(
      (path) => !isPublicationSystemArtifact(normalizeRelativePath(path)),
    ).length;
    if (userFileCount > publicationMaxUserFiles) {
      throw new BadRequestException({
        code: publicationApiCode.TOO_MANY_FILES,
        message: `Maximum ${publicationMaxUserFiles} files exceeded`,
      });
    }

    let totalBytes = 0;
    for (const [path, buf] of files) {
      assertAllowedRelativePath(path);
      if (normalizeRelativePath(path) === 'thumbnail.webp' && !isWebp(buf)) {
        throw new BadRequestException({
          code: publicationApiCode.INVALID_THUMBNAIL_WEBP,
          message: 'thumbnail.webp is not a valid WebP file',
        });
      }
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

    const ownerSnapshot = await this.loadOwnerSnapshot(ownerId);

    const db = this.databaseService.database;

    // Private publications' bytes go to the fail-closed bucket and are only
    // reachable through the authenticated file proxy; public stays on the CDN.
    const blobTier: StorageTier = manifest.visibility === 'private' ? 'private' : 'public';
    const uploads = [...files.entries()].map(([path, buf]) => ({
      path: normalizeRelativePath(path),
      buf,
      sha: sha256HexFromBytes(new Uint8Array(buf)),
      contentType: publicationContentType(normalizeRelativePath(path)),
    }));

    // Point `thumbnailKey` at the uploaded `thumbnail.{webp,png,jpeg}` blob when
    // present, else the default placeholder. Stored namespace-qualified
    // (`blobs/<key>` | `defaults/<key>`) and resolved via `publicUrlForStoredKey`.
    const thumbnailUpload = uploads.find((upload) => upload.path === 'thumbnail.webp');
    const thumbnailKey = thumbnailUpload ? `blobs/${blobKeyFromSha256Hex(thumbnailUpload.sha)}` : 'defaults/thumb.webp';

    await Promise.all(
      uploads.map(async ({ buf, sha, contentType }) => {
        const key = blobKeyFromSha256Hex(sha);
        const stored = await this.storage.putBlob({
          namespace: 'blobs',
          key,
          body: buf,
          contentType,
          ifNoneMatch: '*',
          cacheControl: blobTier === 'private' ? 'private, no-cache' : 'public, max-age=31536000, immutable',
          tier: blobTier,
        });
        if (stored.alreadyExisted && contentType === 'image/webp') {
          const existing = await this.storage.headBlob({ namespace: 'blobs', key, tier: blobTier });
          if (existing?.contentType !== contentType) {
            await this.storage.putBlob({
              namespace: 'blobs',
              key,
              body: buf,
              contentType,
              cacheControl: blobTier === 'private' ? 'private, no-cache' : 'public, max-age=31536000, immutable',
              tier: blobTier,
            });
          }
        }
      }),
    );

    // Per-(path) reference counts, aggregated per sha so the transaction below
    // issues one upsert per distinct blob.
    const refIncrements = new Map<string, { sizeBytes: number; count: number }>();
    for (const { buf, sha } of uploads) {
      const existing = refIncrements.get(sha);
      if (existing) {
        existing.count += 1;
      } else {
        refIncrements.set(sha, { sizeBytes: buf.byteLength, count: 1 });
      }
    }

    const manifestDocument = {
      version: 1,
      projectId: manifest.projectId,
      entryFile: manifest.entryFile,
      files: Object.fromEntries(
        [...uploads].sort((a, b) => a.path.localeCompare(b.path)).map(({ path, sha }) => [path, `sha256:${sha}`]),
      ),
      kernels,
      runtime: `@taucad/runtime@${runtimePin}`,
      parameters: manifest.parameters ?? {},
      createdAt: new Date().toISOString(),
    };

    // Manifests are the publication's keyring (path → sha map) at a key
    // derivable from the share URL, so they NEVER go to the anonymous origin —
    // every manifest lives in the private bucket regardless of visibility.
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifestDocument));
    await this.storage.putBlob({
      namespace: 'derivatives',
      key: manifestKey,
      body: manifestBytes,
      contentType: 'application/json',
      ifNoneMatch: '*',
      cacheControl: 'private, no-cache',
      tier: 'private',
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

      // Inside the transaction so a failed publish never leaks refcounts
      // (uploaded S3 objects are content-addressed and harmless orphans).
      await Promise.all(
        [...refIncrements].map(async ([sha256Hex, { sizeBytes, count }]) =>
          tx
            .insert(schema.blobRef)
            .values({ sha256: sha256Hex, sizeBytes: BigInt(sizeBytes), refcount: count })
            .onConflictDoUpdate({
              target: schema.blobRef.sha256,
              set: { refcount: sql`${schema.blobRef.refcount} + ${count}` },
            }),
        ),
      );

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
    });

    const viewUrl = buildPublicationViewUrl({ frontendURL: frontendUrl, publicationId });
    if (manifest.notifyRecipients === true && sharedEmails.length > 0) {
      await this.sendPublicationInviteNotifications({
        ownerId,
        trigger: 'publish',
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
        og: this.storage.publicUrl(splitNamespaceKey(ogImageKey)),
        thumbnail: this.storage.publicUrl(splitNamespaceKey(thumbnailKey)),
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

    const manifest = await this.loadStoredManifest(publication.id, manifestKey);
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
      ownerId: publication.ownerId,
      parentPublicationId: publication.parentPublicationId,
      visibility: publication.visibility as PublicationWireRow['visibility'],
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
    const manifest = await this.loadStoredManifest(publication.id, publication.manifestKey);
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

  private async loadPublicationOrThrow(publicationId: string): Promise<typeof schema.publication.$inferSelect> {
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
  private async loadStoredManifest(publicationId: string, manifestKey: string): Promise<StoredPublicationManifest> {
    const cached = this.manifestCache.get(publicationId);
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

    this.manifestCache.set(publicationId, manifestResult.data);
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
    const manifest = await this.loadStoredManifest(publication.id, publication.manifestKey);
    const targetTier: StorageTier = targetVisibility === 'private' ? 'private' : 'public';

    await Promise.all(
      Object.entries(manifest.files).map(async ([relativePath, shaRef]) => {
        const key = blobKeyFromSha256Hex(this.sha256HexFromManifestRef(relativePath, shaRef));
        const contentType = publicationContentType(relativePath);
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

    // Ensure the private-tier manifest copy exists before deleting the public
    // object, so a crash between the two never loses the manifest. Raw-byte
    // copy — re-serializing the parsed manifest would drop unknown fields.
    const manifestInPrivate = await this.storage.headBlob({
      namespace: 'derivatives',
      key: publication.manifestKey,
      tier: 'private',
    });
    if (!manifestInPrivate) {
      const legacyManifest = await this.storage.getBlob({ namespace: 'derivatives', key: publication.manifestKey });
      const rawBytes = await this.readStreamToBuffer(legacyManifest.body);
      await this.storage.putBlob({
        namespace: 'derivatives',
        key: publication.manifestKey,
        body: rawBytes,
        contentType: 'application/json',
        ifNoneMatch: '*',
        cacheControl: 'private, no-cache',
        tier: 'private',
      });
    }

    // Idempotent: S3 DeleteObject succeeds for absent keys.
    await this.storage.deleteBlob({ namespace: 'derivatives', key: publication.manifestKey });
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
