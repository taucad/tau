// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createFakeShellProvider } from '#shell/shell-fake.js';
import type { FakeShellProvider } from '#shell/shell-fake.js';
import type { ShellLaunch } from '#shell/shell-provider.js';

const unprepared = (overrides: Partial<ShellLaunch> = {}): ShellLaunch => ({
  executionId: 'unprepared',
  executablePath: '/bin/bash',
  arguments: ['-c', 'true'],
  workingDirectory: '/srv',
  commandId: 'fake#1',
  filesystem: { readable: [], writable: [], denied: [] },
  network: { domains: [] },
  environment: {},
  stdio: { kind: 'pipes' },
  signal: new AbortController().signal,
  ...overrides,
});

/* Bound per test to the provider under test: every launch is prepared first, as a host's is. */
let current: FakeShellProvider | undefined;
const launch = async (overrides: Partial<ShellLaunch> = {}): Promise<ShellLaunch> => {
  const { executionId } = await current!.prepare({ privateRoot: '/nonexistent/tau-shell-fake', resource: undefined });
  return unprepared({ executionId, ...overrides });
};
const fake = (...parameters: Parameters<typeof createFakeShellProvider>): FakeShellProvider => {
  current = createFakeShellProvider(...parameters);
  return current;
};

describe('createFakeShellProvider', () => {
  it('should record each launch and replay the scripted outcome', async () => {
    const provider = fake(() => ({ status: 'sandbox-unavailable', message: 'missing' }));

    expect(await provider.launch(await launch())).toStrictEqual({ status: 'sandbox-unavailable', message: 'missing' });
    expect(provider.launches).toHaveLength(1);
  });

  it('should stream scripted output and exit', async () => {
    const provider = fake(() => ({ status: 'started', stdout: 'hi', exit: { exitCode: 0 } }));
    const outcome = await provider.launch(await launch());
    if (outcome.status !== 'started' || outcome.process.kind !== 'pipes') {
      throw new Error('expected pipes');
    }
    const chunks: string[] = [];
    for await (const chunk of outcome.process.stdout) {
      chunks.push(new TextDecoder().decode(chunk));
    }

    expect({ chunks, exit: await outcome.process.exited }).toStrictEqual({ chunks: ['hi'], exit: { exitCode: 0 } });
  });

  it('should run an unscripted exit until aborted and record terminal input', async () => {
    const controller = new AbortController();
    const provider = fake(() => ({ status: 'started' }));
    const outcome = await provider.launch(
      await launch({ stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } }, signal: controller.signal }),
    );
    if (outcome.status !== 'started' || outcome.process.kind !== 'terminal') {
      throw new Error('expected a terminal');
    }
    outcome.process.write(new Uint8Array([104]));
    outcome.process.resize({ columns: 100, rows: 30 });
    controller.abort();

    expect({
      exit: await outcome.process.exited,
      written: provider.written,
      resized: provider.resized,
    }).toStrictEqual({
      exit: { signal: 'SIGKILL' },
      written: [[new Uint8Array([104])]],
      resized: [[{ columns: 100, rows: 30 }]],
    });
  });

  it('should reject settlement for scripted uncertain cleanup', async () => {
    const provider = fake(() => ({
      status: 'started',
      stdout: 'partial',
      exit: { exitCode: 0 },
      cleanup: 'uncertain',
    }));
    const outcome = await provider.launch(await launch());
    if (outcome.status !== 'started') {
      throw new Error('expected a started launch');
    }

    await expect(outcome.process.exited).rejects.toThrow('survived');
  });

  it('should refuse a launch it did not prepare, before running anything', async () => {
    const provider = fake(() => ({ status: 'started', exit: { exitCode: 0 } }));

    expect(await provider.launch(unprepared())).toMatchObject({ status: 'sandbox-unavailable' });
    expect(provider.launches).toHaveLength(0);
  });

  it('should hold custody until a confirmed stop is claimed and the private root is gone', async () => {
    const privateRoot = await mkdtemp(join(tmpdir(), 'tau-shell-'));
    try {
      const provider = fake(() => ({ status: 'started' }));
      const { executionId } = await provider.prepare({ privateRoot, resource: { key: 'agent:run', root: '/srv' } });
      const outcome = await provider.launch(unprepared({ executionId }));
      if (outcome.status !== 'started') {
        throw new Error('expected a started launch');
      }

      expect(await provider.recover({ executionIds: [executionId] })).toMatchObject([{ status: 'blocked' }]);
      await outcome.process.terminate();
      expect(await provider.recover({ executionIds: [executionId] })).toMatchObject([{ status: 'stopped' }]);
      await expect(provider.release({ executionId })).rejects.toThrow('private root');
      await rm(privateRoot, { recursive: true });
      await provider.release({ executionId });
      expect(await provider.inventory()).toEqual([]);
      expect(provider.released).toEqual([executionId]);
    } finally {
      await rm(privateRoot, { recursive: true, force: true });
    }
  });

  it('should never claim an uncertain cleanup stopped', async () => {
    const provider = fake(() => ({ status: 'started', exit: { exitCode: 0 }, cleanup: 'uncertain' }));
    const prepared = await launch();
    const outcome = await provider.launch(prepared);
    if (outcome.status !== 'started') {
      throw new Error('expected a started launch');
    }
    await expect(outcome.process.exited).rejects.toThrow('survived');

    expect(await provider.recover({ executionIds: [prepared.executionId] })).toMatchObject([{ status: 'blocked' }]);
  });
});
