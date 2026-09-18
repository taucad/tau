import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '#database/database.service.js';
import { projectInvitation, user } from '#database/schema.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';

/**
 * D27: `authorize` is the single ownership authority, and a caller with no
 * relation to a project gets the answer a caller of a non-existent project
 * gets. The rationale is `git.service.ts`'s: nothing may be used as an oracle
 * for which project ids exist.
 */
describe('ProjectAccessService', () => {
  const ownerId = 'user_owner';
  const collaboratorId = 'user_collab';
  const strangerId = 'user_stranger';
  const projectId = 'proj_accessfixture000';

  /** The joined row `authorize` reads: the project's owner and this caller's role, if any. */
  let projectRow: { ownerId: string; role?: string } | undefined;
  /** The invitation the token hash resolves to, if any. */
  let invitationRow: Record<string, unknown> | undefined;
  /** The account behind the invited address: its id, and its own email facts. */
  let viewerRow: { id: string; email: string; emailVerified: boolean } | undefined;
  let collaboratorWrites: Array<Record<string, unknown>>;
  let invitationUpdates: Array<Record<string, unknown>>;
  let service: ProjectAccessService;

  const databaseStub = (): DatabaseService => {
    const transaction = {
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async (): Promise<void> => {
            collaboratorWrites.push(values);
          },
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async (): Promise<void> => {
            invitationUpdates.push(values);
          },
        }),
      }),
      delete: () => ({ where: async (): Promise<void> => undefined }),
    };
    return {
      database: {
        select: () => ({
          from: (table: unknown) => ({
            /* Only `authorize` joins; the projection is the project row. */
            leftJoin: () => ({
              where: () => ({ limit: async (): Promise<unknown[]> => (projectRow ? [projectRow] : []) }),
            }),
            where: () => ({
              limit: async (): Promise<unknown[]> => {
                if (table === projectInvitation) {
                  return invitationRow ? [invitationRow] : [];
                }
                if (table === user) {
                  return viewerRow ? [viewerRow] : [];
                }
                return [];
              },
            }),
          }),
        }),
        transaction: async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => run(transaction),
      },
    } as unknown as DatabaseService;
  };

  beforeEach(() => {
    vi.useRealTimers();
    projectRow = { ownerId };
    invitationRow = undefined;
    viewerRow = undefined;
    collaboratorWrites = [];
    invitationUpdates = [];
    service = new ProjectAccessService(databaseStub());
  });

  // === authorize ===

  it('should answer owner for the project owner at every need', async () => {
    await expect(service.authorize(projectId, ownerId, 'read')).resolves.toMatchObject({ ownerId, role: 'owner' });
    await expect(service.authorize(projectId, ownerId, 'write')).resolves.toMatchObject({ role: 'owner' });
    await expect(service.authorize(projectId, ownerId, 'owner')).resolves.toMatchObject({ role: 'owner' });
  });

  it('should carry the owner id for a write collaborator so the bytes stay on the owner plan', async () => {
    projectRow = { ownerId, role: 'write' };
    await expect(service.authorize(projectId, collaboratorId, 'write')).resolves.toStrictEqual({
      projectId,
      ownerId,
      role: 'write',
    });
  });

  it('should refuse a read collaborator write access without hiding the project', async () => {
    projectRow = { ownerId, role: 'read' };
    await expect(service.authorize(projectId, collaboratorId, 'read')).resolves.toMatchObject({ role: 'read' });
    await expect(service.authorize(projectId, collaboratorId, 'write')).rejects.toThrow(ForbiddenException);
  });

  it('should refuse a collaborator the owner-only surface', async () => {
    projectRow = { ownerId, role: 'write' };
    await expect(service.authorize(projectId, collaboratorId, 'owner')).rejects.toThrow(ForbiddenException);
  });

  it.each([
    { label: 'a stranger', row: { ownerId } },
    { label: 'a project that does not exist', row: undefined },
  ])('should answer 404 for $label', async ({ row }) => {
    projectRow = row;
    await expect(service.authorize(projectId, strangerId, 'read')).rejects.toThrow(NotFoundException);
  });

  /* Revocation deletes the membership rather than marking it, so the join finds
     no role and the former collaborator is answered exactly as a stranger is —
     which is the point of deleting it instead of keeping a `revoked` row. */
  it('should answer 404 for a collaborator whose membership was revoked', async () => {
    projectRow = { ownerId, role: 'write' };
    await expect(service.authorize(projectId, collaboratorId, 'write')).resolves.toMatchObject({ role: 'write' });

    invitationRow = invitation({ acceptedBy: collaboratorId });
    viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: true };
    await service.revoke({ projectId, email: 'invitee@example.test' });
    projectRow = { ownerId };

    await expect(service.authorize(projectId, collaboratorId, 'read')).rejects.toThrow(NotFoundException);
  });

  // === cache (D22) ===

  it('should answer a repeated question from the short cache and drop it on a membership write', async () => {
    projectRow = { ownerId, role: 'write' };
    await service.authorize(projectId, collaboratorId, 'read');
    projectRow = undefined;
    await expect(service.authorize(projectId, collaboratorId, 'read')).resolves.toMatchObject({ role: 'write' });

    service.invalidate(projectId);
    await expect(service.authorize(projectId, collaboratorId, 'read')).rejects.toThrow(NotFoundException);
  });

  /* F2: registration authorizes immediately after its insert, so a miss cached
     from the existence probe moments earlier would answer 404 for a project the
     caller had just created — and skip its repository. Misses are never cached. */
  it('should not cache a miss, so a project created after one is authorized at once', async () => {
    projectRow = undefined;
    await expect(service.authorize(projectId, ownerId, 'owner')).rejects.toThrow(NotFoundException);

    projectRow = { ownerId };
    await expect(service.authorize(projectId, ownerId, 'owner')).resolves.toMatchObject({ role: 'owner' });
  });

  it('should stop answering from the cache once the entry is older than its TTL', async () => {
    vi.useFakeTimers();
    try {
      projectRow = { ownerId, role: 'write' };
      await service.authorize(projectId, collaboratorId, 'read');
      projectRow = undefined;
      vi.advanceTimersByTime(60_000);
      await expect(service.authorize(projectId, collaboratorId, 'read')).rejects.toThrow(NotFoundException);
    } finally {
      vi.useRealTimers();
    }
  });

  // === accept ===

  const invitation = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    projectId,
    email: 'invitee@example.test',
    role: 'write',
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  });

  it('should bind an accepted invitation to the authenticated account', async () => {
    invitationRow = invitation();
    viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: true };

    await expect(service.accept('raw-token', collaboratorId)).resolves.toMatchObject({ projectId, role: 'write' });
    expect(collaboratorWrites).toStrictEqual([
      expect.objectContaining({ projectId, userId: collaboratorId, role: 'write' }),
    ]);
    expect(invitationUpdates[0]).toMatchObject({ acceptedBy: collaboratorId });
  });

  it('should refuse an unverified email and write no membership', async () => {
    invitationRow = invitation();
    viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: false };

    await expect(service.accept('raw-token', collaboratorId)).rejects.toThrow(ForbiddenException);
    expect(collaboratorWrites).toStrictEqual([]);
  });

  it('should refuse an account whose verified email is not the invited one', async () => {
    invitationRow = invitation();
    viewerRow = { id: collaboratorId, email: 'someone.else@example.test', emailVerified: true };

    await expect(service.accept('raw-token', collaboratorId)).rejects.toThrow(ForbiddenException);
    expect(collaboratorWrites).toStrictEqual([]);
  });

  it.each([
    { label: 'revoked', row: { revokedAt: new Date() } },
    { label: 'expired', row: { expiresAt: new Date(Date.now() - 1000) } },
  ])('should answer 404 for a $label invitation', async ({ row }) => {
    invitationRow = invitation(row);
    viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: true };

    await expect(service.accept('raw-token', collaboratorId)).rejects.toThrow(NotFoundException);
    expect(collaboratorWrites).toStrictEqual([]);
  });

  it('should answer 404 for a token that resolves to nothing', async () => {
    invitationRow = undefined;
    await expect(service.accept('raw-token', collaboratorId)).rejects.toThrow(NotFoundException);
  });
});
