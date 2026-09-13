import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { EmailModule } from '#email/email.module.js';
import { BillingModule } from '#api/billing/billing.module.js';
import { GitModule } from '#api/git/git.module.js';
import { ProjectShareController } from '#api/publications/project-share.controller.js';
import { PublicationsController } from '#api/publications/publications.controller.js';
import { PublicationsService } from '#api/publications/publications.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ViewerIdentityInterceptor } from '#api/publications/viewer-identity.interceptor.js';
import { ViewerIdentityService } from '#api/publications/viewer-identity.service.js';

@Module({
  /*
   * `GitModule` is imported one way only: publishing reads the project's bare
   * repository (S32), while the materializer the git side calls back into is a
   * function module, not a provider — so there is no circular module reference.
   */
  imports: [DatabaseModule, EmailModule, BillingModule, GitModule],
  controllers: [PublicationsController, ProjectShareController],
  providers: [PublicationsService, PublicationRateLimiterService, ViewerIdentityService, ViewerIdentityInterceptor],
})
export class PublicationsModule {}
