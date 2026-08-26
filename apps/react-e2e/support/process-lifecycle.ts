/* oxlint-disable no-await-in-loop -- Readiness polling is intentionally sequential. */
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const exitBefore = async (child: ChildProcess, milliseconds: number): Promise<boolean> => {
  const exited = async (): Promise<boolean> => {
    await once(child, 'exit');
    return true;
  };
  const timedOut = async (): Promise<boolean> => {
    await delay(milliseconds);
    return false;
  };
  return Promise.race([exited(), timedOut()]);
};

export const captureProcessOutput = (child: ChildProcess, output: string[]): void => {
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => output.push(chunk));
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => output.push(chunk));
};

export const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const send = (signal: NodeJS.Signals): boolean => {
    try {
      if (process.platform !== 'win32' && child.pid) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error;
      }
      return false;
    }
  };
  if (!send('SIGTERM')) {
    return;
  }
  if (!(await exitBefore(child, 5000)) && send('SIGKILL')) {
    await exitBefore(child, 5000);
  }
};

export const waitForEndpoint = async (options: {
  readonly child: ChildProcess;
  readonly output: readonly string[];
  readonly url: string;
}): Promise<void> => {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (options.child.exitCode !== null) {
      throw new Error(
        `Process exited with code ${options.child.exitCode} before ${options.url} was ready.\n${options.output.join('')}`,
      );
    }
    try {
      const response = await fetch(options.url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling while the process starts.
    }
    await delay(250);
  }
  throw new Error(`Process did not become ready at ${options.url}.\n${options.output.join('')}`);
};
