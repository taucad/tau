import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const libraryRoot = path.resolve(import.meta.dirname, '..');
const fixture = path.join(import.meta.dirname, 'graceful-shutdown.signal-fixture.ts');

type Exit = { readonly code: number | undefined; readonly signal: NodeJS.Signals | undefined };

type Child = {
  readonly process: ChildProcess;
  readonly lines: string[];
  readonly exited: Promise<Exit>;
};

const start = async (): Promise<{ child: Child; url: string }> => {
  const childEnvironment: Record<string, string | undefined> = {
    ...(process.env as Record<string, string | undefined>),
    // The tsx loader does not find the decorator settings on its own; the library config carries them.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment key
    TSX_TSCONFIG_PATH: path.join(libraryRoot, 'tsconfig.lib.json'),
  };
  const spawned: ChildProcess = spawn(process.execPath, ['--import', 'tsx', fixture], {
    cwd: libraryRoot,
    env: childEnvironment as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const lines: string[] = [];
  spawned.stdout?.setEncoding('utf8');
  spawned.stdout?.on('data', (chunk: string) => {
    lines.push(...chunk.split('\n').filter(Boolean));
  });
  const exited = new Promise<Exit>((resolve) => {
    spawned.once('exit', (code: number | undefined, signal: NodeJS.Signals | undefined) => {
      resolve({ code: code ?? undefined, signal: signal ?? undefined });
    });
  });
  const child = { process: spawned, lines, exited };
  const url = await vi.waitFor(
    () => {
      const listening = lines.find((line) => line.startsWith('listening '));
      expect(listening).toBeDefined();
      return listening!.slice('listening '.length);
    },
    { timeout: 30_000, interval: 50 },
  );
  return { child, url };
};

describe('closeGracefullyOnSignal', () => {
  let child: Child | undefined;

  afterEach(() => {
    child?.process.kill('SIGKILL');
    child = undefined;
  });

  it('should drain on SIGTERM, close modules after the request, and exit by the re-raised signal', async () => {
    const started = await start();
    child = started.child;
    const response = fetch(`${started.url}/slow`);
    await vi.waitFor(() => {
      expect(child!.lines).toContain('request entered');
    });

    child.process.kill('SIGTERM');

    const answered = await response;
    await expect(answered.json()).resolves.toEqual({ ok: true });
    await expect(child.exited).resolves.toEqual({ code: undefined, signal: 'SIGTERM' });
    expect(child.lines.slice(child.lines.indexOf('request finished'))).toEqual([
      'request finished',
      'log: Shutdown drained; closing modules',
      'database closed',
      'log: Shutdown complete',
    ]);
  }, 60_000);

  it('should log and ignore a second signal during the drain and exit only after the request', async () => {
    const started = await start();
    child = started.child;
    // Outlasts the second signal by seconds, however loaded the machine, and ends before the fixture's 5 s cut.
    const response = fetch(`${started.url}/slow?ms=4000`);
    await vi.waitFor(() => {
      expect(child!.lines).toContain('request entered');
    });

    child.process.kill('SIGTERM');
    await setTimeout(1000);
    child.process.kill('SIGTERM');

    const answered = await response;
    await expect(answered.json()).resolves.toEqual({ ok: true });
    await expect(child.exited).resolves.toEqual({ code: undefined, signal: 'SIGTERM' });
    expect(child.lines.slice(child.lines.indexOf('log: Shutdown started'))).toEqual([
      'log: Shutdown started',
      'warn: Shutdown signal repeated during the drain; ignored',
      'request finished',
      'log: Shutdown drained; closing modules',
      'database closed',
      'log: Shutdown complete',
    ]);
  }, 60_000);
});
