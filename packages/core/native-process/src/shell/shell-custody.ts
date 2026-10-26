import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';

/** One execution's kernel lock. Only the credential-free supervisor inherits its descriptor. */
export type CustodyLock = Readonly<{
  descriptor: number;
  assertCurrent: () => Promise<void>;
  handoff: () => Promise<void>;
  release: () => Promise<void>;
}>;

/**
 * Acquire an exclusive open-description lock; the acquisition utility never receives a command to execute.
 *
 * @param input - Existing configured custody directory and an unpredictable execution identity.
 * @returns A retained descriptor, fenced locally when handed to the supervisor or released.
 */
export const acquireCustodyLock = async (
  input: Readonly<{ directory: string; executionId: string }>,
): Promise<CustodyLock> => {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u.test(input.executionId)) {
    throw new Error('Invalid shell custody execution identity.');
  }
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    throw new Error('Native shell custody locking is unavailable on this platform.');
  }
  const directory = await realpath(input.directory);
  const path = join(directory, `${input.executionId}.lock`);
  const descriptor = await open(path, constants.O_CREAT + constants.O_RDWR + constants.O_NOFOLLOW, 0o600);
  try {
    const identity = await descriptor.stat();
    if (!identity.isFile() || identity.nlink !== 1 || identity.uid !== process.getuid?.()) {
      throw new Error('Shell custody lock is not an owned regular file.');
    }
    const command = process.platform === 'linux' ? '/usr/bin/flock' : '/usr/bin/perl';
    const arguments_ =
      process.platform === 'linux'
        ? ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '3']
        : ['-e', 'open my $lock, "<&=3" or die $!; flock($lock, 6) or exit 75;'];
    // BSD flock, unlike POSIX lockf, is retained by the shared open-file description.
    // macOS must qualify this capability; an absent or failed system Perl refuses acquisition.
    const child = spawn(command, arguments_, {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- native environment names.
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      stdio: ['ignore', 'ignore', 'pipe', descriptor.fd],
    });
    const completion = Promise.withResolvers<number | undefined>();
    let diagnostics = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      diagnostics += chunk.slice(0, Math.max(0, 4096 - diagnostics.length));
    });
    child.once('error', completion.reject);
    child.once('close', (code) => {
      completion.resolve(code ?? undefined);
    });
    const acquisition = { timedOut: false };
    const timer = setTimeout(() => {
      acquisition.timedOut = true;
      child.kill('SIGKILL');
    }, 2000);
    let code: number | undefined;
    try {
      code = await completion.promise;
    } finally {
      clearTimeout(timer);
    }
    if (acquisition.timedOut) {
      throw new Error('Shell custody lock acquisition timed out.');
    }
    if (code === 75) {
      throw new Error('Shell execution is already owned.');
    }
    if (code !== 0) {
      throw new Error(`Shell custody lock acquisition failed: ${diagnostics.trim()}`);
    }
    const ownership = { current: true };
    const isCurrent = (): boolean => ownership.current;
    let closing: Promise<void> | undefined;
    const close = async (): Promise<void> => {
      ownership.current = false;
      closing ??= descriptor.close();
      await closing;
    };
    const assertCurrent = async (): Promise<void> => {
      if (!isCurrent()) {
        throw new Error('Shell custody ownership is no longer current.');
      }
      const visible = await lstat(path);
      if (!isCurrent() || !visible.isFile() || visible.dev !== identity.dev || visible.ino !== identity.ino) {
        throw new Error('Shell custody ownership is no longer current.');
      }
    };
    return { descriptor: descriptor.fd, assertCurrent, handoff: close, release: close };
  } catch (error) {
    await descriptor.close();
    throw error;
  }
};
