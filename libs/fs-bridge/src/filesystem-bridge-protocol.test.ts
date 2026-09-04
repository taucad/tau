import { describe, expect, it } from 'vitest';
import { z } from 'zod';
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

    const parsedDirectory = fileSystemBridgeSchemas.calls.readDirectory.result.safeParse(tree);
    const parsedShallowDirectory = fileSystemBridgeSchemas.calls.readShallowDirectory.result.safeParse(tree);

    expect(parsedDirectory.success).toBe(true);
    expect(parsedShallowDirectory.success).toBe(true);
    if (parsedDirectory.success && parsedShallowDirectory.success) {
      expect(parsedDirectory.data).toBe(tree);
      expect(parsedShallowDirectory.data).toBe(tree);
    }
  });

  it('preserves stat-batch result references', () => {
    const stats = [
      { type: 'file', path: 'main.ts', name: 'main.ts', size: 4, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
    ] as const;
    const parsedDirectoryStats = fileSystemBridgeSchemas.calls.getDirectoryStat.result.safeParse(stats);
    const parsedSearchStats = fileSystemBridgeSchemas.calls.searchFiles.result.safeParse(stats);

    expect(parsedDirectoryStats.success).toBe(true);
    expect(parsedSearchStats.success).toBe(true);
    if (parsedDirectoryStats.success && parsedSearchStats.success) {
      expect(parsedDirectoryStats.data).toBe(stats);
      expect(parsedSearchStats.data).toBe(stats);
    }
  });

  it('preserves getDirectoryContents result references', () => {
    const contents = {
      'main.ts': new Uint8Array([1, 2, 3]),
      'nested/model.step': new Uint8Array([4, 5, 6]),
    };

    const parsed = fileSystemBridgeSchemas.calls.getDirectoryContents.result.safeParse(contents);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe(contents);
    }
  });
});
