import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- Node-only unit test imports the directly executed driver's helper.
import { epochForRelativeMarks, observedKernelSelection, observedRuntimeWindow } from './open-to-frame-observation.ts';

let directory: string | undefined;
const execFileAsync = promisify(execFile);
afterEach(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

it('anchors relative sample marks at their actual wall-clock time', () => {
  const anchor = epochForRelativeMarks(500, 100_000, 510);
  expect(anchor + 20).toBe(100_010);
});

it('should refuse browser link-intent before waiting for a project that only desktop seeds', async () => {
  await expect(
    execFileAsync(process.execPath, [
      resolve(import.meta.dirname, 'open-to-frame.ts'),
      'browser',
      'jscad',
      '2',
      'http://127.0.0.1:3110',
      'link-intent',
    ]),
  ).rejects.toHaveProperty(
    'stderr',
    expect.stringContaining('link-intent requires the desktop host: only it seeds a project visible from Home.'),
  );
}, 15_000);

it('refuses an incomplete cold reference population before launching Chromium', async () => {
  await Promise.all(
    (
      [
        ['tray', 'webgl', '3'],
        ['unselected', 'webgl', '5'],
        ['honeycomb', 'unselected', '5'],
      ] as const
    ).map(async ([fixture, backend, count]) =>
      expect(
        execFileAsync(process.execPath, [
          resolve(import.meta.dirname, 'open-to-frame.ts'),
          'browser',
          'replicad',
          count,
          'http://127.0.0.1:3110',
          'reference-cold',
          fixture,
          backend,
        ]),
      ).rejects.toHaveProperty('stderr', expect.stringContaining('reference-cold requires browser replicad 5')),
    ),
  );
}, 15_000);

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

it('clips selected producer spans without counting nested work twice or implying a PID join', async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-otf-window-'));
  const file = join(directory, 'trace.jsonl');
  const span = (name: string, startTime: number, duration: number) => ({
    name,
    startTime,
    duration,
    epoch: 1000,
    origin: { instance: 'utility-a', label: 'utility' },
  });
  await writeFile(
    file,
    [
      { ...span('kernel.render', 0, 100), detail: { spanId: 'render-1' } },
      { ...span('kernel.select', 5, 10), detail: { parentSpanId: 'render-1', kernelId: 'jscad' } },
      span('kernel.compute', 20, 60),
      { ...span('kernel.compute', 20, 60), origin: { instance: 'utility-b', label: 'utility' } },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n'),
  );
  expect(await observedRuntimeWindow({ traceFile: file, kernelId: 'jscad', fromEpoch: 1010, toEpoch: 1070 })).toEqual({
    origin: 'utility-a',
    role: 'utility',
    spanCount: 3,
    overlappingMilliseconds: 60,
    names: { 'kernel.render': 60, 'kernel.compute': 50, 'kernel.select': 5 },
    pidJoined: false,
  });
  expect(
    await observedRuntimeWindow({ traceFile: file, kernelId: 'replicad', fromEpoch: 1010, toEpoch: 1070 }),
  ).toBeUndefined();
});

it('joins only the in-window selected utility when a later render uses another PID', async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-otf-pid-'));
  const file = join(directory, 'trace.jsonl');
  await writeFile(
    file,
    [
      {
        name: 'kernel.render',
        epoch: 1000,
        startTime: 0,
        duration: 70,
        detail: { spanId: '1' },
        origin: { label: 'utility', instance: 'pid-42-one' },
      },
      {
        name: 'kernel.select',
        epoch: 1000,
        startTime: 15,
        duration: 5,
        detail: { parentSpanId: '1', kernelId: 'jscad' },
        origin: { label: 'utility', instance: 'pid-42-one' },
      },
      {
        name: 'kernel.compute',
        epoch: 1000,
        startTime: 20,
        duration: 50,
        origin: { label: 'utility', instance: 'pid-42-one' },
      },
      {
        name: 'kernel.render',
        epoch: 1000,
        startTime: 100,
        duration: 50,
        detail: { spanId: '2' },
        origin: { label: 'utility', instance: 'pid-99-two' },
      },
      {
        name: 'kernel.select',
        epoch: 1000,
        startTime: 105,
        duration: 5,
        detail: { parentSpanId: '2', kernelId: 'jscad' },
        origin: { label: 'utility', instance: 'pid-99-two' },
      },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n'),
  );
  expect(await observedRuntimeWindow({ traceFile: file, kernelId: 'jscad', fromEpoch: 1010, toEpoch: 1060 })).toEqual({
    origin: 'pid-42-one',
    role: 'utility',
    pid: 42,
    spanCount: 3,
    overlappingMilliseconds: 50,
    names: { 'kernel.render': 50, 'kernel.compute': 40, 'kernel.select': 5 },
    pidJoined: true,
  });
  expect(
    await observedRuntimeWindow({ traceFile: file, kernelId: 'jscad', fromEpoch: 1070, toEpoch: 1090 }),
  ).toBeUndefined();
});

it('refuses a PID when two utilities select the same kernel during one action', async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-otf-ambiguous-'));
  const file = join(directory, 'trace.jsonl');
  await writeFile(
    file,
    [42, 99]
      .flatMap((pid, index) => [
        {
          name: 'kernel.render',
          epoch: 1000,
          startTime: 10 + index * 10,
          duration: 40,
          detail: { spanId: String(pid) },
          origin: { label: 'utility', instance: `pid-${String(pid)}-unique` },
        },
        {
          name: 'kernel.select',
          epoch: 1000,
          startTime: 15 + index * 10,
          duration: 5,
          detail: { parentSpanId: String(pid), kernelId: 'jscad' },
          origin: { label: 'utility', instance: `pid-${String(pid)}-unique` },
        },
      ])
      .map((row) => JSON.stringify(row))
      .join('\n'),
  );
  expect(
    await observedRuntimeWindow({ traceFile: file, kernelId: 'jscad', fromEpoch: 1000, toEpoch: 1060 }),
  ).toBeUndefined();
});
