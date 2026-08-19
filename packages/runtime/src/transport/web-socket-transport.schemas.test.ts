import { describe, expect, it } from 'vitest';
import { fromMemoryFs, fromFileSystemBridge } from '#filesystem/runtime-filesystem.js';
import { webSocketClientOptionsSchema } from '#transport/web-socket-transport.schemas.js';

describe('webSocketClientOptionsSchema', () => {
  it('should accept a string or URL host address', () => {
    expect(webSocketClientOptionsSchema.safeParse({ url: 'ws://127.0.0.1:8080' }).success).toBe(true);
    expect(webSocketClientOptionsSchema.safeParse({ url: new URL('ws://127.0.0.1:8080') }).success).toBe(true);
  });

  it('should require the host address', () => {
    expect(webSocketClientOptionsSchema.safeParse({}).success).toBe(false);
  });

  it('should reject a raw socket option (wire primitives are not public options)', () => {
    expect(webSocketClientOptionsSchema.safeParse({ url: 'ws://127.0.0.1:8080', socket: {} }).success).toBe(false);
  });

  it('should accept an inline filesystem handle', () => {
    expect(
      webSocketClientOptionsSchema.safeParse({ url: 'ws://127.0.0.1:8080', fileSystem: fromMemoryFs() }).success,
    ).toBe(true);
  });

  it('should reject a bridged filesystem handle with a message naming the add-when', () => {
    const bridged = fromFileSystemBridge(() => {
      throw new Error('never connected in this test');
    });
    const result = webSocketClientOptionsSchema.safeParse({ url: 'ws://127.0.0.1:8080', fileSystem: bridged });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('fromFileSystemBridge');
  });

  it('should accept a createSocket factory', () => {
    const parsed = webSocketClientOptionsSchema.safeParse({
      url: 'ws://127.0.0.1:8080',
      createSocket: () => {
        throw new Error('never dialled in this test');
      },
    });
    expect(parsed.success).toBe(true);
  });
});
