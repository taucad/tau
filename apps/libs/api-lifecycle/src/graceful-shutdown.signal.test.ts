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

  it('should cut what is still running when the stop signal repeats, then settle and exit before Fly kills the Machine', async () => {
    const started = await start();
    child = started.child;
    // Outlives the fixture's 5 s cut: only the repeated signal can end it early.
    const response = fetch(`${started.url}/slow?ms=20000`);
    await vi.waitFor(() => {
      expect(child!.lines).toContain('request entered');
    });

    child.process.kill('SIGTERM');
    await setTimeout(1000);
    const repeatedAt = Date.now();
    child.process.kill('SIGTERM');

    await expect(response).rejects.toThrow('fetch failed');
    await expect(child.exited).resolves.toEqual({ code: undefined, signal: 'SIGTERM' });
    // Fly sends the repeat when kill_timeout runs out and kills the VM 5 s later.
    expect(Date.now() - repeatedAt).toBeLessThan(4000);
    expect(child.lines).not.toContain('request finished');
    expect(child.lines.slice(child.lines.indexOf('log: Shutdown started'))).toEqual([
      'log: Shutdown started',
      'warn: Shutdown signal repeated during the drain; cutting now',
      'warn: Shutdown drained with cuts; closing modules',
      'database closed',
      'log: Shutdown complete',
    ]);
  }, 60_000);
});
