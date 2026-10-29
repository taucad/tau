import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TimingSpan } from '#ci-timing.js';
import { createTimingRecorder } from '#ci-timing.js';

const directories: string[] = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), 'tau-ci-timing-'));
  directories.push(path);
  return path;
};
afterEach(() => {
  for (const path of directories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('CI timing records', () => {
  it('should retain nested timing and validator outcomes without changing values', async () => {
    let time = 100;
    const recorder = createTimingRecorder({ directory: directory(), metadata: { kind: 'test' }, clock: () => time });
    const value = await recorder.measure('validation', async () => {
      time += 2;
      recorder.measureSync('compiler', () => {
        time += 7;
        return { status: 'fail' };
      });
      time += 3;
      return { status: 'fail', details: ['bad import'] };
    });
    expect(value).toEqual({ status: 'fail', details: ['bad import'] });
    const path = recorder.finish(1)!;
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      duration: 12,
      exitCode: 1,
      unit: 'milliseconds',
      spans: [
        { id: 0, phase: 'validation', start: 0, duration: 12, outcome: 'failure' },
        { id: 1, parent: 0, phase: 'compiler', start: 2, duration: 7, outcome: 'failure' },
      ],
    });
    expect(recorder.finish(0)).toBeUndefined();
  });
  it('should propagate synchronous and async failures while keeping failed spans', async () => {
    const recorder = createTimingRecorder({ directory: directory(), metadata: {} });
    const error = new Error('deliberate validator failure');
    expect(() =>
      recorder.measureSync('sync', () => {
        throw error;
      }),
    ).toThrow(error);
    await expect(
      recorder.measure('async', async () => {
        throw error;
      }),
    ).rejects.toThrow(error);
    const report = JSON.parse(readFileSync(recorder.finish(1)!, 'utf8')) as { spans: TimingSpan[] };
    expect(report.spans.map((s: { outcome: string }) => s.outcome)).toEqual(['failure', 'failure']);
  });
  it('should preserve skips and successful return values', () => {
    const recorder = createTimingRecorder({ directory: directory(), metadata: {} });
    expect(recorder.measureSync('empty', () => ({ status: 'skip' }))).toEqual({ status: 'skip' });
    expect(recorder.measureSync('value', () => 42)).toBe(42);
    const report = JSON.parse(readFileSync(recorder.finish(0)!, 'utf8')) as { spans: TimingSpan[] };
    expect(report.spans.map((s: { outcome: string }) => s.outcome)).toEqual(['skip', 'success']);
  });
  it('should write no files when disabled and isolate concurrent invocations', () => {
    const disabled = createTimingRecorder({ directory: undefined, metadata: {} });
    expect(disabled.measureSync('value', () => 42)).toBe(42);
    expect(disabled.finish(0)).toBeUndefined();
    const path = directory();
    const one = createTimingRecorder({ directory: path, metadata: { package: 'one' } });
    const two = createTimingRecorder({ directory: path, metadata: { package: 'two' } });
    expect(one.finish(0)).not.toBe(two.finish(1));
    expect(readdirSync(path)).toHaveLength(2);
  });
});
