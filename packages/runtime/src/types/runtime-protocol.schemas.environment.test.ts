import { describe, expect, it, vi } from 'vitest';

const withGlobalOverride = async <T>(
  name: 'SharedArrayBuffer' | 'MessagePort',
  value: unknown,
  callback: () => Promise<T>,
): Promise<T> => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });

  try {
    vi.resetModules();
    return await callback();
  } finally {
    vi.resetModules();
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
};

describe('runtime protocol schemas in constrained browser environments', () => {
  it('should import when SharedArrayBuffer is unavailable', async () => {
    await withGlobalOverride('SharedArrayBuffer', undefined, async () => {
      const { runtimeProtocolSchemas } = await import('#types/runtime-protocol.schemas.js');

      expect(runtimeProtocolSchemas.calls.initialize.args).toBeDefined();
    });
  });

  it('should reject shared memory handles when SharedArrayBuffer is unavailable', async () => {
    await withGlobalOverride('SharedArrayBuffer', undefined, async () => {
      const { runtimeInitializeMemoryHandleSchema } = await import('#types/runtime-protocol.schemas.js');

      expect(
        runtimeInitializeMemoryHandleSchema.safeParse({
          signalBuffer: {},
        }).success,
      ).toBe(false);
    });
  });

  it('should import when MessagePort is unavailable', async () => {
    await withGlobalOverride('MessagePort', undefined, async () => {
      const { runtimeProtocolSchemas } = await import('#types/runtime-protocol.schemas.js');

      expect(runtimeProtocolSchemas.calls.initialize.args).toBeDefined();
    });
  });

  it('should reject file-system ports when MessagePort is unavailable', async () => {
    await withGlobalOverride('MessagePort', undefined, async () => {
      const { runtimeInitializeMemoryHandleSchema } = await import('#types/runtime-protocol.schemas.js');

      expect(
        runtimeInitializeMemoryHandleSchema.safeParse({
          fileSystemPort: {},
        }).success,
      ).toBe(false);
    });
  });
});

describe('runtime initialize memory handle port validation (X7)', () => {
  it('should accept a Node MessageChannel port', async () => {
    const { runtimeInitializeMemoryHandleSchema } = await import('#types/runtime-protocol.schemas.js');
    const channel = new MessageChannel();

    try {
      expect(runtimeInitializeMemoryHandleSchema.safeParse({ fileSystemPort: channel.port1 }).success).toBe(true);
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('should accept a structural port that is not a MessagePort instance', async () => {
    const { runtimeInitializeMemoryHandleSchema } = await import('#types/runtime-protocol.schemas.js');
    const structuralPort = {
      postMessage(): void {
        /* No-op. */
      },
      addEventListener(): void {
        /* No-op. */
      },
      removeEventListener(): void {
        /* No-op. */
      },
      close(): void {
        /* No-op. */
      },
    };

    expect(structuralPort instanceof MessagePort).toBe(false);
    expect(runtimeInitializeMemoryHandleSchema.safeParse({ fileSystemPort: structuralPort }).success).toBe(true);
  });

  it('should reject a plain object that exposes no port methods', async () => {
    const { runtimeInitializeMemoryHandleSchema } = await import('#types/runtime-protocol.schemas.js');

    expect(runtimeInitializeMemoryHandleSchema.safeParse({ fileSystemPort: { postMessage: 1 } }).success).toBe(false);
    expect(runtimeInitializeMemoryHandleSchema.safeParse({ fileSystemPort: {} }).success).toBe(false);
  });

  it('should reject port shapes that wrapMessagePort cannot drive', async () => {
    const { runtimeInitializeMemoryHandleSchema } = await import('#types/runtime-protocol.schemas.js');
    const noop = (): void => {
      /* No-op. */
    };

    // EventEmitter-shaped: `on`/`off` instead of add/removeEventListener. Previously admitted, then crashed in wrapMessagePort.
    expect(
      runtimeInitializeMemoryHandleSchema.safeParse({
        fileSystemPort: { postMessage: noop, on: noop, off: noop, close: noop },
      }).success,
    ).toBe(false);
    // Missing removeEventListener: unsubscribe would throw.
    expect(
      runtimeInitializeMemoryHandleSchema.safeParse({
        fileSystemPort: { postMessage: noop, addEventListener: noop, close: noop },
      }).success,
    ).toBe(false);
    // Missing close: transport shutdown would throw.
    expect(
      runtimeInitializeMemoryHandleSchema.safeParse({
        fileSystemPort: { postMessage: noop, addEventListener: noop, removeEventListener: noop },
      }).success,
    ).toBe(false);
  });
});
