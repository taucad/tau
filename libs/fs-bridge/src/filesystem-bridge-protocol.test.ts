import { describe, expect, it } from 'vitest';
import * as barrel from '#index.js';
import { createFileSystemBridgeHello, fileSystemBridgeSchemas } from '#filesystem-bridge-protocol.js';

describe('void call results', () => {
  const { result } = fileSystemBridgeSchemas.calls.writeFile;

  it('accepts undefined', () => {
    expect(result.safeParse(undefined)).toEqual({ success: true, data: undefined });
  });

  /* A binary codec (msgpack) encodes `undefined` as nil and decodes it back as
   * `null`, so every void response arrives as `null` over a socket. */
  it('accepts null', () => {
    expect(result.safeParse(null)).toEqual({ success: true, data: undefined });
  });

  it.each([0, '', {}, false])('rejects %o', (value) => {
    expect(result.safeParse(value)).toMatchObject({ success: false });
  });
});

describe('@taucad/fs-bridge barrel', () => {
  it('exports createFileSystemBridgeHello', () => {
    expect(barrel.createFileSystemBridgeHello).toBe(createFileSystemBridgeHello);
  });
});
