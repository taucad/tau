/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';
import { project, projectCollaborator, projectInvitation, user } from '#database/schema.js';

/** What an account may do with a project. The owner is implicit and manages the rest (D27). */
export type ProjectRole = 'owner' | 'write' | 'read';

/** What a caller needs to do. `owner` is the collaborator-management surface. */
export type ProjectNeed = ProjectRole;

/** The answer `authorize` gives, carrying the owner whose plan and storage the bytes land on. */
export type ProjectAccess = {
  readonly projectId: string;
  readonly ownerId: string;
  readonly role: ProjectRole;
};

/** One listed address and the state it is actually in. Never its token. */
export type ProjectCollaboratorEntry = {
  readonly email: string;
  readonly role: 'read' | 'write';
  readonly status: 'pending' | 'accepted' | 'revoked';
  readonly acceptedAt: string | undefined;
  readonly expiresAt: string;
};

/** How long an invitation link stays usable. Milliseconds. */
const invitationLifetime = 14 * 24 * 60 * 60 * 1000;

/**
 * D22: long enough that one git request's repeated questions cost one query,
 * short enough that a revoke takes effect on its own without anybody noticing.
 * Every membership write also invalidates the project explicitly. Milliseconds.
 */
const authorizationCacheTtl = 5000;

/** Past this many entries the cache is dropped whole rather than swept (see below). */
const authorizationCacheCapacity = 5000;

const rank: Record<ProjectRole, number> = { read: 0, write: 1, owner: 2 };

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * The single authority on who may do what with a project (D27).
 *
 * Before this existed, every surface compared `project.owner_id` to the caller
 * itself — `git.service.ts`, the projects routes and publications each held
 * their own copy of the same `===`. Collaboration turns that equality into a
 * relation, and a relation with several readers needs exactly one implementation
 * or the roles diverge between the surfaces that enforce them.
 *
 * Two rules the answer preserves. A caller with **no** relation to a project is
 * told the project does not exist, which is `git.service.ts`'s rule (a client
 * must not learn which project ids exist) extended to every surface. A caller
 * who *is* a member but holds too low a role is refused with `403`: they already
 * know the project exists, so hiding it would only be confusing.
 */
@Injectable()
export class ProjectAccessService {
  /**
   * Resolved access by `<projectId>\u0000<userId>`, with the moment it was read.
   * Hits only — a miss is never cached (see `#resolve`). The separator is a NUL
   * because no id can contain one.
   */
  readonly #cache = new Map<string, { readonly at: number; readonly access: ProjectAccess }>();

  public constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Whether this account may act on this project at this level.
   *
   * @param projectId - The project being acted on.
   * @param userId - The authenticated caller.
   * @param need - The level the caller's action requires.
   * @returns The project's owner and the caller's role.
   * @throws NotFoundException When the project does not exist or the caller is not a member.
   * @throws ForbiddenException When the caller is a member whose role is below `need`.
   */
  public async authorize(projectId: string, userId: string, need: ProjectNeed): Promise<ProjectAccess> {
    const access = await this.#resolve(projectId, userId);
    if (access === undefined) {
      throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    }
    if (rank[access.role] < rank[need]) {
      throw new ForbiddenException({
        code: 'PROJECT_ROLE_INSUFFICIENT',
        message: `This project needs ${need} access.`,
      });
    }
    return access;
  }

  /**
   * Drops every cached answer for one project.
   *
   * Called by each membership write, so a revoke is effective immediately rather
   * than at the end of the TTL.
   *
   * @param projectId - The project whose answers are now stale.
   */
  public invalidate(projectId: string): void {
    for (const key of this.#cache.keys()) {
      if (key.startsWith(`${projectId}\u0000`)) {
        this.#cache.delete(key);
      }
    }
  }

