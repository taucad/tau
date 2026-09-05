import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const readDurableEventsSchema = z.object({
  afterSequence: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  /** Milliseconds. */
  longPollDuration: z.coerce.number().int().min(0).max(25_000).default(0),
});

export class ReadDurableEventsDto extends createZodDto(readDurableEventsSchema) {}
