import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleReadFile } from '#rpc/handlers/handle-read-file.js';

describe('handleReadFile', () => {
  it('should return raw file content with line metadata', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockResolvedValue('line1\nline2\nline3');
    fileSystem.stat.mockResolvedValue({
      size: 18,
      isDirectory: false,
      createdAt: '2026-01-15T10:00:00.000Z',
      modifiedAt: '2026-01-20T14:30:00.000Z',
    });

    const result = await handleReadFile({ targetFile: 'test.txt' }, fileSystem);

    expect(result).toEqual({
      success: true,
      content: 'line1\nline2\nline3',
      totalLines: 3,
      startLine: 1,
      createdAt: '2026-01-15T10:00:00.000Z',
      modifiedAt: '2026-01-20T14:30:00.000Z',
    });
  });

  it('should slice raw content from the offset', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockResolvedValue('alpha\nbeta\ngamma\ndelta\nepsilon');
    fileSystem.stat.mockResolvedValue({
      size: 30,
      isDirectory: false,
      createdAt: '2026-01-15T10:00:00.000Z',
      modifiedAt: '2026-01-20T14:30:00.000Z',
    });

    const result = await handleReadFile({ targetFile: 'test.txt', offset: 3, limit: 2 }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      content: 'gamma\ndelta',
      startLine: 3,
    });
  });

  it('should include timestamps from stat', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockResolvedValue('data');
    fileSystem.stat.mockResolvedValue({
      size: 4,
      isDirectory: false,
      createdAt: '2026-03-01T00:00:00.000Z',
      modifiedAt: '2026-03-24T12:00:00.000Z',
    });

    const result = await handleReadFile({ targetFile: 'test.txt' }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      modifiedAt: '2026-03-24T12:00:00.000Z',
    });
  });

  it('should gracefully handle stat failure', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockResolvedValue('content');
    fileSystem.stat.mockRejectedValue(new Error('stat not supported'));

    const result = await handleReadFile({ targetFile: 'test.txt' }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      content: 'content',
    });
    expect(result.success && result.createdAt).toBeUndefined();
    expect(result.success && result.modifiedAt).toBeUndefined();
  });

  it('should apply offset and limit', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockResolvedValue('a\nb\nc\nd\ne');
    fileSystem.stat.mockRejectedValue(new Error('unavailable'));

    const result = await handleReadFile({ targetFile: 'test.txt', offset: 2, limit: 2 }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      content: 'b\nc',
      totalLines: 5,
      startLine: 2,
    });
  });

  it('should return FILE_NOT_FOUND when file does not exist', async () => {
    const fileSystem = mock<RpcFileSystem>();
    const error = new Error('ENOENT: no such file');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    fileSystem.readFile.mockRejectedValue(error);

    const result = await handleReadFile({ targetFile: 'missing.txt' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.fileNotFound });
  });

  // ===========================================================================
  // Phase 0 contracts — see docs/research/tool-result-offloading-and-context-prevention.md
  //
  // The transcript Downloads/involute_gear_profiles_2026-05-12T07-18.md shows
  // three back-to-back read_file calls (lines 1039, 1291, 2225) each pulling
  // 200–500 lines from `node_modules/opencascade.js/index.d.ts` (the dense
  // 226 592-line OCJS bindings .d.ts). Combined output: ~34 KB / ~12 K tokens.
  // The schema currently caps neither the explicit `limit` parameter nor the
  // implicit `limit ?? lines.length` fallback, so the model can request
  // arbitrary slices of any file.
  //
  // Phase 0 fix: cap `limit` server-side, enforce a maximum byte budget per
  // response, and truncate lines wider than the column ceiling.
  // ===========================================================================
  describe('Phase 0 — server-side caps', () => {
    it('should cap an omitted limit at MAX_READ_LINES (2000) on huge files and emit truncated: true', async () => {
      const fileSystem = mock<RpcFileSystem>();
      const lines = Array.from({ length: 5000 }, (_, index) => `line-${index}`);
      fileSystem.readFile.mockResolvedValue(lines.join('\n'));
      fileSystem.stat.mockResolvedValue({
        size: 200,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });

      const result = await handleReadFile({ targetFile: 'big.ts' }, fileSystem);

      expect(result).toMatchObject({ success: true, totalLines: 5000, truncated: true });
      const content = result.success ? result.content : '';
      expect(content.split('\n').length).toBe(2000);
    });

    it('should clamp an explicit limit > 2000 at the server boundary even if the schema is bypassed', async () => {
      const fileSystem = mock<RpcFileSystem>();
      const lines = Array.from({ length: 5000 }, (_, index) => `line-${index}`);
      fileSystem.readFile.mockResolvedValue(lines.join('\n'));
      fileSystem.stat.mockResolvedValue({
        size: 200,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });

      // Bypass the Zod schema (which would already reject this at the wire layer)
      // by casting through `unknown` — we still want a defensive handler-level clamp.
      const result = await handleReadFile(
        { targetFile: 'big.ts', limit: 5000 } as unknown as Parameters<typeof handleReadFile>[0],
        fileSystem,
      );

      const content = result.success ? result.content : '';
      expect(content.split('\n').length).toBe(2000);
      expect(result).toMatchObject({ success: true, truncated: true });
    });

    it('should reject limit > 2000 via the readFileInputSchema', async () => {
      const { readFileInputSchema } = await import('#schemas/tools/read-file.tool.schema.js');

      expect(readFileInputSchema.safeParse({ targetFile: 'a.ts', limit: 5000 }).success).toBe(false);
    });

    it('should not flag truncated when the file fits in the cap', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.readFile.mockResolvedValue('a\nb\nc');
      fileSystem.stat.mockResolvedValue({
        size: 5,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });

      const result = await handleReadFile({ targetFile: 'small.ts' }, fileSystem);

      expect(result).toMatchObject({ success: true, totalLines: 3 });
      expect(result.success && result.truncated).toBeUndefined();
    });
  });

  describe('Phase 0 — 256 KB precheck with directive error', () => {
    it('should reject reads of files >256 KB without explicit offset/limit and direct the model to paginate', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.stat.mockResolvedValue({
        size: 512 * 1024,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });

      const result = await handleReadFile({ targetFile: 'index.d.ts' }, fileSystem);

      expect(result).toMatchObject({
        success: false,
        errorCode: rpcClientErrorCode.resultTooLarge,
      });
      expect(!result.success && result.message).toContain('Use offset and limit');
      expect(fileSystem.readFile).not.toHaveBeenCalled();
    });

    it('should allow reads of files >256 KB when offset and limit are provided', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.stat.mockResolvedValue({
        size: 512 * 1024,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      fileSystem.readFile.mockResolvedValue('line1\nline2\nline3');

      const result = await handleReadFile({ targetFile: 'index.d.ts', offset: 1, limit: 100 }, fileSystem);

      expect(result).toMatchObject({ success: true, startLine: 1 });
    });

    it('should bypass the precheck when only offset is supplied (paginating without an explicit slice limit)', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.stat.mockResolvedValue({
        size: 512 * 1024,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      fileSystem.readFile.mockResolvedValue('a\nb\nc');

      const result = await handleReadFile({ targetFile: 'index.d.ts', offset: 10 }, fileSystem);

      expect(result).toMatchObject({ success: true });
    });
  });
});
