import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { CollaborationModule } from '#api/collaboration/collaboration.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';
import { ProjectPreviewController } from '#api/projects/project-preview.controller.js';
import { ProjectPreviewService } from '#api/projects/project-preview.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { ProjectDeletionController } from '#api/projects/project-deletion.controller.js';
import { ProjectsController } from '#api/projects/projects.controller.js';
import { GitModule } from '#api/git/git.module.js';
import { previewWriterProvider } from '#api/git/forwarding/preview-writer.js';

/**
 * The project registry a client claims a project id in (P51).
 *
 * Registration creates no repository, because a repository is the manifest
 * its first push commits (charter D1). `GitModule` is imported only for its git
 * executor (DC1), which the deletion fence and the preview writer use.
 */
@Module({
  /* `PublicationsModule` exports the API's daily-budget rate limiter, which
     `PUT /v1/projects/:projectId` consumes (review R5). One direction only:
     nothing in publications reads this module. */
  imports: [DatabaseModule, PublicationsModule, CollaborationModule, StorageModule, GitModule],
  controllers: [ProjectsController, ProjectPreviewController, ProjectDeletionController],
  /* DC1: GitModule's executor (forwarded to tau-storage, or in process while production has none) for
     the deletion fence and the preview writer, so this module writes nothing under `repos/` itself. */
  providers: [ProjectPreviewService, previewWriterProvider],
})
export class ProjectsModule {}
