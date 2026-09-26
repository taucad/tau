/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { Controller, Get, Param } from '@nestjs/common';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';

/** What the owner's account stores on Tau Cloud against its plan (D18). */
export type StorageUsage = {
  /** Live pack bytes of every repository the account owns. */
  readonly storageBytes: number;
  /** Large-object bytes of every repository the account owns, reservations included. */
  readonly lfsBytes: number;
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
  ) {}

  /**
   * The owner's usage and allowance, in the figures a later `413` quotes.
   *
   * @param projectId - A project the caller owns.
   * @param userId - The authenticated caller.
   * @returns Account-wide usage and the plan allowance.
   * @throws NotFoundException When the caller has no relation to the project.
   * @throws ForbiddenException When the caller is a collaborator rather than the owner.
   */
  @Get(':projectId/usage')
  public async usage(@Param('projectId') projectId: string, @User('id') userId: string): Promise<StorageUsage> {
    const { ownerId } = await this.access.authorize(projectId, userId, 'owner');
    return this.repositories.readStorageAllowance(ownerId);
  }
}
