import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeRuntimeTrace } from '#benchmarks/runtime-trace.js';

const span = (input: { name: string; startTime: number; duration: number; epoch: number }): string =>
  JSON.stringify({ ...input, workerTimeOrigin: 0, origin: { label: 'node', instance: 'i' } });

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-trace-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('mergeRuntimeTrace', () => {
  it('interleaves every producer on the absolute clock and totals the heaviest spans', async () => {
    await writeFile(
      join(directory, 'utility-a.jsonl'),
      `${span({ name: 'kernel.export', startTime: 5, duration: 40, epoch: 1000 })}\n`,
    );
    await writeFile(
      join(directory, 'main-b.jsonl'),
      [
        span({ name: 'desktop.boot', startTime: 0, duration: 10, epoch: 1000 }),
        span({ name: 'kernel.render', startTime: 100, duration: 60, epoch: 1000 }),
        'half a line from a killed process',
      ].join('\n'),
    );

    const destination = join(directory, 'merged', 'trace.jsonl');
    const summary = await mergeRuntimeTrace({ directory, destination });

    expect(summary).toMatchObject({ file: destination, spanCount: 3 });
    // Heaviest first, regardless of which producer's file happened to be read first.
    expect(Object.entries(summary!.totals)).toEqual([
      ['kernel.render', 60],
      ['kernel.export', 40],
      ['desktop.boot', 10],
    ]);
    const merged = await readFile(destination, 'utf8');
    expect(
      merged
        .split('\n')
        .filter(Boolean)
        .map((line) => (JSON.parse(line) as { name: string }).name),
    ).toEqual(['desktop.boot', 'kernel.export', 'kernel.render']);
  });

  it('reports nothing rather than an empty trace when the run produced no spans', async () => {
    await expect(
      mergeRuntimeTrace({ directory, destination: join(directory, 'trace.jsonl') }),
    ).resolves.toBeUndefined();
    await expect(
      mergeRuntimeTrace({ directory: join(directory, 'absent'), destination: join(directory, 'trace.jsonl') }),
    ).resolves.toBeUndefined();
  });
});
