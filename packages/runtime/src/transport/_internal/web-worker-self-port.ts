/**
 * Acquire the worker-side `Port<unknown>` from the global scope of a
 * dedicated browser `Worker`. Used by **`webWorkerHost()`** to
 * wire its `ChannelServer` against the parent thread's wire without
 * the consumer having to thread a `MessagePort` through transport
 * options.
 *
 * @internal
 */

import { Topic } from '@taucad/events';
import type { Port } from '@taucad/rpc';

export const acquireWebWorkerSelfPort = (): Port<unknown> => {
  const messages = new Topic<unknown>({ name: 'web-worker-self-port' });
  const listener = ((event: MessageEvent<unknown>): void => {
    messages.emit(event.data);
  }) as EventListener;
  let listening = false;
  return {
    postMessage(message, transferables) {
      const transfer = (transferables ?? []) as Transferable[];
      // oxlint-disable-next-line no-restricted-globals -- inside the worker `self === globalThis` and is the parent-thread wire
      (
        globalThis as unknown as { postMessage(value: unknown, options?: { transfer?: Transferable[] }): void }
      ).postMessage(message, transfer.length > 0 ? { transfer } : undefined);
    },
    onMessage(handler) {
      if (!listening) {
        listening = true;
        globalThis.addEventListener('message', listener);
      }
      const unsubscribe = messages.subscribe(handler);
      return () => {
        unsubscribe();
        if (messages.size === 0 && listening) {
          listening = false;
          globalThis.removeEventListener('message', listener);
        }
      };
    },
    close() {
      if (listening) {
        globalThis.removeEventListener('message', listener);
      }
      listening = false;
      messages.dispose();
    },
  };
};
