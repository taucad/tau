import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { CollaborationModule } from '#api/collaboration/collaboration.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';
import { ProjectPreviewController } from '#api/projects/project-preview.controller.js';
import { ProjectPreviewService } from '#api/projects/project-preview.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { ProjectsController } from '#api/projects/projects.controller.js';

/**
 * The project registry a client claims a project id in (P51).
 *
 * `GitModule` is gone from the imports at the git cutover: registration no
 * longer creates a repository, because a repository is the manifest its first
 * push commits (charter D1).
 */
@Module({
  /* `PublicationsModule` exports the API's daily-budget rate limiter, which
     `PUT /v1/projects/:projectId` consumes (review R5). One direction only:
     nothing in publications reads this module. */
  imports: [DatabaseModule, PublicationsModule, CollaborationModule, StorageModule],
  controllers: [ProjectsController, ProjectPreviewController],
  providers: [ProjectPreviewService],
})
export class ProjectsModule {}
