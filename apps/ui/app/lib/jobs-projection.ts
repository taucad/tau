import { z } from 'zod';

export const jobStates = [
  'queued',
  'assigned',
  'running',
  'waiting',
  'cancel_requested',
  'completed',
  'failed',
  'cancelled',
] as const;

export type JobState = (typeof jobStates)[number];

const sha256Schema = z.string().regex(/^sha256:[\da-f]{64}$/u);
const timestampSchema = z.iso.datetime();
const nullableTimestampSchema = timestampSchema.nullable();
const logicalPathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Expected a rooted-safe relative path',
  );

const jobDefinitionSchema = z
  .object({
    type: z.string().min(1),
    version: z.string().min(1),
    input: z
      .object({
        digest: sha256Schema,
        size: z.number().int().nonnegative(),
        mediaType: z.string().min(1),
        storageKey: z.string().min(1),
      })
      .strict(),
    requirements: z.array(z.unknown()),
    slotCost: z.number().int().positive(),
    maxAttempts: z.number().int().positive(),
    options: z.record(z.string(), z.unknown()),
    outputs: z.array(
      z
        .object({
          role: z.string().min(1),
          logicalPath: logicalPathSchema,
          mediaType: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

const jobProgressSchema = z
  .object({
    phase: z.string().min(1),
    completed: z.number().nonnegative(),
    total: z.number().positive(),
    message: z.string(),
  })
  .strict();

const jobArtifactSchema = z
  .object({
    artifactId: z.string().min(1),
    digest: sha256Schema,
    size: z.number().int().nonnegative(),
    mediaType: z.string().min(1),
    role: z.string().min(1),
    logicalPath: logicalPathSchema,
    storageKey: z.string().min(1),
    provenance: z
      .object({
        jobId: z.string().min(1),
        attemptId: z.string().min(1),
        attempt: z.number().int().positive(),
        runnerId: z.string().min(1),
        providerId: z.string().min(1),
        providerVersion: z.string().min(1),
        inputDigest: sha256Schema,
      })
      .strict(),
  })
  .strict();

const jobFailureSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();

export const jobSnapshotSchema = z
  .object({
    jobId: z.string().min(1),
    projectId: z.string().min(1),
    streamId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    definitionDigest: sha256Schema,
    definition: jobDefinitionSchema,
    state: z.enum(jobStates),
    currentAttempt: z.number().int().nonnegative(),
    orchestratorRunId: z.string().min(1).nullable(),
    runnerId: z.string().min(1).nullable(),
    leaseUntil: nullableTimestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    cancelRequestedAt: nullableTimestampSchema,
    finishedAt: nullableTimestampSchema,
    progress: jobProgressSchema.nullable().optional(),
    artifacts: z.array(jobArtifactSchema).optional(),
    failure: jobFailureSchema.optional(),
    cancellationReason: z.string().min(1).optional(),
    result: z.unknown().optional(),
  })
  .strict();

export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;
export type JobProgress = NonNullable<JobSnapshot['progress']>;
export type JobArtifact = NonNullable<JobSnapshot['artifacts']>[number];

export const jobArtifactDownloadSchema = z
  .object({
    digest: sha256Schema,
    mediaType: z.string().min(1),
    size: z.number().int().nonnegative(),
    storageKey: z.string().min(1),
    downloadUrl: z.url(),
  })
  .strict();

const durableEventSchema = z
  .object({
    streamId: z.string().min(1),
    sequence: z.number().int().positive(),
    eventId: z.string().min(1),
    attempt: z.number().int().positive().optional(),
    type: z.string().min(1),
    occurredAt: timestampSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

const durableReadSchema = z
  .object({
    found: z.literal(true),
    snapshot: z
      .object({
        streamId: z.string().min(1),
        kind: z.literal('job'),
        subjectId: z.string().min(1),
        sequence: z.number().int().nonnegative(),
        data: jobSnapshotSchema,
      })
      .strict(),
    events: z.array(durableEventSchema),
    truncatedBeforeSequence: z.number().int().nonnegative().optional(),
    nextSequence: z.number().int().nonnegative(),
  })
  .strict();

export type DurableJobRead = z.infer<typeof durableReadSchema>;
export type JobActivity = {
  readonly eventId: string;
  readonly sequence: number;
  readonly type: string;
  readonly occurredAt: string;
  readonly attempt?: number;
  readonly message?: string;
  readonly progress?: JobProgress;
};

export type JobSyncState = 'connecting' | 'live' | 'reconnecting' | 'failed' | 'complete';

export type JobProjection = {
  readonly snapshot: JobSnapshot;
  readonly cursor: number;
  readonly activity: readonly JobActivity[];
  readonly syncState: JobSyncState;
  readonly syncError?: string;
};

export class JobProjectionProtocolError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JobProjectionProtocolError';
  }
}

export const terminalJobStates = new Set<JobState>(['completed', 'failed', 'cancelled']);

export const isTerminalJobState = (state: JobState): boolean => terminalJobStates.has(state);

const parseOrThrow = <Output>(schema: z.ZodType<Output>, value: unknown, label: string): Output => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new JobProjectionProtocolError(`Malformed ${label}.`, { cause: result.error });
  }
  return result.data;
};

export const parseJobList = (value: unknown): readonly JobSnapshot[] =>
  parseOrThrow(z.array(jobSnapshotSchema), value, 'job list');

export const parseJobSnapshot = (value: unknown): JobSnapshot => parseOrThrow(jobSnapshotSchema, value, 'job snapshot');

export const parseDurableJobRead = (value: unknown): DurableJobRead =>
  parseOrThrow(durableReadSchema, value, 'durable job stream page');

export const createJobProjection = (snapshot: JobSnapshot, previous?: JobProjection): JobProjection => ({
  snapshot,
  cursor: previous?.snapshot.streamId === snapshot.streamId ? previous.cursor : 0,
  activity: previous?.snapshot.streamId === snapshot.streamId ? previous.activity : [],
  syncState: isTerminalJobState(snapshot.state)
    ? 'complete'
    : previous?.snapshot.streamId === snapshot.streamId
      ? previous.syncState
      : 'connecting',
  ...(previous?.snapshot.streamId === snapshot.streamId && previous.syncError ? { syncError: previous.syncError } : {}),
});

const activityFromEvent = (event: DurableJobRead['events'][number]): JobActivity => {
  const { progress: rawProgress, reason, failure: rawFailure } = event.payload;
  const progress = jobProgressSchema.safeParse(rawProgress);
  const failure = jobFailureSchema.safeParse(rawFailure);
  const message = progress.success
    ? progress.data.message
    : typeof reason === 'string'
      ? reason
      : failure.success
        ? failure.data.message
        : undefined;
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    type: event.type,
    occurredAt: event.occurredAt,
    ...(event.attempt === undefined ? {} : { attempt: event.attempt }),
    ...(message === undefined ? {} : { message }),
    ...(progress.success ? { progress: progress.data } : {}),
  };
};

export const applyDurableJobRead = ({
  current,
  raw,
  retainedActivity = 100,
}: {
  readonly current: JobProjection;
  readonly raw: unknown;
  readonly retainedActivity?: number;
}): JobProjection => {
  const page = parseDurableJobRead(raw);
  const { snapshot } = page;
  if (snapshot.streamId !== current.snapshot.streamId || snapshot.data.streamId !== current.snapshot.streamId) {
    throw new JobProjectionProtocolError('Durable stream identity changed.');
  }
  if (snapshot.subjectId !== current.snapshot.jobId || snapshot.data.jobId !== current.snapshot.jobId) {
    throw new JobProjectionProtocolError('Durable stream subject changed.');
  }
  if (snapshot.data.projectId !== current.snapshot.projectId) {
    throw new JobProjectionProtocolError('Durable stream project changed.');
  }
  if (snapshot.sequence !== page.nextSequence) {
    throw new JobProjectionProtocolError('Snapshot sequence does not match next sequence.');
  }

  const pageStart = page.truncatedBeforeSequence ?? current.cursor;
  if (pageStart < current.cursor || pageStart > page.nextSequence) {
    throw new JobProjectionProtocolError('Durable stream truncation cursor is invalid.');
  }
  let expected = pageStart + 1;
  for (const event of page.events) {
    if (event.streamId !== current.snapshot.streamId) {
      throw new JobProjectionProtocolError('Durable event stream identity changed.');
    }
    if (event.sequence !== expected) {
      throw new JobProjectionProtocolError(
        `Durable event sequence gap: expected ${expected}, received ${event.sequence}.`,
      );
    }
    expected += 1;
  }
  const finalEventSequence = page.events.at(-1)?.sequence ?? current.cursor;
  if (finalEventSequence !== page.nextSequence) {
    throw new JobProjectionProtocolError(
      `Durable page ended at ${finalEventSequence}, but advertised next sequence ${page.nextSequence}.`,
    );
  }

  const activity = [...current.activity, ...page.events.map(activityFromEvent)].slice(-Math.max(0, retainedActivity));
  return {
    snapshot: snapshot.data,
    cursor: page.nextSequence,
    activity,
    syncState: isTerminalJobState(snapshot.data.state) ? 'complete' : 'live',
  };
};

export const markJobProjectionSync = (
  projection: JobProjection,
  syncState: Extract<JobSyncState, 'connecting' | 'reconnecting' | 'failed'>,
  syncError?: string,
): JobProjection => ({
  ...projection,
  syncState,
  ...(syncError ? { syncError } : {}),
});
