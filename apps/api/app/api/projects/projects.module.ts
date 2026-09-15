import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { GitModule } from '#api/git/git.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';
import { ProjectsController } from '#api/projects/projects.controller.js';

/**
 * The project registry a client claims a project id in (P51).
 *
 * `GitModule` is imported one way only, for `GitRepositoryService.ensureRepository`;
 * nothing in the git module reads this one.
 */
@Module({
  /* `PublicationsModule` exports the API's daily-budget rate limiter, which
     `PUT /v1/projects/:projectId` consumes (review R5). One direction only:
     nothing in publications reads this module. */
  imports: [DatabaseModule, GitModule, PublicationsModule],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
