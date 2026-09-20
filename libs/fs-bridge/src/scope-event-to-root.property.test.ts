import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { ChangeEventBus } from '@taucad/filesystem';
import type { ChangeEvent } from '@taucad/types';
import { fileSystemBridgeProtocolVersion, filesystemBridgeConnectMessageType } from '@taucad/fs-bridge';
import { exposeFileSystemForTesting as exposeFileSystem } from '#filesystem-bridge.js';

const root = '/projects/alpha';
const segment = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._-'), { minLength: 1, maxLength: 12 })
  .map((characters) => characters.join(''));
const relativePath = fc.array(segment, { minLength: 1, maxLength: 5 }).map((segments) => segments.join('/'));

describe('scopeEventToRoot', () => {
  let messageHandlers: Array<(event: MessageEvent) => void>;
  const disposers: Array<() => void> = [];

  beforeEach(() => {
    messageHandlers = [];
    vi.stubGlobal('self', {
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
        messageHandlers.push(handler);
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0).reverse()) {
      dispose();
    }
    vi.unstubAllGlobals();
  });

  it('should preserve generated paths inside the root and drop paths outside it', async () => {
    const bus = new ChangeEventBus();
    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: bus,
        handlerForRoot: () => ({
          capabilities: { persistent: false, writable: true, quotaBased: false },
          readFile: async () => new Uint8Array(),
        }),
      },
    );
    const channel = new MessageChannel();
    messageHandlers.at(-1)!(
      new MessageEvent('message', {
        data: {
          v: fileSystemBridgeProtocolVersion,
          type: filesystemBridgeConnectMessageType,
          port: channel.port1,
          root,
          consumer: 'working-copy',
        },
      }),
    );

    try {
      await vi.waitFor(() => {
        expect(handle.serverHandles.size).toBe(1);
      });
      const emit = vi.spyOn([...handle.serverHandles.values()][0]!, 'emit');

      fc.assert(
        fc.property(relativePath, (relative) => {
          emit.mockClear();
          bus.emit({ type: 'fileWritten', path: `/projects/outside/${relative}`, backend: 'memory' });
          bus.emit({ type: 'fileWritten', path: `${root}/${relative}`, backend: 'memory' });

          expect(emit).toHaveBeenCalledExactlyOnceWith('fileChanged', {
            type: 'fileWritten',
            path: relative,
            backend: 'memory',
          } satisfies ChangeEvent);
        }),
      );
    } finally {
      handle.cleanup();
      channel.port1.close();
      channel.port2.close();
    }
  });
});
