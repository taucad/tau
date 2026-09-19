/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';
import { CollaboratorsController, InvitationsController } from '#api/collaboration/collaboration.controller.js';
import { ProjectAccessModule } from '#api/collaboration/project-access.module.js';

/**
 * Collaboration on a project (D27).
 *
 * `ProjectAccessModule` is re-exported because its service is the *single*
 * authority on project access: the projects routes and the git service ask it
 * rather than comparing `owner_id` themselves. It is a module of its own so
 * `GitModule` can import it without the cycle `PublicationsModule` would close.
 * `PublicationsModule` is imported
 * for the API's one daily-budget rate limiter, the same way `ProjectsModule`
 * imports it. One direction only; nothing in publications reads this module.
 */
@Module({
  imports: [DatabaseModule, PublicationsModule, ProjectAccessModule],
  controllers: [CollaboratorsController, InvitationsController],
  exports: [ProjectAccessModule],
})
export class CollaborationModule {}
