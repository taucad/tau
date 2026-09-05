import { WebSocket } from 'ws';
import type { RawData } from 'ws';

/** Milliseconds. */
const socketCloseGrace = 1000;
const defaultQueuedBytesLimit = 16 * 1024 * 1024;

/** A queued WebSocket message whose boundary must be preserved. */
type QueuedFrame = {
  readonly data: RawData;
  readonly isBinary: boolean;
  readonly bytes: number;
};

/** Final reason an opaque frame splice closed. @public */
export type FrameSpliceCloseResult =
  | { readonly cause: 'requested' }
  | { readonly cause: 'peer-closed'; readonly code: number; readonly reason: string }
  | { readonly cause: 'wire-failure'; readonly error: Error }
  | { readonly cause: 'queue-limit' };

/** Lifecycle handle for an opaque frame splice. @public */
export type FrameSpliceHandle = {
  readonly closed: Promise<FrameSpliceCloseResult>;
  close(): void;
};

const byteLengthOf = (data: RawData): number => {
  if (Array.isArray(data)) {
    return data.reduce((total, part) => total + part.byteLength, 0);
  }
  return data.byteLength;
};

const closeSocket = (socket: WebSocket, code = 1000, reason = 'relay closed'): void => {
  if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
    return;
  }
  socket.close(code, reason);
  const closeTimer = setTimeout(() => {
    if (socket.readyState !== WebSocket.CLOSED) {
      socket.terminate();
    }
  }, socketCloseGrace);
  closeTimer.unref();
};

const mirrorableCloseCode = (code: number): number =>
  code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 && code !== 1015 ? code : 1001;

/**
 * Splice two `ws` sockets without converting them to byte streams.
 * Every WebSocket message remains one message, including under backpressure.
 *
 * @internal
 * @param left - First socket.
 * @param right - Second socket.
 * @param queuedBytesLimit - Maximum queued bytes before both routes close.
 * @returns A closeable lifecycle handle.
 */
export const spliceFrameSockets = (
  left: WebSocket,
  right: WebSocket,
  queuedBytesLimit = defaultQueuedBytesLimit,
): FrameSpliceHandle => {
  const result = Promise.withResolvers<FrameSpliceCloseResult>();
  let isClosed = false;

  const finish = (closeResult: FrameSpliceCloseResult): void => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    if (closeResult.cause === 'peer-closed') {
      const code = mirrorableCloseCode(closeResult.code);
      closeSocket(left, code, closeResult.reason);
      closeSocket(right, code, closeResult.reason);
    } else {
      closeSocket(left);
      closeSocket(right);
    }
    result.resolve(closeResult);
  };

  const forward = (source: WebSocket, destination: WebSocket): void => {
    const queue: QueuedFrame[] = [];
    let queuedBytes = 0;
    let isSending = false;

    const pump = (): void => {
      if (isClosed || isSending || destination.readyState !== WebSocket.OPEN) {
        return;
      }
      const frame = queue.shift();
      if (!frame) {
        source.resume();
        return;
      }
      isSending = true;
      destination.send(frame.data, { binary: frame.isBinary }, (error) => {
        isSending = false;
        queuedBytes -= frame.bytes;
        if (error) {
          finish({ cause: 'wire-failure', error });
          return;
        }
        pump();
      });
    };

    source.on('message', (data, isBinary) => {
      if (isClosed) {
        return;
      }
      const bytes = byteLengthOf(data);
      if (queuedBytes + bytes > queuedBytesLimit) {
        finish({ cause: 'queue-limit' });
        return;
      }
      queue.push({ data, isBinary, bytes });
      queuedBytes += bytes;
      source.pause();
      pump();
    });
    destination.on('open', pump);
  };

  for (const socket of [left, right]) {
    socket.on('close', (code, reason) => {
      finish({ cause: 'peer-closed', code, reason: reason.toString() });
    });
    socket.on('error', (error) => {
      finish({ cause: 'wire-failure', error });
    });
  }
  forward(left, right);
  forward(right, left);

  return {
    closed: result.promise,
    close(): void {
      finish({ cause: 'requested' });
    },
  };
};
