/**
 * Worker half of the bridge conformance suite: a filesystem authority served
 * over a port from a real `worker_threads` thread, run by Node directly (type
 * stripping), so the wire crosses an isolate boundary the way production's
 * authority worker does. Driven by `filesystem-bridge-conformance.test.ts`.
 *
 * Messages from the test thread:
 * - `{ type: 'serve', port, files }`: seed a memory provider and serve it on `port`;
 * - `{ type: 'serve-rooted', port, files, consumer }`: seed a workspace's project
 *   root and serve that root's view for `consumer` — the composition a real
 *   authority performs — on `port`;
 * - `{ type: 'external-write', path, content }`: write a root file on the
 *   authority, not through any connection, and answer `written`;
 * - `{ type: 'compute-restarted', failed }`: report a compute restart on every
 *   rooted connection's event channel, as the authority's supervisor would;
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
import type { RootedBridgeConsumer } from '#filesystem-bridge.js';
import { observeFileSystemBridgeCrossings } from '#filesystem-bridge-crossings.js';
import type { FileSystemBridgeCrossingsObserver } from '#filesystem-bridge-crossings.js';
import {
  computeEventEmitter,
  nodeGrepMatcherWorker,
  conformanceProjectRoot,
  rootedWorkspaceHandlers,
} from '#filesystem-bridge-rooted.test-fixture.js';

type ServeMessage = { readonly type: 'serve'; readonly port: MessagePort; readonly files: Record<string, string> };
type ServeRootedMessage = {
  readonly type: 'serve-rooted';
  readonly port: MessagePort;
  readonly files: Record<string, string | Uint8Array<ArrayBuffer>>;
  readonly consumer: RootedBridgeConsumer;
};
type CrossingsMessage = { readonly type: 'crossings' };
type ComputeMessage = { readonly type: 'compute-restarted'; readonly failed: readonly number[] };
type ExternalWriteMessage = { readonly type: 'external-write'; readonly path: string; readonly content: string };

let externalWrite: ((path: string, content: string) => Promise<void>) | undefined;

const compute = computeEventEmitter();
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

const serveRooted = async ({ port, files, consumer }: ServeRootedMessage): Promise<void> => {
  const { service, handlers } = await rootedWorkspaceHandlers(files, consumer);
  externalWrite = async (path, content) => service.writeFile(`${conformanceProjectRoot}/${path}`, content);
  crossings = observeFileSystemBridgeCrossings();
  const wrapped = wrapMessagePort<unknown>(port as unknown as MessagePortLike, { label: 'conformance-worker-rooted' });
  wrapped.start?.();
  serveFileSystemBridgePort(handlers, wrapped, {
    grepMatcherWorker: nodeGrepMatcherWorker,
    computeEvents: compute.source,
  });
  parentPort!.postMessage({ type: 'serving' });
};

parentPort!.on(
  'message',
  (
    message:
      | ServeMessage
      | ServeRootedMessage
      | CrossingsMessage
      | ComputeMessage
      | ExternalWriteMessage
      | FreezeMessage,
  ) => {
    if (message.type === 'serve') {
      void serve(message);
      return;
    }
    if (message.type === 'serve-rooted') {
      void serveRooted(message);
      return;
    }
    if (message.type === 'crossings') {
      parentPort!.postMessage({ type: 'crossings', crossings: [...(crossings?.snapshot() ?? new Map())] });
      return;
    }
    if (message.type === 'external-write') {
      const write = async (): Promise<void> => {
        await externalWrite!(message.path, message.content);
        parentPort!.postMessage({ type: 'written' });
      };
      // async-iife: bootstrap -- the reply is the outcome.
      void write();
      return;
    }
    if (message.type === 'compute-restarted') {
      compute.emit(message.failed);
      return;
    }
    parentPort!.postMessage({ type: 'frozen' });
    Atomics.wait(message.gate, 0, 0);
  },
);
