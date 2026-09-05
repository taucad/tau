import { z } from 'zod';

export const durableStreamKindSchema = z.enum(['job', 'revision']);

export type DurableStreamKind = z.infer<typeof durableStreamKindSchema>;

export const durableStreamEventSchema = z.object({
  streamId: z.string().min(1),
  sequence: z.number().int().positive(),
  eventId: z.string().min(1),
  attempt: z.number().int().positive().optional(),
  type: z.string().min(1),
  occurredAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export type DurableStreamEvent = z.infer<typeof durableStreamEventSchema>;

export type DurableStreamSnapshot = {
  readonly streamId: string;
  readonly kind: DurableStreamKind;
  readonly subjectId: string;
  readonly sequence: number;
  readonly data: Record<string, unknown>;
};

export type DurableStreamReadOutcome =
  | {
      readonly found: true;
      readonly snapshot: DurableStreamSnapshot;
      readonly events: readonly DurableStreamEvent[];
      /** Last omitted sequence when delivery was compacted to the bounded tail. */
      readonly truncatedBeforeSequence?: number;
      readonly nextSequence: number;
    }
  | { readonly found: false };

export type DurableAppendOutcome =
  | { readonly appended: true; readonly event: DurableStreamEvent }
  | { readonly appended: false; readonly reason: 'not-found' }
  | { readonly appended: false; readonly reason: 'sequence-conflict'; readonly actualSequence: number };
