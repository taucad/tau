import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mock } from 'vitest-mock-extended';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '#database/database.service.js';
import type { OwnerLockTransaction } from '#database/owner-lock.js';
import { projectCollaborator, projectDeletion, projectInvitation, user } from '#database/schema.js';
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
  let deletionRow: { projectId: string; ownerId: string } | undefined;
  let beforeProjectLock: () => Promise<void>;
  let projectLockHeld: boolean;
  let invitationWrites: Array<Record<string, unknown>>;
  let collaboratorUpdates: Array<Record<string, unknown>>;
  let collaboratorDeletes: number;
  const dialect = new PgDialect();

  const databaseStub = (): DatabaseService => {
    const select = vi.fn().mockImplementation(() => ({
      from: (table: unknown) => ({
        leftJoin: () => ({
          where: () => ({ limit: async (): Promise<unknown[]> => (projectRow ? [{ ...projectRow }] : []) }),
        }),
        where: (condition: SQL) => ({
          limit: async (): Promise<unknown[]> => {
            if (table === projectDeletion) {
              return deletionRow ? [{ ...deletionRow }] : [];
            }
            if (table === projectInvitation) {
              const query = dialect.sqlToQuery(condition);
              const matchesToken =
                !query.sql.includes('"token_hash"') || query.params.includes(invitationRow?.['tokenHash']);
              return invitationRow && matchesToken ? [{ ...invitationRow }] : [];
            }
            if (table === user) {
              return viewerRow ? [{ ...viewerRow }] : [];
            }
            return [];
          },
        }),
      }),
    }));
    const transaction = mock<OwnerLockTransaction>({
      select,
      execute: vi.fn().mockImplementation(async () => {
        await beforeProjectLock();
        projectLockHeld = true;
        return [];
      }),
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async (): Promise<void> => {
            expect(projectLockHeld).toBe(true);
            (table === projectInvitation ? invitationWrites : collaboratorWrites).push(values);
          },
        }),
      })),
      update: vi.fn().mockImplementation((table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async (): Promise<void> => {
            expect(projectLockHeld).toBe(true);
            (table === projectCollaborator ? collaboratorUpdates : invitationUpdates).push(values);
          },
        }),
      })),
      delete: vi.fn().mockImplementation(() => ({
        where: async (): Promise<void> => {
          expect(projectLockHeld).toBe(true);
          collaboratorDeletes += 1;
        },
      })),
    });
    const database = mock<DatabaseService['database']>({
      select,
      transaction: vi.fn().mockImplementation(async (run: (tx: OwnerLockTransaction) => Promise<unknown>) => {
        try {
          return await run(transaction);
        } finally {
          projectLockHeld = false;
        }
      }),
    });
    return Object.assign(mock<DatabaseService>(), { database });
  };

  beforeEach(() => {
    vi.useRealTimers();
    projectRow = { ownerId };
    invitationRow = undefined;
    viewerRow = undefined;
    collaboratorWrites = [];
    invitationUpdates = [];
    invitationWrites = [];
    collaboratorUpdates = [];
    collaboratorDeletes = 0;
    deletionRow = undefined;
    projectLockHeld = false;
    beforeProjectLock = async () => undefined;
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
    tokenHash: createHash('sha256').update('raw-token').digest('hex'),
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

  /* The two refusals are told apart because only one of them is the invitee's
     to fix: an unverified account verifies its address and tries again, while a
     mismatched one has to sign in as somebody else. A single code left the
     client unable to say which. */
  it('should name an unverified address as unverified, and write no membership', async () => {
    invitationRow = invitation();
    viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: false };

    await expect(service.accept('raw-token', collaboratorId)).rejects.toMatchObject({
      response: { code: 'INVITATION_EMAIL_UNVERIFIED' },
    });
    await expect(service.accept('raw-token', collaboratorId)).rejects.toThrow(ForbiddenException);
    expect(collaboratorWrites).toStrictEqual([]);
  });

  it('should name a verified address that is not the invited one as a mismatch', async () => {
    invitationRow = invitation();
    viewerRow = { id: collaboratorId, email: 'someone.else@example.test', emailVerified: true };

    await expect(service.accept('raw-token', collaboratorId)).rejects.toMatchObject({
      response: { code: 'INVITATION_EMAIL_MISMATCH' },
    });
    await expect(service.accept('raw-token', collaboratorId)).rejects.toThrow(ForbiddenException);
    expect(collaboratorWrites).toStrictEqual([]);
  });

  it('should refuse an account that no longer exists as unverified rather than mismatched', async () => {
    invitationRow = invitation();
    viewerRow = undefined;

    await expect(service.accept('raw-token', collaboratorId)).rejects.toMatchObject({
      response: { code: 'INVITATION_EMAIL_UNVERIFIED' },
    });
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

  it.each([
    { label: 'owner', userId: ownerId, error: GoneException, message: 'deleted from Tau Cloud' },
    { label: 'collaborator', userId: collaboratorId, error: NotFoundException, message: 'Project not found' },
  ])(
    'should fence a cached $label on another replica as soon as deletion intent exists',
    async ({ userId, error, message }) => {
      projectRow = { ownerId, role: 'write' };
      await service.authorize(projectId, userId, 'read');
      // Another replica admits deletion without invalidating this service's cache.
      deletionRow = { projectId, ownerId };
      const refusal = service.authorize(projectId, userId, 'read');
      await expect(refusal).rejects.toThrow(error);
      await expect(refusal).rejects.toThrow(message);
    },
  );

  it('should hide a deleted project from a stranger even if its project row remains', async () => {
    deletionRow = { projectId, ownerId };
    const refusal = service.authorize(projectId, strangerId, 'read');
    await expect(refusal).rejects.toThrow(NotFoundException);
    await expect(refusal).rejects.toThrow('Project not found');
  });

  it('should refuse acceptance when deletion wins while the project lock is pending', async () => {
    invitationRow = invitation();
    viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: true };
    const reachedLock = Promise.withResolvers<void>();
    const releaseLock = Promise.withResolvers<void>();
    beforeProjectLock = async () => {
      reachedLock.resolve();
      await releaseLock.promise;
    };
    const acceptance = service.accept('raw-token', collaboratorId);
    const refusal = expect(acceptance).rejects.toThrow(NotFoundException);
    try {
      await reachedLock.promise;
      deletionRow = { projectId, ownerId };
    } finally {
      releaseLock.resolve();
    }
    await refusal;
    await expect(acceptance).rejects.toThrow('Project not found');
    expect(collaboratorWrites).toStrictEqual([]);
    expect(invitationUpdates).toStrictEqual([]);
  });

  it.each([
    {
      label: 'revoked',
      change: (): void => {
        invitationRow = invitation({ revokedAt: new Date() });
      },
    },
    {
      label: 'expired',
      change: (): void => {
        invitationRow = invitation({ expiresAt: new Date(0) });
      },
    },
    {
      label: 'reissued',
      change: (): void => {
        invitationRow = invitation({ tokenHash: createHash('sha256').update('replacement-token').digest('hex') });
      },
    },
    {
      label: 'removed',
      change: (): void => {
        invitationRow = undefined;
      },
    },
  ])('should refuse an invitation $label after token lookup but before lock acquisition', async ({ change }) => {
    invitationRow = invitation();
    viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: true };
    beforeProjectLock = async () => {
      change();
    };
    const acceptance = service.accept('raw-token', collaboratorId);
    await expect(acceptance).rejects.toThrow(NotFoundException);
    await expect(acceptance).rejects.toThrow('This invitation is no longer valid');
    expect(collaboratorWrites).toStrictEqual([]);
    expect(invitationUpdates).toStrictEqual([]);
  });

  it('should accept the current reduced role after a concurrent owner role change', async () => {
    invitationRow = invitation();
    viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: true };
    beforeProjectLock = async () => {
      invitationRow = invitation({ role: 'read' });
    };
    await expect(service.accept('raw-token', collaboratorId)).resolves.toStrictEqual({ projectId, role: 'read' });
    expect(collaboratorWrites).toStrictEqual([{ projectId, userId: collaboratorId, role: 'read' }]);
    expect(invitationUpdates[0]).toMatchObject({ acceptedBy: collaboratorId });
  });

  it.each(['invite', 'setRole', 'revoke'] as const)(
    'should refuse %s when deletion commits after owner authorization and before its lock',
    async (operation) => {
      invitationRow = invitation();
      viewerRow = { id: collaboratorId, email: 'invitee@example.test', emailVerified: true };
      await service.authorize(projectId, ownerId, 'owner');
      beforeProjectLock = async () => {
        deletionRow = { projectId, ownerId };
      };
      const args = { projectId, ownerId, email: 'invitee@example.test', role: 'read' } as const;
      const mutation = service[operation](args);
      await expect(mutation).rejects.toThrow(GoneException);
      await expect(mutation).rejects.toThrow('deleted from Tau Cloud');
      expect(invitationWrites).toStrictEqual([]);
      expect(invitationUpdates).toStrictEqual([]);
      expect(collaboratorWrites).toStrictEqual([]);
      expect(collaboratorUpdates).toStrictEqual([]);
      expect(collaboratorDeletes).toBe(0);
    },
  );
});
