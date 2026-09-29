import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelemetryOrigin, WorkerTelemetryCollector, toAbsoluteTime } from '#framework/worker-telemetry.js';
import type { TelemetryEntry } from '#types/runtime-protocol.types.js';

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
    expect(send).toHaveBeenCalledWith([entry('kernel.render'), entry('kernel.compute')]);
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
    expect(send).toHaveBeenCalledWith([entry('before-dispose')]);
  });
});
