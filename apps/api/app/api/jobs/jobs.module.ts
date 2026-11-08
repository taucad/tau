import { Module } from '@nestjs/common';
import { HostsModule } from '@taucad/api-hosts';
import { DurableEventsModule } from '#api/durable-events/durable-events.module.js';
import { JobsController } from '#api/jobs/jobs.controller.js';
import { JobsService } from '#api/jobs/jobs.service.js';
import { DatabaseModule } from '@taucad/api-database';

@Module({
  imports: [HostsModule, DatabaseModule, DurableEventsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
