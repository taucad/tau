import { Module } from '@nestjs/common';
import { DatabaseModule } from '@taucad/api-database';
import { CollaborationModule } from '#api/collaboration/collaboration.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';
import { ProjectPreviewController } from '@taucad/api-projects/projects/project-preview.controller';
import { ProjectPreviewService } from '@taucad/api-projects/projects/project-preview.service';
import { StorageModule } from '@taucad/api-object-storage/module';
import { ProjectDeletionController } from '@taucad/api-projects/projects/project-deletion.controller';
import { ProjectsController } from '@taucad/api-projects/projects/projects.controller';
import { GitModule } from '#api/git/git.module.js';
import { previewWriterProvider } from '@taucad/api-git-core/forwarding/preview-writer';

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
