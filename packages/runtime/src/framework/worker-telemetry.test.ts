import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTelemetryOrigin,
  WorkerTelemetryCollector,
  toAbsoluteTime,
  workerTelemetryCollectorLimit,
} from '#framework/worker-telemetry.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

const entry = (name: string): TelemetryEntry => ({
  name,
  startTime: 100,
  duration: 50,
  workerTimeOrigin: 1_000_000,
});

afterEach(() => vi.unstubAllGlobals());

it('puts a utility PID in its otherwise opaque producer identity', () => {
  vi.stubGlobal('process', { type: 'utility', pid: 42 });
  const first = createTelemetryOrigin();
  const second = createTelemetryOrigin();
  expect(first.label).toBe('utility');
  expect(first.instance).toMatch(/^pid-42-[\da-f-]+$/u);
  expect(second.instance).not.toBe(first.instance);
});

describe('toAbsoluteTime', () => {
  it('adds workerTimeOrigin and startTime', () => {
    expect(toAbsoluteTime(entry('kernel.render'))).toBe(1_000_100);
  });
});

describe('WorkerTelemetryCollector', () => {
  it('batches directly collected entries on explicit flush', () => {
    const send = vi.fn();
    const collector = new WorkerTelemetryCollector(send);
    collector.collect(entry('kernel.render'));
    collector.collect(entry('kernel.compute'));

    collector.flush();

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ entries: [entry('kernel.render'), entry('kernel.compute')], dropped: 0 });
  });

  it('does not send an empty batch', () => {
    const send = vi.fn();
    const collector = new WorkerTelemetryCollector(send);

    collector.flush();

    expect(send).not.toHaveBeenCalled();
  });

  it('flushes once on dispose and ignores later collection', () => {
    const send = vi.fn();
    const collector = new WorkerTelemetryCollector(send);
    collector.collect(entry('before-dispose'));

    collector.dispose();
    collector.collect(entry('after-dispose'));
    collector.flush();
    collector.dispose();

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ entries: [entry('before-dispose')], dropped: 0 });
  });

  it('should hold at most the limit and count the overflow on the next batch', () => {
    const send = vi.fn();
    const collector = new WorkerTelemetryCollector(send);
    for (let index = 0; index <= workerTelemetryCollectorLimit; index++) {
      collector.collect(entry('fs.read'));
    }

    collector.flush();

    expect(send).toHaveBeenCalledOnce();
    const [batch] = send.mock.calls[0] as [{ entries: TelemetryEntry[]; dropped: number; droppedRoots?: unknown }];
    expect(batch.entries).toHaveLength(workerTelemetryCollectorLimit);
    expect(batch.dropped).toBe(1);
    expect(batch.droppedRoots).toBeUndefined();
  });

  it('should name a dropped operation root by its operation id', () => {
    const send = vi.fn();
    const collector = new WorkerTelemetryCollector(send, 1);
    collector.collect(entry('fs.read'));
    collector.collect({ ...entry('kernel.render'), detail: { spanId: '7', 'operation.id': 'render:v1:e1:r1' } });

    collector.flush();

    expect(send).toHaveBeenCalledWith({
      entries: [entry('fs.read')],
      dropped: 1,
      droppedRoots: { '7': 'render:v1:e1:r1' },
    });
  });

  it('should send a batch that only reports loss, then reset the count', () => {
    const send = vi.fn();
    const collector = new WorkerTelemetryCollector(send);
    collector.noteDropped();

    collector.flush();
    collector.flush();

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ entries: [], dropped: 1 });
  });
});
