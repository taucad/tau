import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleGrep } from '#rpc/handlers/handle-grep.js';

describe('handleGrep', () => {
  it('should return matches when pattern matches file contents in a directory walk', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.stat.mockResolvedValue({
      size: 0,
      isDirectory: true,
      createdAt: '2026-05-12T00:00:00.000Z',
      modifiedAt: '2026-05-12T00:00:00.000Z',
    });
    fileSystem.readdir.mockResolvedValue([{ name: 'app.ts', type: 'file', size: 20 }]);
    fileSystem.readFile.mockResolvedValue("const x = 'hello world'\n");

    const result = await handleGrep({ pattern: 'hello', path: '' }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      totalMatches: 1,
      truncated: false,
      appliedOffset: 0,
    });
    expect(result.success && result.matches).toEqual([expect.objectContaining({ file: 'app.ts', line: 1 })]);
    expect(result.success && result.matches[0]?.content).toContain('hello');
  });

  it('should return FILE_NOT_FOUND when the path stat fails with ENOENT', async () => {
    const fileSystem = mock<RpcFileSystem>();
    const error = new Error('ENOENT: no such file');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    fileSystem.stat.mockRejectedValue(error);

    const result = await handleGrep({ pattern: 'foo', path: 'missing-dir' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.fileNotFound });
  });

  // ===========================================================================
  // Phase 0 contracts — see docs/research/tool-result-offloading-and-context-prevention.md
  //
  // The transcript at Downloads/involute_gear_profiles_2026-05-12T07-18.md (lines
  // 1015, 1030, 1405) shows three back-to-back `grep` calls with `path` set to a
  // FILE (`node_modules/opencascade.js/index.d.ts`). Each crashed with
  // `[Error: Grep search failed]` because `collectFilePaths` calls `readdir` on
  // what is actually a regular file. The model recovered with three large
  // `read_file` calls instead, leaking ~34 KB of OCCT type bindings into the
  // prompt cache.
  //
  // Phase 0 fix: detect file-vs-directory via `stat` and either restrict the
  // walk to that single file, or return a clean ValidationError directing the
  // model to retry with `path: parentDir` + `glob: 'fileName'`.
  // ===========================================================================
  describe('Phase 0 — file-as-path handling', () => {
    it('should search a single file directly when `path` points to a regular file (no readdir)', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.stat.mockResolvedValue({
        size: 30,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      fileSystem.readFile.mockResolvedValue('alpha\nfoo bar\ngamma');

      const result = await handleGrep({ pattern: 'foo', path: 'src/app.ts' }, fileSystem);

      expect(result).toMatchObject({
        success: true,
        totalMatches: 1,
      });
      expect(result.success && result.matches[0]).toEqual(
        expect.objectContaining({ file: 'src/app.ts', line: 2, content: 'foo bar' }),
      );
      expect(fileSystem.readdir).not.toHaveBeenCalled();
    });

    it('should return FILE_NOT_FOUND when `path` does not exist', async () => {
      const fileSystem = mock<RpcFileSystem>();
      const enoent = new Error('ENOENT: no such file');
      (enoent as NodeJS.ErrnoException).code = 'ENOENT';
      fileSystem.stat.mockRejectedValue(enoent);

      const result = await handleGrep({ pattern: 'foo', path: 'does/not/exist.ts' }, fileSystem);

      expect(result).toMatchObject({
        success: false,
        errorCode: rpcClientErrorCode.fileNotFound,
      });
      expect(!result.success && result.message).toContain('does/not/exist.ts');
    });
  });

  describe('Phase 0 — server-side caps', () => {
    it('should default headLimit to 50 matches when omitted on the wire', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.stat.mockResolvedValue({
        size: 200_000,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      const lines = Array.from({ length: 1000 }, (_, lineIndex) => `match line ${lineIndex}`);
      fileSystem.readFile.mockResolvedValue(lines.join('\n'));

      const result = await handleGrep({ pattern: 'match', path: 'big.ts' }, fileSystem);

      expect(result).toMatchObject({
        success: true,
        totalMatches: 1000,
        truncated: true,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      });
      expect(result.success ? result.matches.length : 0).toBe(50);
    });

    it('should honour an explicit headLimit override up to 1000', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.stat.mockResolvedValue({
        size: 200_000,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      const lines = Array.from({ length: 800 }, (_, lineIndex) => `match line ${lineIndex}`);
      fileSystem.readFile.mockResolvedValue(lines.join('\n'));

      const result = await handleGrep({ pattern: 'match', path: 'big.ts', headLimit: 500 }, fileSystem);

      expect(result).toMatchObject({
        success: true,
        totalMatches: 800,
        truncated: true,
        appliedHeadLimit: 500,
      });
      expect(result.success ? result.matches.length : 0).toBe(500);
    });

    it('should paginate via offset (skip the first N matches before applying headLimit)', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.stat.mockResolvedValue({
        size: 200_000,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      const lines = Array.from({ length: 100 }, (_, lineIndex) => `match line ${lineIndex}`);
      fileSystem.readFile.mockResolvedValue(lines.join('\n'));

      const result = await handleGrep({ pattern: 'match', path: 'big.ts', headLimit: 5, offset: 10 }, fileSystem);

      expect(result).toMatchObject({
        success: true,
        totalMatches: 100,
        appliedHeadLimit: 5,
        appliedOffset: 10,
      });
      expect(result.success && result.matches[0]?.content).toBe('match line 10');
      expect(result.success && result.matches.at(-1)?.content).toBe('match line 14');
    });

    it('should truncate match lines longer than 500 chars with `[line truncated: N chars]` while preserving file/line', async () => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.stat.mockResolvedValue({
        size: 5000,
        isDirectory: false,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      const longLine = `${'a'.repeat(2000)}foo${'b'.repeat(3000)}`;
      fileSystem.readFile.mockResolvedValue(`short line\n${longLine}\nanother`);

      const result = await handleGrep({ pattern: 'foo', path: 'big.ts' }, fileSystem);

      expect(result.success && result.matches[0]).toEqual({
        file: 'big.ts',
        line: 2,
        content: `[line truncated: ${longLine.length} chars]`,
      });
    });
  });

  it('should reject headLimit > 1000 via schema validation', async () => {
    const { grepInputSchema } = await import('#schemas/tools/grep.tool.schema.js');

    expect(grepInputSchema.safeParse({ pattern: 'foo', headLimit: 1001 }).success).toBe(false);
  });
});
