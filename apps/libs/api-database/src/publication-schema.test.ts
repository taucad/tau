import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { PublicationOwnerSnapshot } from '@taucad/types';
import * as schema from '#schema/index.js';
import { databaseReachable } from '#testing/database-reachable.js';

const rawDatabaseEnv = process.env.DATABASE_URL;
const databaseConnectionString =
  typeof rawDatabaseEnv === 'string' && rawDatabaseEnv.trim().length > 0 ? rawDatabaseEnv.trim() : undefined;

const publicationSchemaDbReachable = databaseConnectionString
  ? await databaseReachable(databaseConnectionString)
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
      tag: `v-${publicationId}`,
      revisionId: 'a'.repeat(40),
      ownerId,
      visibility: 'private',
      manifestKey: `manifests/${publicationId}.json`,
      runtimePin: '~0.0.0',
      kernels: ['jscad'],
      entryPath: 'main.ts',
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
      tag: `v-${publicationId}`,
      revisionId: 'a'.repeat(40),
      ownerId,
      visibility: 'private',
      manifestKey: `manifests/${publicationId}.json`,
      runtimePin: '~0.0.0',
      kernels: ['jscad'],
      entryPath: 'main.ts',
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
        tag: `v-${publicationId}`,
        revisionId: 'a'.repeat(40),
        ownerId,
        visibility: 'private',
        manifestKey: `manifests/${publicationId}.json`,
        runtimePin: '~0.0.0',
        kernels: ['jscad'],
        entryPath: 'main.ts',
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
      tag: `v-${publicationId}`,
      revisionId: 'a'.repeat(40),
      ownerId,
      visibility: 'private',
      manifestKey: `manifests/${publicationId}.json`,
      runtimePin: '~0.0.0',
      kernels,
      entryPath: 'main.ts',
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
      tag: `v-${publicationId}`,
      revisionId: 'a'.repeat(40),
      ownerId,
      visibility: 'private',
      manifestKey: `manifests/${publicationId}.json`,
      runtimePin: '~0.0.0',
      kernels: ['jscad'],
      entryPath: 'main.ts',
      title: 't',
      ownerSnapshot: snapshot,
      createdAt: new Date(),
    });

    const [row] = await db.select().from(schema.publication).where(eq(schema.publication.id, publicationId));
    expect(row?.ownerSnapshot).toEqual(snapshot);

    await db.delete(schema.project).where(eq(schema.project.id, projectId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
  });

  /** An owner with one project, for the cloud link rows below. */
  const seedOwnedProject = async (label: string): Promise<{ ownerId: string; projectId: string }> => {
    const ownerId = `user_${label}_${Date.now()}`;
    const projectId = `proj_${label}_${Date.now()}`;
    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Link Owner',
      email: `${ownerId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(schema.project).values({
      id: projectId,
      ownerId,
      name: 'Link Project',
      origin: 'local-mirror',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ownerId, projectId };
  };

  /**
   * The PostgreSQL error under a refused statement, whichever wrapper the driver put it in, so an unrelated failure
   * (a dropped connection) never passes for the constraint a test names.
   */
  const refusalOf = async (statement: PromiseLike<unknown>): Promise<Readonly<Record<string, unknown>>> => {
    try {
      await statement;
    } catch (error) {
      const cause: unknown = error instanceof Error && error.cause !== undefined ? error.cause : error;
      return typeof cause === 'object' && cause !== null ? { ...cause } : {};
    }
    throw new Error('The statement was not refused.');
  };

  it('should allow one cloud link per project', async () => {
    const owners: string[] = [];
    try {
      const { ownerId, projectId } = await seedOwnedProject('one_link');
      owners.push(ownerId);
      await db
        .insert(schema.projectShare)
        .values({ id: `shr_a_${Date.now()}`, projectId, ownerId, visibility: 'private' });

      expect(
        await refusalOf(
          db
            .insert(schema.projectShare)
            .values({ id: `shr_b_${Date.now()}`, projectId, ownerId, visibility: 'public' }),
        ),
      ).toMatchObject(
        /* PostgreSQL names the field in snake_case. */
        Object.fromEntries([
          ['code', '23505'],
          ['constraint_name', 'project_share_project_idx'],
        ]),
      );
      /* Each refusal on its own: a project with no link and an unknown setting
         exercises the visibility check, not the foreign key. */
      const other = await seedOwnedProject('one_link_other');
      owners.push(other.ownerId);
      expect(
        await refusalOf(
          db.insert(schema.projectShare).values({
            id: `shr_c_${Date.now()}`,
            projectId: other.projectId,
            ownerId: other.ownerId,
            visibility: 'secret',
          }),
        ),
      ).toMatchObject(
        /* PostgreSQL names the field in snake_case. */
        Object.fromEntries([
          ['code', '23514'],
          ['constraint_name', 'project_share_visibility_check'],
        ]),
      );
      expect(
        await refusalOf(
          db.insert(schema.projectShare).values({
            id: `shr_d_${Date.now()}`,
            projectId: `${projectId}_missing`,
            ownerId,
            visibility: 'private',
          }),
        ),
      ).toMatchObject(
        /* PostgreSQL names the field in snake_case. */
        Object.fromEntries([
          ['code', '23503'],
          ['constraint_name', 'project_share_project_id_project_id_fk'],
        ]),
      );
    } finally {
      /* The owners take their projects and links with them, whichever assertion failed. */
      for (const ownerId of owners) {
        // oxlint-disable-next-line no-await-in-loop -- two rows; order does not matter and parallel deletes gain nothing.
        await db.delete(schema.user).where(eq(schema.user.id, ownerId));
      }
    }
  });

  it('should cascade a cloud link and its invited people from the project and from the owner', async () => {
    const first = await seedOwnedProject('link_cascade_project');
    const shareId = `shr_cascade_${Date.now()}`;
    await db
      .insert(schema.projectShare)
      .values({ id: shareId, projectId: first.projectId, ownerId: first.ownerId, visibility: 'private' });
    await db.insert(schema.projectShareAccess).values({
      id: `sga_cascade_${Date.now()}`,
      shareId,
      ownerId: first.ownerId,
      recipientEmail: 'friend@example.com',
    });

    await db.delete(schema.project).where(eq(schema.project.id, first.projectId));

    expect(await db.select().from(schema.projectShare).where(eq(schema.projectShare.id, shareId))).toEqual([]);
    expect(
      await db.select().from(schema.projectShareAccess).where(eq(schema.projectShareAccess.shareId, shareId)),
    ).toEqual([]);

    const second = await seedOwnedProject('link_cascade_owner');
    const ownerShareId = `shr_owner_${Date.now()}`;
    await db
      .insert(schema.projectShare)
      .values({ id: ownerShareId, projectId: second.projectId, ownerId: second.ownerId, visibility: 'public' });

    await db.delete(schema.user).where(eq(schema.user.id, second.ownerId));

    expect(await db.select().from(schema.projectShare).where(eq(schema.projectShare.id, ownerShareId))).toEqual([]);
    await db.delete(schema.user).where(eq(schema.user.id, first.ownerId));
  });

  it('should keep invited addresses lowercase, one per link, and active or revoked', async () => {
    const { ownerId, projectId } = await seedOwnedProject('link_access');
    const shareId = `shr_access_${Date.now()}`;
    await db.insert(schema.projectShare).values({ id: shareId, projectId, ownerId, visibility: 'private' });
    const grant = { shareId, ownerId, recipientEmail: 'friend@example.com' };
    await db.insert(schema.projectShareAccess).values({ id: `sga_1_${Date.now()}`, ...grant });

    await expect(
      db.insert(schema.projectShareAccess).values({ id: `sga_2_${Date.now()}`, ...grant }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(schema.projectShareAccess)
        .values({ id: `sga_3_${Date.now()}`, ...grant, recipientEmail: 'Friend@Example.com' }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(schema.projectShareAccess)
        .values({ id: `sga_4_${Date.now()}`, ...grant, recipientEmail: 'other@example.com', status: 'paused' }),
    ).rejects.toThrow();

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
