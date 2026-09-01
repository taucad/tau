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
});
