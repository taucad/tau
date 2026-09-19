/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';

/**
 * The single authority on project access (D27), on its own so that every
 * surface which enforces a role can import it.
 *
 * Split out of `CollaborationModule` at the git cutover: that module imports
 * `PublicationsModule` for its daily-budget limiter, and `PublicationsModule`
 * imports `GitModule`, so a `GitModule` that reached for the whole of
 * collaboration closed a three-module cycle. The *service* needs nothing but
 * the database, and one module instance is what keeps D22's five-second cache
 * a single cache rather than one per importer.
 */
@Module({
  imports: [DatabaseModule],
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