  /**
   * Invites an address to collaborate, or re-issues the invitation it already has.
   *
   * One row per (project, email), so inviting twice is idempotent and inviting a
   * revoked address again un-revokes it in place. The raw token is returned once
   * and never stored; only its hash is.
   *
   * @param args - The project, the owner inviting, the address and the role.
   * @returns The invitation, including the one-time token for its link.
   */
  public async invite(args: {
    projectId: string;
    ownerId: string;
    email: string;
    role: 'read' | 'write';
  }): Promise<{ email: string; role: 'read' | 'write'; token: string; expiresAt: string }> {
    const email = normalizeEmail(args.email);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + invitationLifetime);
    const values = {
      projectId: args.projectId,
      email,
      role: args.role,
      tokenHash: hashToken(token),
      invitedBy: args.ownerId,
      expiresAt,
    };
    const { database } = this.databaseService;
    await database
      .insert(projectInvitation)
      .values(values)
      .onConflictDoUpdate({
        target: [projectInvitation.projectId, projectInvitation.email],
        /* A re-invite is a fresh invitation: a new token, a new expiry, and the
           revocation and any previous acceptance cleared. */
        set: {
          role: args.role,
          tokenHash: values.tokenHash,
          invitedBy: args.ownerId,
          expiresAt,
          acceptedAt: null,
          acceptedBy: null,
          revokedAt: null,
        },
      });

    /* Re-inviting at a different role is how an owner changes one, so it has to
       reach the membership the first invitation already granted — the new
       invitation's own `role` only matters if the address accepts again. The
       update no-ops when the address holds no membership. */
    const accountId = await this.#accountFor(email);
    if (accountId !== undefined) {
      await database
        .update(projectCollaborator)
        .set({ role: args.role })
        .where(and(eq(projectCollaborator.projectId, args.projectId), eq(projectCollaborator.userId, accountId)));
    }

    this.invalidate(args.projectId);
    return { email, role: args.role, token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Binds an invitation to the authenticated account and grants its role.
   *
   * The account's email must be verified and must be the invited address: the
   * invitation is issued to an address, and only a proven holder of that address
   * may spend it. This is the rule `publication_access` already applies to
   * private publications.
   *
   * @param token - The raw token from the invitation link.
   * @param userId - The authenticated account accepting.
   * @returns The project and the role now held.
   * @throws NotFoundException When the token is unknown, revoked or expired.
   * @throws ForbiddenException `INVITATION_EMAIL_UNVERIFIED` when the account holds no verified address, `INVITATION_EMAIL_MISMATCH` when its verified address is not the invited one.
   */
  public async accept(token: string, userId: string): Promise<{ projectId: string; role: 'read' | 'write' }> {
    const { database } = this.databaseService;
    const [invitation] = await database
      .select({
        projectId: projectInvitation.projectId,
        email: projectInvitation.email,
        role: projectInvitation.role,
        expiresAt: projectInvitation.expiresAt,
        revokedAt: projectInvitation.revokedAt,
      })
      .from(projectInvitation)
      .where(eq(projectInvitation.tokenHash, hashToken(token)))
      .limit(1);
    if (invitation === undefined || invitation.revokedAt !== null || invitation.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'This invitation is no longer valid' });
    }

