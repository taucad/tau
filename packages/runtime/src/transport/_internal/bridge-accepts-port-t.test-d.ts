/**
 * Bridge primitives accept wire-agnostic {@link Port}, not DOM `MessagePort` only,
 * and the fs entry seams accept the WHATWG-shaped {@link MessagePortLike} (X7).
 */
import type { MessagePortLike, Port } from '@taucad/rpc';
import type { MessagePort as NodeMessagePort } from 'node:worker_threads';
import { describe, expectTypeOf, it } from 'vitest';

import type { createBridgeCall, createBridgeProxy, createBridgeServer } from '@taucad/rpc/bridge';
import type { createTransferredFileSystemBridgeProxy, FileSystemBridge } from '@taucad/fs-bridge';
import type { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { RuntimeInitializeMemoryHandle } from '#transport/runtime-transport.types.js';

describe('filesystem bridge primitive port typing', () => {
  it('createBridgeServer second parameter is Port<unknown>', () => {
    expectTypeOf<Parameters<typeof createBridgeServer>[1]>().toEqualTypeOf<Port<unknown>>();
  });

  it('createBridgeCall first parameter is Port<unknown>', () => {
    expectTypeOf<Parameters<typeof createBridgeCall>[0]>().toEqualTypeOf<Port<unknown>>();
  });

  it('createBridgeProxy first parameter is Port<unknown>', () => {
    expectTypeOf<Parameters<typeof createBridgeProxy>[0]>().toEqualTypeOf<Port<unknown>>();
  });
});

/**
 * `MessagePortLike` is intentionally `any` on listener and transfer
 * *parameters* so one type spans the DOM and Node signatures — so every
 * assertion below is about **member presence**, never parameter types.
 */
describe('filesystem entry-seam port typing (X7)', () => {
  it('declares exactly the four WHATWG port members, with start optional', () => {
    expectTypeOf<MessagePortLike>().toHaveProperty('postMessage');
    expectTypeOf<MessagePortLike>().toHaveProperty('addEventListener');
    expectTypeOf<MessagePortLike>().toHaveProperty('removeEventListener');
    expectTypeOf<MessagePortLike>().toHaveProperty('close');
    expectTypeOf<MessagePortLike['start']>().toEqualTypeOf<(() => void) | undefined>();
  });

  it('accepts a DOM MessagePort and a node:worker_threads MessagePort', () => {
    expectTypeOf<MessagePort>().toExtend<MessagePortLike>();
    expectTypeOf<NodeMessagePort>().toExtend<MessagePortLike>();
  });

  it('rejects an object missing close', () => {
    expectTypeOf<{
      postMessage: (data: unknown) => void;
      addEventListener: (type: 'message', listener: unknown) => void;
      removeEventListener: (type: 'message', listener: unknown) => void;
    }>().not.toExtend<MessagePortLike>();
  });

  it('widens the fs entry helpers and the initialize handle to MessagePortLike', () => {
    expectTypeOf<Parameters<typeof createTransferredFileSystemBridgeProxy>[0]>().toEqualTypeOf<MessagePortLike>();
    expectTypeOf<RuntimeInitializeMemoryHandle['fileSystemPort']>().toEqualTypeOf<MessagePortLike | undefined>();
  });
});
