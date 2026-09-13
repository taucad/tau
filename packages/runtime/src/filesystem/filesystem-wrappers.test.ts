/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { wrapMessagePort } from '@taucad/rpc';
import type { Port } from '@taucad/rpc';
import { _fromMemoryFsHandle as fromMemoryFS } from '#transport/_internal/from-memory-fs-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import { createBridgeProxy } from '#transport/_internal/runtime-filesystem-bridge.js';
import { workerReadyMessageType } from '#framework/runtime-framework.constants.js';
import { exposeFileSystem, createFileSystemBridge, waitForWorkerReady } from '#filesystem/filesystem-bridge.js';

/**
 * Unwrap the discriminated `inline` `RuntimeFileSystemHandle` so the
 * `exposeFileSystem` wrapper below receives the bare `RuntimeFileSystemBase`
 * contract it exposes over the bridge.
 */
function makeFs(files?: Record<string, string>): RuntimeFileSystemBase {
  const handle = fromMemoryFS(files);
  if (handle.kind !== 'inline') {
    throw new Error('fromMemoryFS() must return the inline-kind handle.');
  }
  return handle.create();
}

function fsBridgePort(port: MessagePort, label: string): Port<unknown> {
  const wrapped = wrapMessagePort<unknown>(port, { label });
  if (wrapped.start !== undefined) {
    wrapped.start();
  }
  return wrapped;
}

describe('filesystem high-level wrappers', () => {
  describe('exposeFileSystem', () => {
    let activeHandle: ReturnType<typeof exposeFileSystem> | undefined;

    afterEach(() => {
      activeHandle?.cleanup();
      activeHandle = undefined;
    });

    it('should serve a filesystem when receiving a bridge message', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/hello.txt': 'world' });

      activeHandle = exposeFileSystem(fs);

      const channel = new MessageChannel();
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      self.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'connect', port: channel.port1 },
        }),
      );

      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });

      const content = await proxy.readFile('/hello.txt', 'utf8');
      expect(content).toBe('world');
    });

    it('should buffer messages sent before server is wired (catchMessages)', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/early.txt': 'buffered' });

      const channel = new MessageChannel();
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      // Send a request BEFORE exposeFileSystem processes the connect message.
      // The proxy sends immediately on port2; port1 isn't served yet.
      const resultPromise = proxy.readFile('/early.txt', 'utf8');

      activeHandle = exposeFileSystem(fs);

      self.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'connect', port: channel.port1 },
        }),
      );

      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });

      const content = await resultPromise;
      expect(content).toBe('buffered');
    });

    it('should stop listening after cleanup is called', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/test.txt': 'data' });
      activeHandle = exposeFileSystem(fs);
      activeHandle.cleanup();

      const channel = new MessageChannel();
      // Post a message after cleanup -- no server should be set up
      self.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'connect', port: channel.port1 },
        }),
      );

      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });

      // Port1 should have no onmessage handler, so proxy calls will hang
      // We verify by checking port1.onmessage is null
      expect(channel.port1.onmessage).toBeNull();
    });

    it('should support custom messageType', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/custom.txt': 'custom' });
      activeHandle = exposeFileSystem(fs, { messageType: 'myBridge' });

      const channel = new MessageChannel();

      // Default type should be ignored
      self.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'connect', port: channel.port1 },
        }),
      );

      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });

      expect(channel.port1.onmessage).toBeNull();

      // Custom type should work
      const channel2 = new MessageChannel();
      const proxy2 = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel2.port2, 'fs-bridge-client'));

      self.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'myBridge', port: channel2.port1 },
        }),
      );

      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });

      const content = await proxy2.readFile('/custom.txt', 'utf8');
      expect(content).toBe('custom');
    });
  });

  describe('waitForWorkerReady', () => {
    it('should resolve when worker posts the ready message', async () => {
      const worker = new EventTarget() as unknown as Worker;
      const ready = waitForWorkerReady(worker);

      worker.dispatchEvent(new MessageEvent('message', { data: { type: workerReadyMessageType } }));

      await expect(ready).resolves.toBeUndefined();
    });

    it('should not resolve for unrelated messages', async () => {
      const worker = new EventTarget() as unknown as Worker;
      const ready = waitForWorkerReady(worker);
      const notYet = Symbol('not-yet');

      worker.dispatchEvent(new MessageEvent('message', { data: { type: 'other' } }));

      const raceResult = await Promise.race([ready, Promise.resolve(notYet)]);
      expect(raceResult).toBe(notYet);

      worker.dispatchEvent(new MessageEvent('message', { data: { type: workerReadyMessageType } }));
      await ready;
    });

    it('should reject when signal is aborted before ready', async () => {
      const worker = new EventTarget() as unknown as Worker;
      const controller = new AbortController();

      const ready = waitForWorkerReady(worker, controller.signal);
      controller.abort();

      await expect(ready).rejects.toThrow();
    });

    it('should clean up listener after resolving', async () => {
      const worker = new EventTarget() as unknown as Worker;
      const removeSpy = vi.spyOn(worker, 'removeEventListener');

      const ready = waitForWorkerReady(worker);

      worker.dispatchEvent(new MessageEvent('message', { data: { type: workerReadyMessageType } }));

      await ready;
      expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
      removeSpy.mockRestore();
    });
  });

  describe('createFileSystemBridge', () => {
    it('should post a message with port to the worker', () => {
      const postMessageSpy = vi.fn();
      const mockWorker = mock<Worker>({ postMessage: postMessageSpy });

      const { port } = createFileSystemBridge(mockWorker);

      expect(port.postMessage).toBeTypeOf('function');
      expect(port.onMessage).toBeTypeOf('function');
      expect(postMessageSpy).toHaveBeenCalledOnce();

      const [message, transferables] = postMessageSpy.mock.calls[0] as [
        { type: string; port: MessagePort },
        MessagePort[],
      ];
      expect(message.type).toBe('connect');
      expect(message.port).toBeInstanceOf(MessagePort);
      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBe(message.port);
    });

    it('should support custom messageType', () => {
      const postMessageSpy = vi.fn();
      const mockWorker = mock<Worker>({ postMessage: postMessageSpy });

      createFileSystemBridge(mockWorker, { messageType: 'customBridge' });

      const [message] = postMessageSpy.mock.calls[0] as [{ type: string; port: MessagePort }];
      expect(message.type).toBe('customBridge');
    });

    it('should return a different port than the one transferred', () => {
      const postMessageSpy = vi.fn();
      const mockWorker = mock<Worker>({ postMessage: postMessageSpy });

      const { port: returnedPort } = createFileSystemBridge(mockWorker);

      const [message] = postMessageSpy.mock.calls[0] as [{ type: string; port: MessagePort }];
      expect(returnedPort).not.toBe(message.port);
    });

    it('should close consumer port on dispose', () => {
      const postMessageSpy = vi.fn();
      const mockWorker = mock<Worker>({ postMessage: postMessageSpy });

      const handle = createFileSystemBridge(mockWorker);
      expect(handle.port.onMessage).toBeTypeOf('function');

      expect(() => {
        handle.dispose();
      }).not.toThrow();
    });
  });
});