    const [viewer] = await database
      .select({ email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    /* Two refusals, not one, because only the first is the invitee's to fix: an
       unverified account verifies its address and tries again, while a
       mismatched one has to sign in as somebody else. An account that no longer
       exists is answered as unverified — it holds no verified address either,
       and naming a mismatch would be claiming to know an address it does not. */
    if (viewer === undefined || !viewer.emailVerified) {
      throw new ForbiddenException({
        code: 'INVITATION_EMAIL_UNVERIFIED',
        message: 'Verify your email address before accepting this invitation.',
      });
    }
    if (normalizeEmail(viewer.email) !== invitation.email) {
      throw new ForbiddenException({
        code: 'INVITATION_EMAIL_MISMATCH',
        message: 'This invitation was sent to a different email address.',
      });
    }

    const role = invitation.role === 'write' ? 'write' : 'read';
    await database.transaction(async (transaction) => {
      await transaction
        .insert(projectCollaborator)
        .values({ projectId: invitation.projectId, userId, role })
        .onConflictDoUpdate({
          target: [projectCollaborator.projectId, projectCollaborator.userId],
          set: { role },
        });
      await transaction
        .update(projectInvitation)
        .set({ acceptedAt: new Date(), acceptedBy: userId })
        .where(
          and(eq(projectInvitation.projectId, invitation.projectId), eq(projectInvitation.email, invitation.email)),
        );
    });
    this.invalidate(invitation.projectId);
    return { projectId: invitation.projectId, role };
  }

  /**
   * Changes the role an address holds, without touching its invitation token.
   *
   * A re-invite also updates a role, but it mints a new token and a new expiry,
   * which invalidates a link the invitee may still be holding. Changing a role
   * is not re-inviting, so it gets its own write: the invitation keeps its
   * token and only its `role` moves, and the membership — if the address has
   * accepted — moves with it. Either one alone is enough: a pending address
   * accepts at the new role, and an accepted one has it immediately.
   *
   * @param args - The project, the address and the role it should now hold.
   * @returns The address and its new role.
   * @throws NotFoundException When the address was never invited to this project.
   */
  public async setRole(args: {
    projectId: string;
    email: string;
    role: 'read' | 'write';
  }): Promise<{ email: string; role: 'read' | 'write' }> {
    const email = normalizeEmail(args.email);
    const { database } = this.databaseService;
    const [invitation] = await database
      .select({ email: projectInvitation.email })
      .from(projectInvitation)
      .where(and(eq(projectInvitation.projectId, args.projectId), eq(projectInvitation.email, email)))
      .limit(1);
    if (invitation === undefined) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'This address has no invitation' });
    }
    const accountId = await this.#accountFor(email);

    await database.transaction(async (transaction) => {
      await transaction
        .update(projectInvitation)
        .set({ role: args.role })
        .where(and(eq(projectInvitation.projectId, args.projectId), eq(projectInvitation.email, email)));
      if (accountId !== undefined) {
        await transaction
          .update(projectCollaborator)
          .set({ role: args.role })
          .where(and(eq(projectCollaborator.projectId, args.projectId), eq(projectCollaborator.userId, accountId)));
      }
    });
    this.invalidate(args.projectId);
    return { email, role: args.role };
  }

  /**
   * Revokes an address, whether it has accepted yet or not.
   *
   * The invitation is soft-revoked so that re-inviting the address un-revokes
   * the same row, and the membership it granted is deleted outright — a revoked
   * collaborator is a non-member, and a non-member is answered `404`.
   *
   * The membership is found by **address**, not by the invitation's
   * `accepted_by`: a re-invite clears that column, so keying on it left an
   * accepted-then-re-invited collaborator with access nothing could take away.
   * The address is the only key an owner has, and it is the key the invitation
   * is issued against.
   *
   * @param args - The project and the address to revoke.
   * @throws NotFoundException When the address was never invited to this project.
   */
  public async revoke(args: { projectId: string; email: string }): Promise<void> {
    const email = normalizeEmail(args.email);
    const { database } = this.databaseService;
    const [invitation] = await database
      .select({ email: projectInvitation.email })
      .from(projectInvitation)
      .where(and(eq(projectInvitation.projectId, args.projectId), eq(projectInvitation.email, email)))
      .limit(1);
    if (invitation === undefined) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'This address has no invitation' });
    }
    const accountId = await this.#accountFor(email);

    await database.transaction(async (transaction) => {
      await transaction
        .update(projectInvitation)
        .set({ revokedAt: new Date() })
        .where(and(eq(projectInvitation.projectId, args.projectId), eq(projectInvitation.email, email)));
      if (accountId !== undefined) {
        await transaction
          .delete(projectCollaborator)
          .where(and(eq(projectCollaborator.projectId, args.projectId), eq(projectCollaborator.userId, accountId)));
      }
    });
    this.invalidate(args.projectId);
  }

  /**
   * Every address this project has invited, with the state it is in.
   *
   * @param projectId - The project to list.
   * @returns The addresses, newest first, without their tokens.
   */
  public async list(projectId: string): Promise<readonly ProjectCollaboratorEntry[]> {
    const rows = await this.databaseService.database
      .select({
        email: projectInvitation.email,
        role: projectInvitation.role,
        acceptedAt: projectInvitation.acceptedAt,
        revokedAt: projectInvitation.revokedAt,
        expiresAt: projectInvitation.expiresAt,
      })
      .from(projectInvitation)
      .where(eq(projectInvitation.projectId, projectId))
      .orderBy(desc(projectInvitation.createdAt));
    return rows.map((row) => ({
      email: row.email,
      role: row.role === 'write' ? 'write' : 'read',
      status: row.revokedAt === null ? (row.acceptedAt === null ? 'pending' : 'accepted') : 'revoked',
      acceptedAt: row.acceptedAt?.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  /**
   * The account that holds a verified-or-not address, if any account does.
   *
   * An invitation is issued to an address, and the membership it grants belongs
   * to whichever account holds that address — so every write that has to reach
   * the membership from the address goes through here. `user.email` is unique
   * but not guaranteed lowercase, and the invitation's is lowercase by check
   * constraint, so the comparison is folded on the column.
   *
   * @param email - The already-normalized address.
   * @returns The account id, or `undefined` when no account holds the address.
   */
  async #accountFor(email: string): Promise<string | undefined> {
    const [row] = await this.databaseService.database
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${email}`)
      .limit(1);
    return row?.id;
  }

  /**
   * The caller's role on a project, from the cache when it is fresh enough.
   *
   * The cache holds the resolved role rather than one entry per (project, user,
   * need): the answer to every `need` is a comparison against that role, so one
   * entry answers all three and a revoke has one entry to drop, not three.
   *
   * **A miss is never cached.** Registration probes for a project id, inserts,
   * and authorizes immediately afterwards; caching "no such project" would
   * answer `404` for the row that call had just written and leave it without a
   * repository. A miss is also the cheap branch — one query that reads nothing —
   * so there is little to save and a correctness trap to avoid.
   *
   * The cache is **per process**. Each API replica keeps its own, so a
   * membership change can be up to the TTL stale on a replica that did not serve
   * the write. That is the bound D22 accepts; nothing here is a lock.
   *
   * @param projectId - The project being asked about.
   * @param userId - The caller.
   * @returns The access, or `undefined` when the caller has no relation to it.
   */
  async #resolve(projectId: string, userId: string): Promise<ProjectAccess | undefined> {
    const key = `${projectId}\u0000${userId}`;
    const cached = this.#cache.get(key);
    if (cached !== undefined && Date.now() - cached.at < authorizationCacheTtl) {
      return cached.access;
    }

    const [row] = await this.databaseService.database
      .select({ ownerId: project.ownerId, role: projectCollaborator.role })
      .from(project)
      .leftJoin(
        projectCollaborator,
        and(eq(projectCollaborator.projectId, project.id), eq(projectCollaborator.userId, userId)),
      )
      .where(eq(project.id, projectId))
      .limit(1);

    const access: ProjectAccess | undefined =
      row === undefined
        ? undefined
        : row.ownerId === userId
          ? { projectId, ownerId: row.ownerId, role: 'owner' }
          : row.role === 'write' || row.role === 'read'
            ? { projectId, ownerId: row.ownerId, role: row.role }
            : undefined;

    /* Cleared whole rather than evicted one by one: entries live five seconds,
       so the map is already bounded by request rate and this only stops a burst
       growing it without limit. ponytail: a real eviction policy is warranted
       when measurement shows the clear costing anything. */
    if (access !== undefined) {
      if (this.#cache.size >= authorizationCacheCapacity) {
        this.#cache.clear();
      }
      this.#cache.set(key, { at: Date.now(), access });
    }
    return access;
  }
}
