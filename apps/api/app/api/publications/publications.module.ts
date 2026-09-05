import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { EmailModule } from '#email/email.module.js';
import { BillingModule } from '#api/billing/billing.module.js';
import { ProjectShareController } from '#api/publications/project-share.controller.js';
import { PublicationsController } from '#api/publications/publications.controller.js';
import { PublicationsService } from '#api/publications/publications.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ViewerIdentityInterceptor } from '#api/publications/viewer-identity.interceptor.js';
import { ViewerIdentityService } from '#api/publications/viewer-identity.service.js';

@Module({
  imports: [DatabaseModule, EmailModule, BillingModule],
  controllers: [PublicationsController, ProjectShareController],
  providers: [PublicationsService, PublicationRateLimiterService, ViewerIdentityService, ViewerIdentityInterceptor],
})
export class PublicationsModule {}
