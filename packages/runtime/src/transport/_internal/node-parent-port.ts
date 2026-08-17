/**
 * Acquire the worker-side `Port<unknown>` from `node:worker_threads`'s
 * `parentPort`. Used by **`nodeWorkerHost()`** to wire its
 * `ChannelServer` against the parent thread's wire without the
 * consumer having to thread a `MessagePort` through transport options.
 *
 * @internal
 */

import { parentPort } from 'node:worker_threads';
import type { Transferable as NodeTransferable } from 'node:worker_threads';
import { Topic } from '@taucad/events';
import type { Port } from '@taucad/rpc';

export const acquireNodeParentPort = (): Port<unknown> => {
  if (!parentPort) {
    throw new Error(
      'nodeWorkerHost(): `parentPort` unavailable — must be called from a `node:worker_threads.Worker` script',
    );
  }
  const port = parentPort;
  const messages = new Topic<unknown>({ name: 'node-parent-port' });
  const listener = (data: unknown): void => {
    messages.emit(data);
  };
  let listening = false;
  return {
    postMessage(message, transferables) {
      const transfer = (transferables ?? []) as NodeTransferable[];
      port.postMessage(message, transfer.length > 0 ? transfer : undefined);
    },
    onMessage(handler) {
      if (!listening) {
        listening = true;
        port.on('message', listener);
      }
      const unsubscribe = messages.subscribe(handler);
      return () => {
        unsubscribe();
        if (messages.size === 0 && listening) {
          listening = false;
          port.off('message', listener);
        }
      };
    },
    close() {
      if (listening) {
        port.off('message', listener);
      }
      listening = false;
      messages.dispose();
    },
  };
};
