import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { forensicSpanAsync, geoSpecForensicSpans } from '#runner/forensic.js';
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
  it('should time an operation only through the supplied sink', async () => {
    const measurements: ForensicMeasurement[] = [];
    expect(await forensicSpanAsync('runner.file', async () => 1)).toBe(1);
    expect(measurements).toEqual([]);

    expect(await forensicSpanAsync('runner.file', async () => 2, measurements.push.bind(measurements))).toBe(2);

    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({ name: 'runner.file', unit: 'milliseconds' });
    expect(measurements[0]!.value).toBeGreaterThanOrEqual(0);
  });

  it('should record and rethrow failures', async () => {
    const measurements: ForensicMeasurement[] = [];
    await expect(
      forensicSpanAsync(
        'runner.shard',
        async () => {
          throw new Error('async');
        },
        measurements.push.bind(measurements),
      ),
    ).rejects.toThrow('async');
    expect(measurements.map(({ name }) => name)).toStrictEqual(['runner.shard']);
  });
});

describe('forensic span inventory', () => {
  it('should name every span exactly once and cover every literal emitter', async () => {
    expect(new Set(geoSpecForensicSpans).size).toBe(geoSpecForensicSpans.length);
    const sources = `${await readSources()}\n${await runtimeSources()}`;
    const emitted = new Set(
      [...sources.matchAll(/(?:forensicSpanAsync|traced(?:Phase|Step))\(\s*(?:[^,]+,\s*)?'([^']+)'/gu)].map(
        (match) => match[1]!,
      ),
    );
    const inventory = new Set<string>(geoSpecForensicSpans);
    expect([...emitted].filter((name) => !inventory.has(name))).toEqual([]);
    expect(emitted.size).toBeGreaterThan(0);
  });
});
