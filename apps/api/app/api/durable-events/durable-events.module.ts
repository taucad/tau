import { Module } from '@nestjs/common';
import { DatabaseModule } from '@taucad/api-database';
import { ProjectAccessModule } from '@taucad/api-projects/collaboration/project-access.module';
import { DurableEventsController } from '#api/durable-events/durable-events.controller.js';
import { DurableEventsService } from '#api/durable-events/durable-events.service.js';

@Module({
  imports: [DatabaseModule, ProjectAccessModule],
  controllers: [DurableEventsController],
  providers: [DurableEventsService],
  exports: [DurableEventsService],
})
export class DurableEventsModule {}
