/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';
import { CollaboratorsController, InvitationsController } from '#api/collaboration/collaboration.controller.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';

/**
 * Collaboration on a project (D27).
 *
 * `ProjectAccessService` is exported because it is the *single* authority on
 * project access: the projects routes and, at cutover, the git service ask it
 * rather than comparing `owner_id` themselves. `PublicationsModule` is imported
 * for the API's one daily-budget rate limiter, the same way `ProjectsModule`
 * imports it. One direction only; nothing in publications reads this module.
 */
@Module({
  imports: [DatabaseModule, PublicationsModule],
  controllers: [CollaboratorsController, InvitationsController],
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class CollaborationModule {}
