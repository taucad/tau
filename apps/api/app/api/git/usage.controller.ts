/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { Controller, Get, HttpException, HttpStatus, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';

/** Usage reads per caller per window (RV-W8 F8): a Sync region reads on connect and after a push. */
export const usageReadsPerWindow = 30;
const usageWindowSeconds = 60;

/** What the owner's account stores on Tau Cloud against its plan (D18). */
export type StorageUsage = {
  /** Live pack bytes of every repository the account owns. */
  readonly storageBytes: number;
  /** Large-object bytes of every repository the account owns, reservations included. */
  readonly lfsBytes: number;
  /**
   * Retired pack bytes the store keeps inside the retention window (D18,
   * L6-F5): reported beside the charged figure, never counted against
   * `storageLimitBytes`.
   */
  readonly retainedBytes: number;
  /** The account's allowance; `0` when the plan does not sync. */
  readonly storageLimitBytes: number;
};

/**
 * The usage route (charter D18, NS9): a Sync region shows `x of 1 GB` before
 * the first refusal instead of meeting the allowance as a `413`.
 *
 * Owner-scoped: the allowance is the owner's account, which a collaborator's
 * push draws on but whose size is the owner's business, so a collaborator is
 * refused (`403`) and draws no meter — their refusal is the owner-directed
 * sentence, which quotes no figure either (D17). The project names which
 * account; the answer is account-wide, because that is what the quota counts.
 */
@Controller({ path: 'projects', version: '1' })
@UseAuth()
export class UsageController {
  public constructor(
    private readonly access: ProjectAccessService,
    private readonly repositories: GitRepositoryService,
    private readonly rateLimiter: PublicationRateLimiterService,
  ) {}

  /**
   * The owner's usage and allowance, in the figures a later `413` quotes.
   *
   * @param projectId - A project the caller owns.
   * @param userId - The authenticated caller.
   * @param reply - Carries `Retry-After` on a refused read.
   * @returns Account-wide usage and the plan allowance.
   * @throws HttpException `429` with `Retry-After` when the caller's window is spent.
   * @throws NotFoundException When the caller has no relation to the project.
   * @throws ForbiddenException When the caller is a collaborator rather than the owner.
   */
  @Get(':projectId/usage')
  public async usage(
    @Param('projectId') projectId: string,
    @User('id') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StorageUsage> {
    const budget = await this.rateLimiter.consumeWindowBudget({
      key: `git:usage:${userId}`,
      limit: usageReadsPerWindow,
      windowSeconds: usageWindowSeconds,
    });
    if (!budget.allowed) {
      void reply.header('retry-after', String(budget.retryAfterSeconds));
      throw new HttpException(
        { code: 'USAGE_RATE_LIMITED', message: 'Too many requests; retry shortly.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const { ownerId } = await this.access.authorize(projectId, userId, 'owner');
    return this.repositories.readStorageAllowance(ownerId);
  }
}
