/**
 * A direct session with `tau-windows-sandbox.exe launch`, for the WIN-X64 conformance rows that test the helper's own
 * contract beneath the shell provider (NW01, native workers). It speaks the framed protocol with the provider's codec
 * and interprets nothing: every helper frame is kept in order, stdout is kept as text, and the helper's stderr goes to
 * the caller's diagnostic log line by line.
 */
import { spawn } from 'node:child_process';

import {
  createWindowsFrameDecoder,
  decodeWindowsHelperFrame,
  encodeWindowsHostFrame,
} from '#shell/windows-sandbox-protocol.js';
import type { WindowsHelperFrame, WindowsHostFrame } from '#shell/windows-sandbox-protocol.js';

/** One `launch` process and what it has said so far. */
export type WindowsHelperSession = Readonly<{
  /** Write one host frame to the helper's stdin. */
  send: (frame: WindowsHostFrame) => void;
  /** The first frame, in arrival order, that `accept` takes; rejects when the helper ends first or time runs out. */
  frame: (accept: (frame: WindowsHelperFrame) => boolean, milliseconds: number) => Promise<WindowsHelperFrame>;
  /** Every frame so far. */
  frames: () => readonly WindowsHelperFrame[];
  /** The child's stdout so far, as UTF-8 text. */
  stdout: () => string;
  /** Close the helper's stdin, which the protocol reads as `terminate`. */
  end: () => void;
  /** Kill the launcher outright, as a crash would: its job takes the runner and the child, and its journal stays. */
  kill: () => void;
  /** Settles with the helper's exit code (`undefined` when a signal ended it) once it and its stdout have ended. */
  closed: Promise<number | undefined>;
}>;

/**
 * Start `launch` and keep its frames.
 *
 * @param helperPath - The installed helper.
 * @param diagnostic - Receives each line of the helper's stderr.
 * @returns The session.
 */
export const openWindowsHelperSession = (
  helperPath: string,
  diagnostic: (line: string) => void,
): WindowsHelperSession => {
  const child = spawn(helperPath, ['launch'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const decoder = createWindowsFrameDecoder();
  const received: WindowsHelperFrame[] = [];
  const text = new TextDecoder();
  let output = '';
  let ended = false;
  let failure: Error | undefined;
  /* Settles at the next change (a frame, a decode failure or the end) and is then replaced. */
  let change = Promise.withResolvers<void>();
  const wake = (): void => {
    change.resolve();
    change = Promise.withResolvers<void>();
  };
  child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    try {
      for (const raw of decoder.push(new Uint8Array(chunk))) {
        const frame = decodeWindowsHelperFrame(raw);
        received.push(frame);
        if (frame.type === 'stdout') {
          output += text.decode(frame.bytes, { stream: true });
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    wake();
  });
  let pendingLine = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    const lines = (pendingLine + chunk).split(/\r?\n/u);
    pendingLine = lines.pop() ?? '';
    for (const line of lines) {
      diagnostic(line);
    }
  });
  const closed = new Promise<number | undefined>((resolve) => {
    child.on('close', (code) => {
      ended = true;
      if (pendingLine !== '') {
        diagnostic(pendingLine);
      }
      wake();
      resolve(code ?? undefined);
    });
  });
  child.stdin.on('error', () => {
    /* The helper may end first; its frames say why. */
  });
  return {
    send: (frame) => {
      child.stdin.write(encodeWindowsHostFrame(frame));
    },
    frame: async (accept, milliseconds) => {
      const deadline = Date.now() + milliseconds;
      for (;;) {
        const found = received.find((frame) => accept(frame));
        if (found !== undefined) {
          return found;
        }
        if (failure !== undefined) {
          throw failure;
        }
        if (ended) {
          throw new Error(`the helper ended without the awaited frame; it sent ${JSON.stringify(summary(received))}`);
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error(
            `no awaited frame within ${String(milliseconds)} ms; got ${JSON.stringify(summary(received))}`,
          );
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        // oxlint-disable-next-line no-await-in-loop -- each pass waits for the next frame or the deadline.
        await Promise.race([
          change.promise,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, remaining);
          }),
        ]);
        clearTimeout(timer);
      }
    },
    frames: () => received,
    stdout: () => output,
    end: () => {
      child.stdin.end();
    },
    kill: () => {
      child.kill('SIGKILL');
    },
    closed,
  };
};

/** Frames without their bytes, for a failure message. */
const summary = (frames: readonly WindowsHelperFrame[]): unknown[] =>
  frames.map((frame) =>
    frame.type === 'stdout' || frame.type === 'stderr' || frame.type === 'output'
      ? { type: frame.type, text: new TextDecoder().decode(frame.bytes) }
      : frame,
  );
