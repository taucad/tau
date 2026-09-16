import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

const fixture = resolve(import.meta.dirname, 'fixtures/parameter-set-close.ts');

it('should settle delayed and uncertain parameter writes before a real child process closes', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', fixture], {
    cwd: resolve(import.meta.dirname, '../../..'),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const output: string[] = [];
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => output.push(chunk));
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => output.push(chunk));

  try {
    const message = Promise.withResolvers<unknown>();
    const exited =
      Promise.withResolvers<Readonly<{ exitCode: number | undefined; signal: NodeJS.Signals | undefined }>>();
    child.once('message', (report: unknown) => {
      message.resolve(report);
    });
    child.once('exit', (exitCode, signal) => {
      exited.resolve({ exitCode: exitCode ?? undefined, signal: signal ?? undefined });
    });
    child.once('error', (error) => {
      message.reject(error);
      exited.reject(error);
    });
    const [report] = await Promise.race([
      (async () => [await message.promise] as const)(),
      (async () => {
        const { exitCode, signal } = await exited.promise;
        throw new Error(`Parameter close fixture exited before reporting (${String(exitCode)}, ${String(signal)}).`);
      })(),
    ]);
    const { exitCode, signal } = await exited.promise;
    expect({ report, exitCode, signal }, output.join('')).toEqual({
      report: {
        ok: true,
        delayed: ['write-admitted', 'close-waited', 'invalid-drafts-rejected', 'close-retried'],
        uncertain: ['reply-lost', 'close-waited', 'write-reconciled', 'close-settled'],
      },
      exitCode: 0,
      signal: undefined,
    });
  } finally {
    child.kill('SIGKILL');
  }
});
