import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createForensicBuckets,
  forensicSpan,
  forensicSpanAsync,
  forensicValue,
  forwardProtocolForensicMeasurement,
  geoSpecForensicSpans,
} from '#runner/forensic.js';
import type { ForensicMeasurement } from '#runner/forensic.js';

const readSources = async (directory = join(import.meta.dirname, '..')): Promise<string> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return readSources(path);
      }
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? readFile(path, 'utf8') : '';
    }),
  );
  return sources.join('\n');
};

const runtimeSources = async (): Promise<string> => {
  const sources = await Promise.all([
    readFile(join(import.meta.dirname, '../../../plugins/replicad/src/replicad.kernel.ts'), 'utf8'),
    readFile(join(import.meta.dirname, '../../../plugins/replicad/src/export/interface-export.ts'), 'utf8'),
  ]);
  return sources.join('\n');
};

describe('forensic measurements', () => {
  it('should forward only finite, well-formed protocol measurements', () => {
    const measurements: ForensicMeasurement[] = [];
    const sink = measurements.push.bind(measurements);
    for (const payload of [
      null,
      [],
      'bad',
      { name: 1, value: 1, unit: 'count' },
      { name: 'n', value: '1', unit: 'count' },
      { name: 'n', value: Number.NaN, unit: 'count' },
      { name: 'n', value: 1, unit: 'seconds' },
    ]) {
      forwardProtocolForensicMeasurement(payload, sink);
    }
    forwardProtocolForensicMeasurement({ name: 'n', value: 1, unit: 'count' }, sink);
    forwardProtocolForensicMeasurement({ name: 't', value: 2, unit: 'milliseconds' }, sink);

    expect(measurements).toStrictEqual([
      { name: 'n', value: 1, unit: 'count' },
      { name: 't', value: 2, unit: 'milliseconds' },
    ]);
  });

  it('should emit structured durations and counts only through the supplied sink', async () => {
    const measurements: ForensicMeasurement[] = [];
    expect(forensicSpan('load.step.read', () => 1)).toBe(1);
    forensicValue('void.census.build', 1);
    expect(measurements).toEqual([]);

    expect(forensicSpan('load.step.read', () => 2, measurements.push.bind(measurements))).toBe(2);
    await forensicSpanAsync('load.step.bytes', async () => undefined, measurements.push.bind(measurements));
    forensicValue('void.census.build', 1, measurements.push.bind(measurements));

    expect(measurements.map(({ name, unit }) => [name, unit])).toEqual([
      ['load.step.read', 'milliseconds'],
      ['load.step.bytes', 'milliseconds'],
      ['void.census.build', 'count'],
    ]);
  });

  it('should aggregate sync and async inner-loop buckets and reset after flush', async () => {
    const measurements: ForensicMeasurement[] = [];
    const buckets = createForensicBuckets(measurements.push.bind(measurements));
    buckets.time('overlap.step.build', () => undefined);
    buckets.time('overlap.step.build', () => undefined);
    buckets.time('overlap.step.volume', () => undefined);
    await buckets.timeAsync('overlap.step.peek', async () => undefined);
    buckets.flush();
    buckets.flush();

    expect(measurements.map(({ name }) => name)).toEqual([
      'overlap.step.build',
      'overlap.step.volume',
      'overlap.step.peek',
    ]);
    expect(measurements.every(({ value }) => Number.isFinite(value) && value >= 0)).toBe(true);

    const unobserved = createForensicBuckets();
    expect(await unobserved.timeAsync('overlap.step.peek', async () => 3)).toBe(3);
  });

  it('should record and rethrow failures', async () => {
    const measurements: ForensicMeasurement[] = [];
    const sink = measurements.push.bind(measurements);
    expect(() =>
      forensicSpan(
        'load.step.read',
        () => {
          throw new Error('sync');
        },
        sink,
      ),
    ).toThrow('sync');
    await expect(
      forensicSpanAsync(
        'load.step.bytes',
        async () => {
          throw new Error('async');
        },
        sink,
      ),
    ).rejects.toThrow('async');
    expect(measurements).toHaveLength(2);
  });
});

describe('forensic span inventory', () => {
  it('should name every span exactly once and cover every literal emitter', async () => {
    expect(new Set(geoSpecForensicSpans).size).toBe(geoSpecForensicSpans.length);
    const sources = `${await readSources()}\n${await runtimeSources()}`;
    const emitted = new Set(
      [
        ...sources.matchAll(/(?:forensic(?:Span|SpanAsync|Value)|traced(?:Phase|Step))\(\s*(?:[^,]+,\s*)?'([^']+)'/gu),
      ].map((match) => match[1]!),
    );
    const inventory = new Set<string>(geoSpecForensicSpans);
    expect([...emitted].filter((name) => !inventory.has(name))).toEqual([]);
    expect(emitted.size).toBeGreaterThan(0);
  });
});
