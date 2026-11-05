/**
 * Worker half of the bridge conformance suite: a filesystem authority served
 * over a port from a real `worker_threads` thread, run by Node directly (type
 * stripping), so the wire crosses an isolate boundary the way production's
 * authority worker does. Driven by `filesystem-bridge-conformance.test.ts`.
 *
 * Messages from the test thread:
 * - `{ type: 'serve', port, files }`: seed a memory provider and serve it on `port`;
 * - `{ type: 'crossings' }`: answer the host side's I2 crossings since `serve`;
 * - `{ type: 'freeze', gate }`: block this thread until `gate[0]` is notified,
 *   the way a wedged authority stops answering without closing its ports.
 */
import { parentPort } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { wrapMessagePort } from '@taucad/rpc';
import type { MessagePortLike } from '@taucad/rpc';
import { serveFileSystemBridgePort } from '#filesystem-bridge.js';
import { observeFileSystemBridgeCrossings } from '#filesystem-bridge-crossings.js';
import type { FileSystemBridgeCrossingsObserver } from '#filesystem-bridge-crossings.js';

type ServeMessage = { readonly type: 'serve'; readonly port: MessagePort; readonly files: Record<string, string> };
type CrossingsMessage = { readonly type: 'crossings' };
type FreezeMessage = { readonly type: 'freeze'; readonly gate: Int32Array<SharedArrayBuffer> };

let crossings: FileSystemBridgeCrossingsObserver | undefined;

const serve = async ({ port, files }: ServeMessage): Promise<void> => {
  const provider = new MemoryProvider();
  await Promise.all(Object.entries(files).map(async ([path, content]) => provider.writeFile(path, content)));
  crossings = observeFileSystemBridgeCrossings();
  const wrapped = wrapMessagePort<unknown>(port as unknown as MessagePortLike, { label: 'conformance-worker-host' });
  wrapped.start?.();
  serveFileSystemBridgePort(provider, wrapped);
  parentPort!.postMessage({ type: 'serving' });
};

parentPort!.on('message', (message: ServeMessage | CrossingsMessage | FreezeMessage) => {
  if (message.type === 'serve') {
    void serve(message);
    return;
  }
  if (message.type === 'crossings') {
    parentPort!.postMessage({ type: 'crossings', crossings: [...(crossings?.snapshot() ?? new Map())] });
    return;
  }
  parentPort!.postMessage({ type: 'frozen' });
  Atomics.wait(message.gate, 0, 0);
});
