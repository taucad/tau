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

/** What stream ids of a project's `revision` stream start with. */
const revisionStreamPrefix = 'revision:';

/**
 * The one `revision` stream of a project (charter D13), keyed by the project so
 * an open client subscribes without a lookup route. Job streams are `str_…`
 * ids, so the two id spaces never meet.
 *
 * @param projectId - The project whose committed manifests the stream announces.
 * @returns The stream id to long-poll at `GET /v1/streams/:streamId/events`.
 */
export const revisionStreamId = (projectId: string): string => `${revisionStreamPrefix}${projectId}`;

/**
 * The project a stream id names, when it is a `revision` stream.
 *
 * @param streamId - The id a caller asked for.
 * @returns The project id, or `undefined` for every other stream.
 */
export const revisionStreamProjectId = (streamId: string): string | undefined =>
  streamId.startsWith(revisionStreamPrefix) && streamId.length > revisionStreamPrefix.length
    ? streamId.slice(revisionStreamPrefix.length)
    : undefined;

/** The event type of one committed manifest on a `revision` stream. */
export const revisionCommittedEventType = 'revision.committed';

/**
 * One committed manifest (D13): its generation and the refs it moved, never
 * bytes. A client that receives it fetches over git.
 */
export type RevisionCommittedPayload = {
  readonly generation: number;
  readonly refs: readonly string[];
};
