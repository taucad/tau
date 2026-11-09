import { Module } from '@nestjs/common';
import { DatabaseModule } from '@taucad/api-database';
import { EmailModule } from '@taucad/api-email';
import { GitModule } from '#api/git/git.module.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { ProjectShareController } from '@taucad/api-projects/publications/project-share.controller';
import { PublicationsController } from '@taucad/api-projects/publications/publications.controller';
import { PublicationsService } from '@taucad/api-projects/publications/publications.service';
import { publicationRepositoryLeasesKey } from '@taucad/api-projects/publications/repository-leases';
import { PublicationRateLimiterService } from '@taucad/api-redis';
import { ViewerIdentityInterceptor } from '@taucad/api-projects/publications/viewer-identity.interceptor';
import { ViewerIdentityService } from '@taucad/api-projects/publications/viewer-identity.service';

@Module({
  /*
   * `GitModule` is imported one way only: publishing reads the project's bare
   * repository (S32), while the materializer the git side calls back into is a
   * function module, not a provider — so there is no circular module reference.
   * The library's `PublicationsService` asks for the leases by port, which this
   * module binds to the git service, so `api-projects` never imports the app.
   */
  imports: [DatabaseModule, EmailModule, GitModule],
  controllers: [PublicationsController, ProjectShareController],
  providers: [
    PublicationsService,
    PublicationRateLimiterService,
    ViewerIdentityService,
    ViewerIdentityInterceptor,
    { provide: publicationRepositoryLeasesKey, useExisting: GitRepositoryService },
  ],
  /* The API's only daily-budget rate limiter. `ProjectsModule` consumes it for
     `PUT /v1/projects/:projectId` (review R5) rather than re-implementing the
     Redis bucket; nothing of publications' own state leaves with it. */
  exports: [PublicationRateLimiterService],
})
export class PublicationsModule {}
