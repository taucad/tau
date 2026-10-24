/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- Nest decorators and runtime DI metadata. */
import { BadRequestException, Controller, Delete, Get, Header, Inject, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { DatabaseService } from '#database/database.service.js';
import type { Environment } from '#config/environment.config.js';
import { gitExecutorKey } from '#api/git/forwarding/git-executor.js';
import type { GitExecutor } from '#api/git/forwarding/git-executor.js';
import { executorTombstoneFence } from '#api/git/forwarding/tombstone-fence.js';
import { isProjectRepositoryId } from '#api/git/git.constants.js';
import {
  completeProjectDeletion,
  readOwnedProjectDeletion,
  requestProjectDeletion,
} from '#api/projects/project-deletion.js';
import type { ProjectDeletionStatus } from '#api/projects/project-deletion.js';

@Controller({ path: 'projects', version: '1' })
@UseAuth()
export class ProjectDeletionController {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    /* DC1: the tombstone is committed by tau-storage; tau-api holds no repository write. */
    @Inject(gitExecutorKey) private readonly executor: GitExecutor,
  ) {}

  @Get(':projectId/deletion')
  @Header('Cache-Control', 'private, no-store')
  public async status(
    @Param('projectId') projectId: string,
    @User('id') userId: string,
  ): Promise<ProjectDeletionStatus> {
    this.validateId(projectId);
    return readOwnedProjectDeletion(this.databaseService.database, projectId, userId);
  }

  @Delete(':projectId')
  @Header('Cache-Control', 'private, no-store')
  public async delete(
    @Param('projectId') projectId: string,
    @User('id') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ProjectDeletionStatus> {
    this.validateId(projectId);
    await requestProjectDeletion({
      database: this.databaseService.database,
      projectId,
      userId,
      enabled: this.config.get('TAU_PROJECT_DELETION_ENABLED', false, { infer: true }),
    });
    const result = await completeProjectDeletion({
      database: this.databaseService.database,
      fence: executorTombstoneFence(this.executor),
      projectId,
    });
    void reply.status(result.state === 'deleted' ? 200 : 202);
    return result;
  }

  private validateId(projectId: string): void {
    if (!isProjectRepositoryId(projectId)) {
      throw new BadRequestException({ code: 'PROJECT_ID_INVALID', message: 'Not a project id' });
    }
  }
}
