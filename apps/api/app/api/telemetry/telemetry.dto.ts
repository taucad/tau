import { createZodDto } from 'nestjs-zod';
import { clientMetricEntrySchema, flushReasons, runtimeEntryEnvelopeSchema } from '@taucad/telemetry';
import { z } from 'zod';

/**
 * `POST /v1/telemetry/ingest`: today's client metric entries, and runtime entries in their envelope (each validated
 * on its own by the runtime ingest, so one invalid entry is `rejected-invalid`, not a 400 for the batch). `batch` is
 * the reporter's 128-bit batch id; its format is checked before it reaches Redis. A batch without runtime entries
 * and without a batch id is a legacy batch and keeps today's behaviour.
 */
export const ingestBatchBodySchema = z.object({
  batch: z.string().max(64).optional(),
  reason: z.enum(flushReasons).optional(),
  entries: z.array(z.union([clientMetricEntrySchema, runtimeEntryEnvelopeSchema])).min(1),
});

export class IngestPayloadDto extends createZodDto(ingestBatchBodySchema) {}
