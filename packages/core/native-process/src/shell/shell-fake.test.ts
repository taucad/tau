// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createFakeShellProvider } from '#shell/shell-fake.js';
import type { ShellLaunch } from '#shell/shell-provider.js';

const launch = (overrides: Partial<ShellLaunch> = {}): ShellLaunch => ({
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

describe('createFakeShellProvider', () => {
  it('should record each launch and replay the scripted outcome', async () => {
    const provider = createFakeShellProvider(() => ({ status: 'sandbox-unavailable', message: 'missing' }));

    expect(await provider.launch(launch())).toStrictEqual({ status: 'sandbox-unavailable', message: 'missing' });
    expect(provider.launches).toHaveLength(1);
  });

  it('should stream scripted output and exit', async () => {
    const provider = createFakeShellProvider(() => ({ status: 'started', stdout: 'hi', exit: { exitCode: 0 } }));
    const outcome = await provider.launch(launch());
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
    const provider = createFakeShellProvider(() => ({ status: 'started' }));
    const outcome = await provider.launch(
      launch({ stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } }, signal: controller.signal }),
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
    const provider = createFakeShellProvider(() => ({
      status: 'started',
      stdout: 'partial',
      exit: { exitCode: 0 },
      cleanup: 'uncertain',
    }));
    const outcome = await provider.launch(launch());
    if (outcome.status !== 'started') {
      throw new Error('expected a started launch');
    }

    await expect(outcome.process.exited).rejects.toThrow('survived');
  });
});
