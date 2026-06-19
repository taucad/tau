import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { PublicationOwnerSnapshot } from '@taucad/types';
import * as schema from '#database/schema.js';

const rawDatabaseEnv = process.env.DATABASE_URL;
const databaseConnectionString =
  typeof rawDatabaseEnv === 'string' && rawDatabaseEnv.trim().length > 0 ? rawDatabaseEnv.trim() : undefined;

async function isPostgresReachable(connectionString: string): Promise<boolean> {
  const probeClient = postgres(connectionString, {
    max: 1,
    /** Seconds before the client aborts a connect attempt. */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- `postgres` expects snake_case socket options
    connect_timeout: 3,
  });
  try {
    await probeClient`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    try {
      await probeClient.end({ timeout: 1 });
    } catch {
      // Ignore shutdown errors (e.g. connect never established).
    }
  }
}

const publicationSchemaDbReachable = databaseConnectionString
  ? await isPostgresReachable(databaseConnectionString)
  : false;

describe.skipIf(!publicationSchemaDbReachable)('publication schema (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    if (!databaseConnectionString) {
      throw new Error('Unreachable: suite should be skipped when DATABASE_URL is missing.');
    }

    client = postgres(databaseConnectionString, { max: 1 });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
  });

  it('should cascade-delete publications when their owner user is deleted', async () => {
    const ownerId = `user_pub_cascade_${Date.now()}`;
    const projectId = `proj_pub_cascade_${Date.now()}`;
    const publicationId = `pub_owner_cascade_${Date.now()}`;

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Cascade Owner',
      email: `${ownerId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.project).values({
      id: projectId,
      ownerId,
      name: 'Cascade Project',
      origin: 'local-mirror',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.publication).values({
      id: publicationId,
      projectId,
      ownerId,
      visibility: 'private',
      manifestKey: `manifests/${publicationId}.json`,
      runtimePin: '~0.0.0',
      kernels: ['jscad'],
      entryFile: 'main.ts',
      title: 't',
      createdAt: new Date(),
    });

    await db.delete(schema.user).where(eq(schema.user.id, ownerId));

    const rows = await db.select().from(schema.publication).where(eq(schema.publication.id, publicationId));
    expect(rows).toHaveLength(0);
  });

  it('should cascade-delete publications when their parent project is deleted', async () => {
    const ownerId = `user_proj_cascade_${Date.now()}`;
    const projectId = `proj_del_${Date.now()}`;
    const publicationId = `pub_proj_cascade_${Date.now()}`;

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Proj Cascade Owner',
      email: `${ownerId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.project).values({
      id: projectId,
      ownerId,
      name: 'Proj Cascade Project',
      origin: 'local-mirror',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.publication).values({
      id: publicationId,
      projectId,
      ownerId,
      visibility: 'private',
      manifestKey: `manifests/${publicationId}.json`,
      runtimePin: '~0.0.0',
      kernels: ['jscad'],
      entryFile: 'main.ts',
      title: 't',
      createdAt: new Date(),
    });

    await db.delete(schema.project).where(eq(schema.project.id, projectId));

    const rows = await db.select().from(schema.publication).where(eq(schema.publication.id, publicationId));
    expect(rows).toHaveLength(0);

    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
  });

  it('should reject inserting a publication with a null project_id', async () => {
    const ownerId = `user_null_proj_${Date.now()}`;
    await db.insert(schema.user).values({
      id: ownerId,
      name: 'NullProj Owner',
      email: `${ownerId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      db.execute(sql`
        INSERT INTO publication (
          id, project_id, owner_id, visibility, manifest_key, runtime_pin, kernels, entry_file, title
        ) VALUES (
          ${`pub_bad_${Date.now()}`},
          NULL,
          ${ownerId},
          'private',
          'manifests/bad.json',
          '~0.0.0',
          ARRAY['jscad']::text[],
          'main.ts',
          't'
        )
      `),
    ).rejects.toThrow();

    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
  });

  it('should allow project.current_publication_id to point at a publication of the same project (cycle insertable in one db.transaction)', async () => {
    const ownerId = `user_cycle_${Date.now()}`;
    const projectId = `proj_cycle_${Date.now()}`;
    const publicationId = `pub_cycle_${Date.now()}`;

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Cycle Owner',
      email: `${ownerId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.transaction(async (tx) => {
      await tx.insert(schema.project).values({
        id: projectId,
        ownerId,
        name: 'Cycle Project',
        origin: 'local-mirror',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.insert(schema.publication).values({
        id: publicationId,
        projectId,
        ownerId,
        visibility: 'private',
        manifestKey: `manifests/${publicationId}.json`,
        runtimePin: '~0.0.0',
        kernels: ['jscad'],
        entryFile: 'main.ts',
        title: 't',
        createdAt: new Date(),
      });

      await tx
        .update(schema.project)
        .set({ currentPublicationId: publicationId })
        .where(eq(schema.project.id, projectId));
    });

    const [proj] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
    expect(proj?.currentPublicationId).toBe(publicationId);

    await db.delete(schema.project).where(eq(schema.project.id, projectId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
  });

  it('should produce a deterministic kernels TEXT[] round-trip', async () => {
    const ownerId = `user_kernels_${Date.now()}`;
    const projectId = `proj_kernels_${Date.now()}`;
    const publicationId = `pub_kernels_${Date.now()}`;
    const kernels = ['jscad', 'replicad'];

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Kernels Owner',
      email: `${ownerId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.project).values({
      id: projectId,
      ownerId,
      name: 'Kernels Project',
      origin: 'local-mirror',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.publication).values({
      id: publicationId,
      projectId,
      ownerId,
      visibility: 'private',
      manifestKey: `manifests/${publicationId}.json`,
      runtimePin: '~0.0.0',
      kernels,
      entryFile: 'main.ts',
      title: 't',
      createdAt: new Date(),
    });

    const [row] = await db.select().from(schema.publication).where(eq(schema.publication.id, publicationId));
    expect(row?.kernels).toEqual(kernels);

    await db.delete(schema.project).where(eq(schema.project.id, projectId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
  });

  it('should round-trip owner_snapshot JSONB on publication insert', async () => {
    const ownerId = `user_owner_snap_${Date.now()}`;
    const projectId = `proj_owner_snap_${Date.now()}`;
    const publicationId = `pub_owner_snap_${Date.now()}`;
    const snapshot: PublicationOwnerSnapshot = { id: ownerId, name: 'Snapshot Owner' };

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Snapshot Owner',
      email: `${ownerId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.project).values({
      id: projectId,
      ownerId,
      name: 'Snapshot Project',
      origin: 'local-mirror',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.publication).values({
      id: publicationId,
      projectId,
      ownerId,
      visibility: 'private',
      manifestKey: `manifests/${publicationId}.json`,
      runtimePin: '~0.0.0',
      kernels: ['jscad'],
      entryFile: 'main.ts',
      title: 't',
      ownerSnapshot: snapshot,
      createdAt: new Date(),
    });

    const [row] = await db.select().from(schema.publication).where(eq(schema.publication.id, publicationId));
    expect(row?.ownerSnapshot).toEqual(snapshot);

    await db.delete(schema.project).where(eq(schema.project.id, projectId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
  });

  it('should default refcount=0 on blob_ref insert', async () => {
    const sha = createHash('sha256').update(`blob-ref-${Date.now()}-${Math.random()}`).digest('hex');
    await db.insert(schema.blobRef).values({
      sha256: sha,
      sizeBytes: 12n,
    });

    const [row] = await db.select().from(schema.blobRef).where(eq(schema.blobRef.sha256, sha));
    expect(row?.refcount).toBe(0);

    await db.delete(schema.blobRef).where(eq(schema.blobRef.sha256, sha));
  });
});
