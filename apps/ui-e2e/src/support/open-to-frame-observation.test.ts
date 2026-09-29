import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- Node-only unit test imports the directly executed driver's helper.
import { epochForRelativeMarks, observedKernelSelection } from './open-to-frame-observation.ts';

let directory: string | undefined;
afterEach(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

it('anchors relative sample marks at their actual wall-clock time', () => {
  const anchor = epochForRelativeMarks(500, 100_000, 510);
  expect(anchor + 20).toBe(100_010);
});

it('accepts a selected kernel only when it belongs to a render in the same utility', async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-otf-selection-'));
  const file = join(directory, 'trace.jsonl');
  await writeFile(
    file,
    [
      { name: 'kernel.render', detail: { spanId: '10' }, origin: { instance: 'utility-a' } },
      {
        name: 'kernel.select',
        detail: { parentSpanId: '10', kernelId: 'jscad' },
        origin: { instance: 'utility-a' },
      },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n'),
  );
  expect(await observedKernelSelection(file)).toBe('jscad');

  await writeFile(
    file,
    [
      { name: 'kernel.render', detail: { spanId: '10' }, origin: { instance: 'utility-a' } },
      {
        name: 'kernel.select',
        detail: { parentSpanId: '10', kernelId: 'jscad' },
        origin: { instance: 'utility-b' },
      },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n'),
  );
  expect(await observedKernelSelection(file)).toBeUndefined();
});
