import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { DurableEventsController } from '#api/durable-events/durable-events.controller.js';
import { DurableEventsService } from '#api/durable-events/durable-events.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [DurableEventsController],
  providers: [DurableEventsService],
  exports: [DurableEventsService],
})
export class DurableEventsModule {}
