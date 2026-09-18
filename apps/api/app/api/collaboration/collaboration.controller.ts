/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { ProjectCollaboratorEntry } from '#api/collaboration/project-access.service.js';
import { InviteCollaboratorDto } from '#api/collaboration/collaboration.dto.js';

/** Daily invite cap per owner, matching the publication invite budget it shares a limiter with. */
const collaboratorInvitesPerOwnerPerDay = 200;

/**
 * Who else may work on a project (D27).
 *
 * The owner alone manages this surface, so every route here needs `owner`, and
 * a caller without it gets `ProjectAccessService`'s answer: `404` for anybody
 * with no relation to the project, `403` for a collaborator reaching above
 * their role.
 */
@Controller({ path: 'projects/:projectId/collaborators', version: '1' })
@UseAuth()
export class CollaboratorsController {
  public constructor(
    private readonly access: ProjectAccessService,
    private readonly rateLimiter: PublicationRateLimiterService,
  ) {}

  /**
   * Every address this project has invited, and the state it is in.
   *
   * @param projectId - The project being listed.
   * @param userId - The signed-in caller, who must own it.
   * @returns The invited addresses, never their tokens.
   */
  @Get()
  public async list(
    @Param('projectId') projectId: string,
    @User('id') userId: string,
  ): Promise<readonly ProjectCollaboratorEntry[]> {
    await this.access.authorize(projectId, userId, 'owner');
    return this.access.list(projectId);
  }

  /**
   * Invites an address, or re-issues the invitation it already has.
   *
   * Idempotent by (project, email): a second invite to the same address updates
   * one row rather than adding another, and an address that was revoked is
   * un-revoked in place.
   *
   * The daily budget is consumed **before** the write and **fails closed**: an
   * unreachable limiter refuses the invite. An invitation is a durable grant of
   * access to somebody else's storage, so the failure that matters is the one
   * where an outage turns the cap off, not the one where an owner has to retry.
   *
   * @param projectId - The project being shared.
   * @param body - The address and the role it is invited at.
   * @param userId - The signed-in caller, who must own the project.
   * @returns The invitation and its one-time token, which the owner sends on.
   * @throws HttpException When the owner is over, or the limiter is unavailable.
   */
  @Post()
  public async invite(
    @Param('projectId') projectId: string,
    @Body() body: InviteCollaboratorDto,
    @User('id') userId: string,
  ): Promise<{ email: string; role: 'read' | 'write'; token: string; expiresAt: string }> {
    const access = await this.access.authorize(projectId, userId, 'owner');

    const budget = await this.rateLimiter
      .consumeDailyBudget({ key: `project:invite:${userId}`, limit: collaboratorInvitesPerOwnerPerDay })
      .catch(() => ({ allowed: false, count: 0 }));
    if (!budget.allowed) {
      throw new HttpException(
        { code: 'PROJECT_INVITE_RATE_LIMITED', message: 'Too many collaborator invitations today' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.access.invite({ projectId, ownerId: access.ownerId, email: body.email, role: body.role });
  }

  /**
   * Revokes an address, and the membership it granted if it was accepted.
   *
   * The address is the key because it is the only one an owner has: the account
   * behind an invitation may not have existed when it was sent.
   *
   * @param projectId - The project being revoked from.
   * @param email - The invited address.
   * @param userId - The signed-in caller, who must own the project.
   */
  @Delete(':email')
  public async revoke(
    @Param('projectId') projectId: string,
    @Param('email') email: string,
    @User('id') userId: string,
  ): Promise<void> {
    await this.access.authorize(projectId, userId, 'owner');
    await this.access.revoke({ projectId, email });
  }
}

/**
 * The invitee's half of the invitation: one route, on the token alone.
 *
 * It is authenticated, because accepting binds the invitation to an account and
 * there is no account to bind before signing in. The client's job is to carry
 * the token through sign-in and post it afterwards.
 */
@Controller({ path: 'invitations', version: '1' })
@UseAuth()
export class InvitationsController {
  public constructor(private readonly access: ProjectAccessService) {}

  /**
   * Accepts an invitation as the signed-in account.
   *
   * @param token - The raw token from the invitation link.
   * @param userId - The signed-in caller, whose verified email must be the invited one.
   * @returns The project now reachable, and the role held on it.
   */
  @Post(':token')
  public async accept(
    @Param('token') token: string,
    @User('id') userId: string,
  ): Promise<{ projectId: string; role: 'read' | 'write' }> {
    return this.access.accept(token, userId);
  }
}
