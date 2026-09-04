import { describe, expect, it } from 'vitest';
import {
  JobProjectionProtocolError,
  applyDurableJobRead,
  createJobProjection,
  parseDurableJobRead,
} from '#lib/jobs-projection.js';
import type { DurableJobRead, JobSnapshot } from '#lib/jobs-projection.js';

const digest = `sha256:${'a'.repeat(64)}`;
const timestamp = '2026-08-28T00:00:00.000Z';

const snapshot = (overrides: Partial<JobSnapshot> = {}): JobSnapshot => ({
  jobId: 'job-1',
  projectId: 'project-1',
  streamId: 'stream-1',
  idempotencyKey: 'job-key-1',
  definitionDigest: digest,
  definition: {
    type: 'openfoam',
    version: '1',
    input: { digest, size: 42, mediaType: 'application/json', storageKey: 'inputs/job-1.json' },
    requirements: [],
    slotCost: 1,
    maxAttempts: 3,
    options: {},
    outputs: [],
  },
  state: 'running',
  currentAttempt: 1,
  orchestratorRunId: 'run-1',
  runnerId: 'runner-1',
  leaseUntil: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  cancelRequestedAt: null,
  finishedAt: null,
  artifacts: [],
  ...overrides,
});

const event = (sequence: number) => ({
  streamId: 'stream-1',
  sequence,
  eventId: `event-${sequence}`,
  type: 'job.progress',
  occurredAt: timestamp,
  payload: {
    progress: { phase: 'solve', completed: sequence, total: 4, message: `Step ${sequence}` },
  },
});

const page = ({
  sequence,
  events,
  data = snapshot(),
  truncatedBeforeSequence,
}: {
  readonly sequence: number;
  readonly events: Array<ReturnType<typeof event>>;
  readonly data?: JobSnapshot;
  readonly truncatedBeforeSequence?: number;
}): DurableJobRead => ({
  found: true,
  snapshot: { streamId: 'stream-1', kind: 'job', subjectId: 'job-1', sequence, data },
  events,
  ...(truncatedBeforeSequence === undefined ? {} : { truncatedBeforeSequence }),
  nextSequence: sequence,
});

describe('durable job projection', () => {
  it('replays from the exact cursor and bounds retained progress activity', () => {
    let projection = createJobProjection(snapshot());
    projection = applyDurableJobRead({ current: projection, raw: page({ sequence: 2, events: [event(1), event(2)] }) });
    projection = applyDurableJobRead({
      current: projection,
      raw: page({ sequence: 3, events: [event(3)] }),
      retainedActivity: 2,
    });

    expect(projection.cursor).toBe(3);
    expect(projection.activity.map(({ sequence }) => sequence)).toEqual([2, 3]);
    expect(projection.activity.at(-1)?.progress?.message).toBe('Step 3');
  });

  it('fails closed on sequence gaps without changing the current cursor', () => {
    const current = createJobProjection(snapshot());
    expect(() => applyDurableJobRead({ current, raw: page({ sequence: 2, events: [event(2)] }) })).toThrow(
      'expected 1, received 2',
    );
    expect(current.cursor).toBe(0);
  });

  it('accepts an explicit bounded-tail truncation while preserving exact event order', () => {
    const projection = applyDurableJobRead({
      current: createJobProjection(snapshot()),
      raw: page({ sequence: 4, events: [event(3), event(4)], truncatedBeforeSequence: 2 }),
    });

    expect(projection.cursor).toBe(4);
    expect(projection.activity.map(({ sequence }) => sequence)).toEqual([3, 4]);
  });

  it('rejects malformed stream envelopes and unknown snapshot fields', () => {
    expect(() => parseDurableJobRead({ found: true })).toThrow(JobProjectionProtocolError);
    expect(() =>
      parseDurableJobRead({
        ...page({ sequence: 1, events: [event(1)] }),
        snapshot: {
          ...page({ sequence: 1, events: [event(1)] }).snapshot,
          data: { ...snapshot(), unexpected: true },
        },
      }),
    ).toThrow(JobProjectionProtocolError);
  });
});
