import { Module } from '@nestjs/common';
import { HostsModule } from '#api/hosts/hosts.module.js';
import { DurableEventsModule } from '#api/durable-events/durable-events.module.js';
import { JobsController } from '#api/jobs/jobs.controller.js';
import { JobsDispatcherService } from '#api/jobs/jobs-dispatcher.service.js';
import { JobOrchestratorService } from '#api/jobs/job-orchestrator.service.js';
import { JobsService } from '#api/jobs/jobs.service.js';
import { DatabaseModule } from '#database/database.module.js';

@Module({
  imports: [HostsModule, DatabaseModule, DurableEventsModule],
  controllers: [JobsController],
  providers: [JobOrchestratorService, JobsService, JobsDispatcherService],
  exports: [JobsService],
})
export class JobsModule {}
