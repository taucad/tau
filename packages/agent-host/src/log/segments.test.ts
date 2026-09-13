import { describe, expect, it } from 'vitest';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { mergeLogSegments } from '#log/segments.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { serializeLogEvent } from '#log/serialization.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent } from '#log/event-types.js';

const encoder = new TextEncoder();

const record = (input: { leaderEpoch: string; sequence: number; recordedAt: string; text: string }): AgentLogEvent => ({
  version: 1,
  leaderEpoch: input.leaderEpoch,
  sequence: input.sequence,
  recordedAt: input.recordedAt,
  runId: `run-${input.leaderEpoch}`,
  type: 'message.appended',
  message: {
    id: `${input.leaderEpoch}-${String(input.sequence)}`,
    role: 'user',
    content: input.text,
  },
});

const segment = (
  deviceId: string,
  events: readonly AgentLogEvent[],
): { deviceId: string; bytes: Uint8Array<ArrayBuffer> } => ({
  deviceId,
  bytes: encoder.encode(events.map((event) => serializeLogEvent(event)).join('')),
});

const ids = (events: readonly AgentLogEvent[]): readonly string[] =>
  events.map((event) => (event.type === 'message.appended' ? event.message.id : event.type));

describe('mergeLogSegments', () => {
  it('orders two devices by when each leadership term started and loses no record', () => {
    const deviceA = segment('device-a', [
      record({ leaderEpoch: 'epoch-a', sequence: 0, recordedAt: '2026-09-13T06:00:00.000Z', text: 'a0' }),
      record({ leaderEpoch: 'epoch-a', sequence: 1, recordedAt: '2026-09-13T06:00:01.000Z', text: 'a1' }),
    ]);
    const deviceB = segment('device-b', [
      record({ leaderEpoch: 'epoch-b', sequence: 0, recordedAt: '2026-09-13T06:05:00.000Z', text: 'b0' }),
      record({ leaderEpoch: 'epoch-b', sequence: 1, recordedAt: '2026-09-13T06:05:01.000Z', text: 'b1' }),
    ]);

    expect(ids(mergeLogSegments([deviceB, deviceA]))).toEqual(['epoch-a-0', 'epoch-a-1', 'epoch-b-0', 'epoch-b-1']);
    expect(mergeLogSegments([deviceA, deviceB])).toHaveLength(4);
  });

  /* A term is a run one writer owned: splitting it would invent an interleave
   * that never happened, so a later term that started first still lands whole. */
  it('keeps a leadership term contiguous even when the other term overlaps it', () => {
    const deviceA = segment('device-a', [
      record({ leaderEpoch: 'epoch-a', sequence: 0, recordedAt: '2026-09-13T06:00:00.000Z', text: 'a0' }),
      record({ leaderEpoch: 'epoch-a', sequence: 1, recordedAt: '2026-09-13T06:10:00.000Z', text: 'a1' }),
    ]);
    const deviceB = segment('device-b', [
      record({ leaderEpoch: 'epoch-b', sequence: 0, recordedAt: '2026-09-13T06:05:00.000Z', text: 'b0' }),
    ]);

    expect(ids(mergeLogSegments([deviceA, deviceB]))).toEqual(['epoch-a-0', 'epoch-a-1', 'epoch-b-0']);
  });

  it('sorts a term by sequence regardless of the order the bytes hold', () => {
    const out = segment('device-a', [
      record({ leaderEpoch: 'epoch-a', sequence: 1, recordedAt: '2026-09-13T06:00:01.000Z', text: 'a1' }),
      record({ leaderEpoch: 'epoch-a', sequence: 0, recordedAt: '2026-09-13T06:00:00.000Z', text: 'a0' }),
    ]);
    expect(ids(mergeLogSegments([out]))).toEqual(['epoch-a-0', 'epoch-a-1']);
  });

  /* The projection copies a device's segment into every other device's tree, so
   * the same term can be read twice; a record is its epoch and its sequence. */
  it('drops a record the projection copied twice rather than showing it twice', () => {
    const shared = [
      record({ leaderEpoch: 'epoch-a', sequence: 0, recordedAt: '2026-09-13T06:00:00.000Z', text: 'a0' }),
    ];
    expect(mergeLogSegments([segment('device-a', shared), segment('device-b', shared)])).toHaveLength(1);
  });

  /* A backwards clock step on one device (NTP, sleep/resume) must not reorder
   * that device's history against its own file: within a segment, append order
   * is authoritative. */
  it("keeps one device's own terms in its file's order across a backwards clock step", () => {
    const jumped = segment('device-a', [
      record({ leaderEpoch: 'epoch-1', sequence: 0, recordedAt: '2026-09-13T06:10:00.000Z', text: 'first' }),
      record({ leaderEpoch: 'epoch-2', sequence: 0, recordedAt: '2026-09-13T06:00:00.000Z', text: 'second' }),
    ]);
    expect(ids(mergeLogSegments([jumped]))).toEqual(['epoch-1-0', 'epoch-2-0']);
  });

  it('reads a chat no device has written yet as no records', () => {
    expect(mergeLogSegments([])).toEqual([]);
    expect(mergeLogSegments([segment('device-a', [])])).toEqual([]);
  });

  /* Exactly what a single log does: a torn tail is dropped, not thrown. */
  it('drops a torn tail in one segment without losing the others', () => {
    const torn = {
      deviceId: 'device-a',
      bytes: encoder.encode(
        `${serializeLogEvent(record({ leaderEpoch: 'epoch-a', sequence: 0, recordedAt: '2026-09-13T06:00:00.000Z', text: 'a0' }))}{"ver`,
      ),
    };
    const whole = segment('device-b', [
      record({ leaderEpoch: 'epoch-b', sequence: 0, recordedAt: '2026-09-13T06:01:00.000Z', text: 'b0' }),
    ]);
    expect(ids(mergeLogSegments([torn, whole]))).toEqual(['epoch-a-0', 'epoch-b-0']);
  });
});
