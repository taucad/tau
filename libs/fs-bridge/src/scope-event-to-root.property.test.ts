import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { ChangeEventBus, EventCoalescer } from '@taucad/filesystem';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { ChangeEvent, PathChangeEvent } from '@taucad/types';
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
        policy: tauPathPolicy,
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

  /** One working-copy port on `root`, with what it is sent and the bus that feeds it. */
  const connectRooted = async (
    maxQueueDepth?: number,
  ): Promise<{ bus: ChangeEventBus; emit: ReturnType<typeof vi.fn>; close: () => void }> => {
    const bus = new ChangeEventBus();
    const handle = exposeFileSystem(
      {},
      {
        policy: tauPathPolicy,
        changeEventBus: bus,
        handlerForRoot: () => ({
          capabilities: { persistent: false, writable: true, quotaBased: false },
          readFile: async () => new Uint8Array(),
        }),
        ...(maxQueueDepth === undefined
          ? {}
          : {
              createCoalescer: (deliver, coalescingWindow, onOverflow) =>
                new EventCoalescer(deliver, { coalescingWindow, maxQueueDepth, onOverflow }),
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
    await vi.waitFor(() => {
      expect(handle.serverHandles.size).toBe(1);
    });
    const emit = vi.spyOn([...handle.serverHandles.values()][0]!, 'emit') as unknown as ReturnType<typeof vi.fn>;
    return {
      bus,
      emit,
      close: () => {
        handle.cleanup();
        channel.port1.close();
        channel.port2.close();
      },
    };
  };

  /*
   * STO-25 SP2g review F1 (I5): a removal or move of the root or a directory
   * above it changed everything the port can see, so it is the port's
   * whole-root reset. A summary of an ancestor is not (re-review a3): it says
   * only that the ancestor's listing changed — another project deleted, a
   * discovery-wide change — and cannot change what is under the root.
   */
  it.each<PathChangeEvent>([
    { type: 'directoryDeleted', path: '/projects', backend: 'memory' },
    { type: 'directoryDeleted', path: '/', backend: 'memory' },
    { type: 'directoryRenamed', oldPath: '/projects', newPath: '/archive', backend: 'memory' },
    { type: 'directoryRenamed', oldPath: '/old', newPath: '/projects', backend: 'memory' },
  ])('should reset the whole root for $type above it', async (event) => {
    const { bus, emit, close } = await connectRooted();
    try {
      bus.emit(event);
      expect(emit).toHaveBeenCalledExactlyOnceWith('fileChanged', {
        type: 'directoryChanged',
        path: '',
        backend: 'memory',
      } satisfies ChangeEvent);
    } finally {
      close();
    }
  });

  it.each<PathChangeEvent>([
    /* `_emitGlobalDiscoveryChange`: an unmapped external fact, relayed to every tab. */
    { type: 'directoryChanged', path: '/', backend: 'memory' },
    /* `ProjectDirectories`: another project under `/projects` was deleted. */
    { type: 'directoryChanged', path: '/projects', backend: 'memory' },
  ])('should not reset the root for a summary of $path above it', async (event) => {
    const { bus, emit, close } = await connectRooted();
    try {
      bus.emit(event);
      expect(emit).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('should reset the whole root when an overflowed window lost a removal above it', async () => {
    const { bus, emit, close } = await connectRooted(2);
    try {
      bus.emit({ type: 'directoryDeleted', path: '/projects', backend: 'memory' });
      bus.emit({ type: 'fileWritten', path: '/elsewhere/a.txt', backend: 'memory' });
      bus.emit({ type: 'fileWritten', path: '/elsewhere/b.txt', backend: 'memory' });
      expect(emit).toHaveBeenCalledExactlyOnceWith('fileChanged', {
        type: 'directoryChanged',
        path: '',
        backend: 'memory',
      } satisfies ChangeEvent);
    } finally {
      close();
    }
  });

  it.each<PathChangeEvent>([
    { type: 'fileWritten', path: `${root}/a.txt`, backend: 'memory' },
    { type: 'directoryCreated', path: root, backend: 'memory' },
  ])('should reset the root when an overflowed window lost $type on it', async (lost) => {
    const { bus, emit, close } = await connectRooted(2);
    try {
      bus.emit(lost);
      bus.emit({ type: 'fileWritten', path: '/elsewhere/a.txt', backend: 'memory' });
      bus.emit({ type: 'fileWritten', path: '/elsewhere/b.txt', backend: 'memory' });
      expect(emit).toHaveBeenCalledExactlyOnceWith('fileChanged', {
        type: 'directoryChanged',
        path: '',
        backend: 'memory',
      } satisfies ChangeEvent);
    } finally {
      close();
    }
  });

  /* Re-review a4 (I7): a removal the same lost window netted is re-listed, never told as gone. */
  it('should re-list, not remove, a directory an overflowed window deleted and re-created', async () => {
    const { bus, emit, close } = await connectRooted(2);
    try {
      bus.emit({ type: 'directoryDeleted', path: `${root}/parts`, backend: 'memory' });
      bus.emit({ type: 'fileWritten', path: `${root}/parts/a.scad`, backend: 'memory' });
      bus.emit({ type: 'fileWritten', path: '/elsewhere/b.txt', backend: 'memory' });
      expect(emit).toHaveBeenCalledExactlyOnceWith('fileChanged', {
        type: 'changeSet',
        entries: [
          { type: 'directoryChanged', path: '', backend: 'memory' },
          { type: 'directoryChanged', path: 'parts', backend: 'memory' },
        ],
      } satisfies ChangeEvent);
    } finally {
      close();
    }
  });

  it('should still reset the whole root when an overflowed window deleted and re-created a directory above it', async () => {
    const { bus, emit, close } = await connectRooted(2);
    try {
      bus.emit({ type: 'directoryDeleted', path: '/projects', backend: 'memory' });
      bus.emit({ type: 'directoryCreated', path: '/projects', backend: 'memory' });
      bus.emit({ type: 'fileWritten', path: '/elsewhere/b.txt', backend: 'memory' });
      expect(emit).toHaveBeenCalledExactlyOnceWith('fileChanged', {
        type: 'directoryChanged',
        path: '',
        backend: 'memory',
      } satisfies ChangeEvent);
    } finally {
      close();
    }
  });

  it('should not reset the root when an overflowed window lost only a summary above it', async () => {
    const { bus, emit, close } = await connectRooted(2);
    try {
      bus.emit({ type: 'directoryChanged', path: '/projects', backend: 'memory' });
      bus.emit({ type: 'fileWritten', path: '/elsewhere/a.txt', backend: 'memory' });
      bus.emit({ type: 'fileWritten', path: '/elsewhere/b.txt', backend: 'memory' });
      expect(emit).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('should not reset the root for a directory beside it', async () => {
    const { bus, emit, close } = await connectRooted();
    try {
      bus.emit({ type: 'directoryChanged', path: '/projects/alphabet', backend: 'memory' });
      bus.emit({ type: 'directoryDeleted', path: '/projects/beta', backend: 'memory' });
      expect(emit).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });
});
