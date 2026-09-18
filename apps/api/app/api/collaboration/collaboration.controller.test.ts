import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '#database/database.service.js';
import { projectCollaborator, projectInvitation, user } from '#database/schema.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import { CollaboratorsController, InvitationsController } from '#api/collaboration/collaboration.controller.js';

/**
 * D27: the owner alone manages collaborators, an invitation is one row per
 * (project, email) so inviting twice is idempotent, re-inviting a revoked
 * address un-revokes it in place, and the invite rate limit fails closed —
 * an unavailable limiter refuses the invite rather than letting it through.
 */
describe('CollaboratorsController', () => {
  const ownerId = 'user_owner';
  const strangerId = 'user_stranger';
  const inviteeId = 'user_invitee';
  const projectId = 'proj_collabfixture000';

  /** The invitation table, keyed as the schema keys it: (project, email). */
  let invitations: Array<Record<string, unknown>>;
  let collaborators: Array<Record<string, unknown>>;
  let projectRow: { ownerId: string; role?: string } | undefined;
  let viewerRow: { id: string; email: string; emailVerified: boolean } | undefined;
  /** What the daily invite budget answers, or throws when Redis is gone. */
  let budget: () => Promise<{ allowed: boolean; count: number }>;
  let collaboratorsController: CollaboratorsController;
  let invitationsController: InvitationsController;

  const rowsFor = (table: unknown): Array<Record<string, unknown>> =>
    table === projectInvitation ? invitations : table === projectCollaborator ? collaborators : [];

  /**
   * A table stub small enough to hold the two facts these rows assert: an
   * upsert keyed on (project, email) and a soft revoke.
   *
   * @param values - The row a caller is writing.
   * @param set - The columns a conflicting row takes instead.
   */
  const upsert = (values: Record<string, unknown>, set: Record<string, unknown>): void => {
    const existing = invitations.find(
      (row) => row['projectId'] === values['projectId'] && row['email'] === values['email'],
    );
    if (existing) {
      Object.assign(existing, set);
      return;
    }
    /* The columns the schema defaults to NULL, which the service's own reads
       distinguish from "absent" (a pending invitation is not a revoked one). */
    invitations.push({ acceptedAt: null, acceptedBy: null, revokedAt: null, ...values });
  };

  const databaseStub = (): DatabaseService => {
    const writer = {
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async (args: { set: Record<string, unknown> }): Promise<void> => {
            if (table === projectInvitation) {
              upsert(values, args.set);
              return;
            }
            const existing = collaborators.find(
              (row) => row['projectId'] === values['projectId'] && row['userId'] === values['userId'],
            );
            if (existing) {
              Object.assign(existing, args.set);
              return;
            }
            collaborators.push({ ...values });
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async (): Promise<void> => {
            for (const row of rowsFor(table)) {
              Object.assign(row, values);
            }
          },
        }),
      }),
      delete: (table: unknown) => ({
        /* The fixture holds one project, so "delete where project and user"
           and "clear the table" are the same statement here. */
        where: async (): Promise<void> => {
          if (table === projectCollaborator) {
            collaborators = [];
          }
        },
      }),
    };
    return {
      database: {
        ...writer,
        select: () => ({
          from: (table: unknown) => ({
            leftJoin: () => ({
              where: () => ({ limit: async (): Promise<unknown[]> => (projectRow ? [projectRow] : []) }),
            }),
            where: () => ({
              limit: async (): Promise<unknown[]> => (table === user ? (viewerRow ? [viewerRow] : []) : rowsFor(table)),
              orderBy: async (): Promise<unknown[]> => rowsFor(table),
            }),
          }),
        }),
        transaction: async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => run(writer),
      },
    } as unknown as DatabaseService;
  };

  beforeEach(() => {
    invitations = [];
    collaborators = [];
    projectRow = { ownerId };
    viewerRow = { id: inviteeId, email: 'invitee@example.test', emailVerified: true };
    budget = async () => ({ allowed: true, count: 1 });
    const access = new ProjectAccessService(databaseStub());
    const rateLimiter = {
      consumeDailyBudget: vi.fn(async () => budget()),
    } as unknown as PublicationRateLimiterService;
    collaboratorsController = new CollaboratorsController(access, rateLimiter);
    invitationsController = new InvitationsController(access);
  });

  // === invite ===

  it('should keep one invitation row when the same address is invited twice', async () => {
    const first = await collaboratorsController.invite(
      projectId,
      { email: 'Invitee@Example.test', role: 'write' },
      ownerId,
    );
    const second = await collaboratorsController.invite(
      projectId,
      { email: 'invitee@example.test', role: 'write' },
      ownerId,
    );

    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ projectId, email: 'invitee@example.test', role: 'write' });
    expect(first.token).not.toBe(second.token);
  });

  it('should un-revoke a revoked address when the owner invites it again', async () => {
    await collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'write' }, ownerId);
    await collaboratorsController.revoke(projectId, 'invitee@example.test', ownerId);
    expect(invitations[0]?.['revokedAt']).toBeInstanceOf(Date);

    await collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'read' }, ownerId);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ revokedAt: null, role: 'read' });
  });

  it('should refuse the invite when the rate limiter is unavailable, writing nothing', async () => {
    budget = async () => {
      throw new Error('redis unreachable');
    };

    await expect(
      collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'write' }, ownerId),
    ).rejects.toThrow(HttpException);
    expect(invitations).toStrictEqual([]);
  });

  it('should refuse the invite when the owner is over the daily budget', async () => {
    budget = async () => ({ allowed: false, count: 10_000 });

    await expect(
      collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'write' }, ownerId),
    ).rejects.toThrow(HttpException);
    expect(invitations).toStrictEqual([]);
  });

  /* The owner alone manages collaborators (D27). A write collaborator already
     knows the project exists, so hiding it would only mislead — they are
     refused; somebody with no relation to it is told nothing at all. */
  it('should refuse a write collaborator the owner-only invite surface', async () => {
    projectRow = { ownerId, role: 'write' };
    await expect(
      collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'write' }, strangerId),
    ).rejects.toThrow(ForbiddenException);
    expect(invitations).toStrictEqual([]);
  });

  it('should answer a caller with no relation with the same 404 a missing project gets', async () => {
    projectRow = { ownerId };
    await expect(
      collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'write' }, strangerId),
    ).rejects.toThrow(NotFoundException);
    expect(invitations).toStrictEqual([]);
  });

  // === accept ===

  it('should bind the invitation to the accepting account and grant the invited role', async () => {
    const invited = await collaboratorsController.invite(
      projectId,
      { email: 'invitee@example.test', role: 'write' },
      ownerId,
    );

    await expect(invitationsController.accept(invited.token, inviteeId)).resolves.toMatchObject({
      projectId,
      role: 'write',
    });
    expect(collaborators).toStrictEqual([expect.objectContaining({ projectId, userId: inviteeId, role: 'write' })]);
    expect(invitations[0]).toMatchObject({ acceptedBy: inviteeId });
  });

  it('should refuse a token that was never issued', async () => {
    await expect(invitationsController.accept('not-a-token', inviteeId)).rejects.toThrow(NotFoundException);
  });

  // === revoke and list ===

  it('should drop the collaborator row when the owner revokes an accepted invitation', async () => {
    const invited = await collaboratorsController.invite(
      projectId,
      { email: 'invitee@example.test', role: 'write' },
      ownerId,
    );
    await invitationsController.accept(invited.token, inviteeId);

    await collaboratorsController.revoke(projectId, 'invitee@example.test', ownerId);
    expect(collaborators).toStrictEqual([]);
    expect(invitations[0]?.['revokedAt']).toBeInstanceOf(Date);
  });

  /* F1: the re-invite clears `accepted_by`, so a revoke that found the
     membership through that column found nothing and left a collaborator with
     write access to somebody else's storage forever. Revocation keys on the
     address, which is the only key an owner has. */
  it('should still drop the membership when the address was re-invited after accepting', async () => {
    const invited = await collaboratorsController.invite(
      projectId,
      { email: 'invitee@example.test', role: 'write' },
      ownerId,
    );
    await invitationsController.accept(invited.token, inviteeId);
    await collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'write' }, ownerId);

    await collaboratorsController.revoke(projectId, 'invitee@example.test', ownerId);
    expect(collaborators).toStrictEqual([]);
  });

  /* Ruling: a re-invite at a different role is how an owner changes one, so it
     reaches the membership the first invitation already granted. */
  it('should downgrade an accepted collaborator when the owner re-invites the address at read', async () => {
    const invited = await collaboratorsController.invite(
      projectId,
      { email: 'invitee@example.test', role: 'write' },
      ownerId,
    );
    await invitationsController.accept(invited.token, inviteeId);
    expect(collaborators[0]).toMatchObject({ role: 'write' });

    await collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'read' }, ownerId);
    expect(collaborators).toStrictEqual([expect.objectContaining({ userId: inviteeId, role: 'read' })]);
  });

  it('should list an address with the state it is actually in, and never its token', async () => {
    await collaboratorsController.invite(projectId, { email: 'invitee@example.test', role: 'read' }, ownerId);

    const listed = await collaboratorsController.list(projectId, ownerId);
    expect(listed).toStrictEqual([
      expect.objectContaining({ email: 'invitee@example.test', role: 'read', status: 'pending' }),
    ]);
    expect(JSON.stringify(listed)).not.toContain('token');
  });
});
