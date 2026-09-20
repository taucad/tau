import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as barrel from '#index.js';
import {
  createFileSystemBridgeHello,
  fileSystemBridgeProtocolVersion,
  fileSystemBridgeSchemas,
} from '#filesystem-bridge-protocol.js';

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

/* A literal, so a bump is a deliberate edit to this line and not a silent one:
 * every other assertion in the suite now reads the constant (G0-11). */
describe('filesystem bridge protocol version', () => {
  it('should be 2', () => {
    expect(fileSystemBridgeProtocolVersion).toBe(2);
  });
});

describe('@taucad/fs-bridge barrel', () => {
  it('exports createFileSystemBridgeHello', () => {
    expect(barrel.createFileSystemBridgeHello).toBe(createFileSystemBridgeHello);
  });
});

describe('filesystem bridge hello capabilities', () => {
  it('carries current provider durability', () => {
    const hello = createFileSystemBridgeHello({
      state: 'ready',
      capabilities: {
        persistent: true,
        writable: true,
        quotaBased: true,
        durability: 'exclusive-append',
      },
      watchable: false,
    });

    expect(fileSystemBridgeSchemas.hello.safeParse(hello)).toEqual({ success: true, data: hello });
  });

  it('still accepts a hello from before durability classes', () => {
    const legacy = {
      v: fileSystemBridgeProtocolVersion,
      state: 'ready',
      capabilities: { persistent: true, writable: true, quotaBased: true },
      watchable: false,
    };

    expect(fileSystemBridgeSchemas.hello.safeParse(legacy)).toMatchObject({ success: true });
  });
});

describe('filesystem bridge Zod schemas', () => {
  it('uses Zod validators in the existing WireValidator slots', () => {
    // PH22(c): this intentionally rejects WireValidator lookalikes so the retired DSL cannot regrow.
    expect(fileSystemBridgeSchemas.hello).toBeInstanceOf(z.ZodType);
    expect(fileSystemBridgeSchemas.calls.readFile.args).toBeInstanceOf(z.ZodType);
    expect(fileSystemBridgeSchemas.calls.readFile.result).toBeInstanceOf(z.ZodType);
    expect(fileSystemBridgeSchemas.listens.watch.event).toBeInstanceOf(z.ZodType);
  });

  it('preserves readFile result references', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const text = 'hello';
    const parsedBytes = fileSystemBridgeSchemas.calls.readFile.result.safeParse(bytes);
    const parsedText = fileSystemBridgeSchemas.calls.readFile.result.safeParse(text);

    expect(parsedBytes.success).toBe(true);
    expect(parsedText.success).toBe(true);
    if (parsedBytes.success && parsedText.success) {
      expect(parsedBytes.data).toBe(bytes);
      expect(parsedText.data).toBe(text);
    }
  });

  it('preserves listTree result references', () => {
    const tree = [
      {
        id: '/',
        name: 'root',
        size: 0,
        mtimeMs: 1,
        children: [{ id: '/main.ts', name: 'main.ts', size: 4, mtimeMs: 1, contentKind: 'text', lineCount: 1 }],
      },
    ];

    const parsedShallowDirectory = fileSystemBridgeSchemas.calls.readScopedShallowDirectory.result.safeParse(tree);

    expect(parsedShallowDirectory.success).toBe(true);
    if (parsedShallowDirectory.success) {
      expect(parsedShallowDirectory.data).toBe(tree);
    }
  });

  it('preserves stat-batch result references', () => {
    const stats = [
      { type: 'file', path: 'main.ts', name: 'main.ts', size: 4, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
    ] as const;
    /* Both spellings are the rooted surface's since W12d: `statTree` over the
     * root's index and `search` over the same one, masked by the view. */
    const parsedDirectoryStats = fileSystemBridgeSchemas.calls.statTree.result.safeParse(stats);
    const parsedSearchStats = fileSystemBridgeSchemas.calls.search.result.safeParse(stats);

    expect(parsedDirectoryStats.success).toBe(true);
    expect(parsedSearchStats.success).toBe(true);
    if (parsedDirectoryStats.success && parsedSearchStats.success) {
      expect(parsedDirectoryStats.data).toBe(stats);
      expect(parsedSearchStats.data).toBe(stats);
    }
  });

  it('preserves the rooted contents result references', () => {
    const contents = {
      'main.ts': new Uint8Array([1, 2, 3]),
      'nested/model.step': new Uint8Array([4, 5, 6]),
    };

    const parsed = fileSystemBridgeSchemas.calls.contents.result.safeParse(contents);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe(contents);
    }
  });
});
