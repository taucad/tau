/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '#auth/auth.guard.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { ReadDurableEventsDto } from '#api/durable-events/durable-events.dto.js';
import { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import type { DurableStreamReadOutcome } from '#api/durable-events/durable-events.types.js';

@Controller({ path: 'streams', version: '1' })
@UseGuards(AuthGuard)
export class DurableEventsController {
  public constructor(private readonly durableEvents: DurableEventsService) {}

  @Get(':streamId/events')
  @UseAuth()
  public async readEvents(
    @Param('streamId') streamId: string,
    @Query() query: ReadDurableEventsDto,
    @User('id') ownerId: string,
  ): Promise<Exclude<DurableStreamReadOutcome, { readonly found: false }>> {
    const outcome = await this.durableEvents.waitForEvents({
      streamId,
      ownerId,
      afterSequence: query.afterSequence,
      limit: query.limit,
      longPollDuration: query.longPollDuration,
    });
    if (!outcome.found) {
      throw new NotFoundException('Durable stream not found.');
    }
    return outcome;
  }
}
