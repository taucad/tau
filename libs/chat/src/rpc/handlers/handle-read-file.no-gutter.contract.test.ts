import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileStat, RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { handleReadFile } from '#rpc/handlers/handle-read-file.js';

const gutterPattern = /^ +\d+\t/m;
const textStat: RpcFileStat = {
  size: 20,
  isDirectory: false,
  contentKind: 'text',
  lineCount: 3,
  createdAt: '2026-05-13T00:00:00.000Z',
  modifiedAt: '2026-05-13T00:00:00.000Z',
};

describe('handleReadFile — RPC primitive is raw (no cat-n gutter)', () => {
  it('should never put line-number gutters into result.content', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockResolvedValue('{\n  "a": 1\n}');
    fileSystem.stat.mockResolvedValue(textStat);

    const result = await handleReadFile({ targetFile: 'example.json', offset: 1, limit: 10 }, fileSystem);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).not.toMatch(gutterPattern);
    }
  });
});
