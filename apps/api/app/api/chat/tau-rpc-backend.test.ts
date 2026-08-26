/* eslint-disable @typescript-eslint/naming-convention -- RPC response properties use snake_case */
import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { TauRpcBackendFactory, TauRpcBackend } from '#api/chat/tau-rpc-backend.js';

describe('TauRpcBackendFactory', () => {
  it('should create a TauRpcBackend instance', () => {
    const chatRpcService = mock<ChatRpcService>();
    const factory = new TauRpcBackendFactory(chatRpcService);
    const backend = factory.create('chat-1', 'tool-call-1');

    expect(backend).toBeInstanceOf(TauRpcBackend);
  });
});

describe('TauRpcBackend', () => {
  let chatRpcService: ReturnType<typeof mock<ChatRpcService>>;
  let backend: TauRpcBackend;

  type ReadFileSuccess = {
    success: true;
    content: string;
    size: number;
    contentKind: 'text';
    totalLines: number;
    createdAt?: string;
    modifiedAt?: string;
  };

  const readFileSuccess = (
    content: string,
    totalLines: number,
    extra?: { createdAt?: string; modifiedAt?: string },
  ): ReadFileSuccess => ({
    success: true,
    content,
    size: new TextEncoder().encode(content).byteLength,
    contentKind: 'text',
    totalLines,
    ...(extra?.createdAt ? { createdAt: extra.createdAt } : {}),
    ...(extra?.modifiedAt ? { modifiedAt: extra.modifiedAt } : {}),
  });

  beforeEach(() => {
    chatRpcService = mock<ChatRpcService>();
    backend = new TauRpcBackend(chatRpcService, 'chat-1', 'tool-call-1');
  });

  describe('absolute path contract', () => {
    it.each([
      ['lsInfo', async () => backend.lsInfo('src')],
      ['read', async () => backend.read('src/a.ts')],
      ['readRaw', async () => backend.readRaw('src/a.ts')],
      ['grepRaw', async () => backend.grepRaw('x', 'src')],
      ['globInfo', async () => backend.globInfo('*.ts', 'src')],
      ['write', async () => backend.write('src/a.ts', 'x')],
      ['append', async () => backend.append('src/a.ts', 'x')],
      ['edit', async () => backend.edit('src/a.ts', 'x', 'y')],
    ])('should reject relative %s input before sending RPC', async (_method, call) => {
      await expect(call()).rejects.toMatchObject({
        name: 'VirtualPathError',
        code: 'INVALID_PATH',
      });
      expect(chatRpcService.sendRpcRequest).not.toHaveBeenCalled();
    });
  });

  describe('lsInfo', () => {
    it('should list directory entries as FileInfo objects with metadata', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        entries: [
          {
            name: 'file.ts',
            type: 'file',
            size: 100,
            contentKind: 'text',
            lineCount: 12,
            modifiedAt: '2026-01-15T10:00:00.000Z',
          },
          { name: 'subdir', type: 'dir', size: 0 },
        ],
        path: 'src',
      });

      const result = await backend.lsInfo('/src');

      expect(result).toEqual([
        { path: '/src/file.ts', is_dir: false, size: 100, modified_at: '2026-01-15T10:00:00.000Z' },
        { path: '/src/subdir/', is_dir: true, size: 0 },
      ]);
    });

    it('should throw on RPC error', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        errorCode: 'NO_CONNECTION',
        message: 'Disconnected',
        rpcName: 'list_directory',
      });

      await expect(backend.lsInfo('/src')).rejects.toThrow('Disconnected');
    });

    it('should translate the DeepAgents root to Tau RPC root and return absolute paths', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        entries: [
          { name: 'main.ts', type: 'file', size: 20, contentKind: 'text', lineCount: 1 },
          { name: 'checks', type: 'dir', size: 0 },
        ],
        path: '/',
      });

      const result = await backend.lsInfo('/');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(expect.objectContaining({ args: { path: '' } }));
      expect(result).toEqual([
        { path: '/main.ts', is_dir: false, size: 20 },
        { path: '/checks/', is_dir: true, size: 0 },
      ]);
    });

    it('should reject an RPC directory entry whose name is not a basename', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        entries: [{ name: 'nested/file.ts', type: 'file', size: 1, contentKind: 'text', lineCount: 1 }],
        path: 'src',
      });

      await expect(backend.lsInfo('/src')).rejects.toMatchObject({
        name: 'VirtualPathError',
        code: 'INVALID_PATH',
      });
    });
  });

  describe('read', () => {
    it('should return file content', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue(readFileSuccess('hello world', 1));

      const content = await backend.read('/test.txt');
      expect(content).toBe('hello world');
    });

    it('should pass offset and limit parameters', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue(readFileSuccess('line 5', 10));

      await backend.read('/test.txt', 5, 1);

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { targetFile: 'test.txt', offset: 5, limit: 1 },
        }),
      );
    });

    it('should translate an absolute DeepAgents file path to a project-relative RPC path', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue(readFileSuccess('hello world', 1));

      await backend.read('/src/test.ts');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { targetFile: 'src/test.ts', offset: undefined, limit: undefined },
        }),
      );
    });
  });

  describe('readRaw', () => {
    it('should return FileData with content lines and real timestamps', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue(
        readFileSuccess('line1\nline2\nline3', 3, {
          createdAt: '2026-01-15T10:00:00.000Z',
          modifiedAt: '2026-01-20T14:30:00.000Z',
        }),
      );

      const fileData = await backend.readRaw('/test.txt');

      expect(fileData.content).toEqual(['line1', 'line2', 'line3']);
      expect(fileData.created_at).toBe('2026-01-15T10:00:00.000Z');
      expect(fileData.modified_at).toBe('2026-01-20T14:30:00.000Z');
    });

    it('should use readFile RPC directly instead of delegating to read()', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue(
        readFileSuccess('data', 1, {
          createdAt: '2026-03-01T00:00:00.000Z',
          modifiedAt: '2026-03-01T00:00:00.000Z',
        }),
      );

      await backend.readRaw('/test.txt');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          rpcName: 'read_file',
          args: { targetFile: 'test.txt' },
        }),
      );
    });

    it('should fall back to current time when timestamps are not provided', async () => {
      const before = new Date().toISOString();
      chatRpcService.sendRpcRequest.mockResolvedValue(readFileSuccess('data', 1));

      const fileData = await backend.readRaw('/test.txt');

      expect(fileData.created_at).toBeDefined();
      expect(fileData.modified_at).toBeDefined();
      expect(fileData.created_at >= before).toBe(true);
    });

    it('should translate an absolute DeepAgents file path to a project-relative RPC path', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue(readFileSuccess('data', 1));

      await backend.readRaw('/src/test.ts');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { targetFile: 'src/test.ts' },
        }),
      );
    });
  });

  describe('grepRaw', () => {
    it('should return GrepMatch array', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        matches: [{ file: 'src/a.ts', line: 10, content: 'const x = 1;' }],
        totalMatches: 1,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      });

      const result = await backend.grepRaw('const x', '/src');

      expect(result).toEqual([{ path: '/src/a.ts', line: 10, text: 'const x = 1;' }]);
    });

    it('should handle undefined path and glob', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        matches: [],
        totalMatches: 0,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      });

      await backend.grepRaw('pattern', undefined, undefined);

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { pattern: 'pattern' },
        }),
      );
    });

    it('should translate absolute search input and relative RPC matches across the namespace boundary', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        matches: [{ file: 'src/a.ts', line: 10, content: 'const retained = true;' }],
        totalMatches: 1,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      });

      const result = await backend.grepRaw('retained', '/src', '*.ts');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { pattern: 'retained', path: 'src', glob: '*.ts' },
        }),
      );
      expect(result).toEqual([{ path: '/src/a.ts', line: 10, text: 'const retained = true;' }]);
    });

    it('should translate an explicit DeepAgents root while null still omits the Tau path', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        matches: [],
        totalMatches: 0,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      });

      await backend.grepRaw('pattern', '/');
      expect(chatRpcService.sendRpcRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: { pattern: 'pattern', path: '' } }),
      );

      chatRpcService.sendRpcRequest.mockClear();
      await backend.grepRaw('pattern', null, null);
      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({ args: { pattern: 'pattern' } }),
      );
    });

    it('should reject non-canonical relative RPC match paths', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        matches: [{ file: './src/a.ts', line: 1, content: 'x' }],
        totalMatches: 1,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      });

      await expect(backend.grepRaw('x', '/src')).rejects.toMatchObject({
        name: 'VirtualPathError',
        code: 'INVALID_PATH',
      });
    });
  });

  describe('globInfo', () => {
    it('should use entries with real metadata when available', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        files: ['src/a.ts', 'src/b.ts'],
        entries: [
          {
            path: 'src/a.ts',
            isDirectory: false,
            size: 150,
            contentKind: 'text',
            lineCount: 10,
            modifiedAt: '2026-01-10T08:00:00.000Z',
          },
          {
            path: 'src/b.ts',
            isDirectory: false,
            size: 200,
            contentKind: 'binary',
            modifiedAt: '2026-02-20T12:00:00.000Z',
          },
        ],
        totalFiles: 2,
      });

      const result = await backend.globInfo('**/*.ts', '/src');

      expect(result).toEqual([
        { path: '/src/a.ts', is_dir: false, size: 150, modified_at: '2026-01-10T08:00:00.000Z' },
        { path: '/src/b.ts', is_dir: false, size: 200, modified_at: '2026-02-20T12:00:00.000Z' },
      ]);
    });

    it('should down-convert rich entries to DeepAgents FileInfo without line counts', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        files: ['src/a.ts'],
        entries: [{ path: 'src/a.ts', isDirectory: false, size: 150, contentKind: 'text', lineCount: 10 }],
        totalFiles: 1,
      });

      const result = await backend.globInfo('**/*.ts', '/src');

      expect(result).toEqual([{ path: '/src/a.ts', is_dir: false, size: 150 }]);
      expect(result[0]).not.toHaveProperty('lineCount');
    });

    it('should translate absolute search input and relative RPC entries across the namespace boundary', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        files: ['checks/existing.geospec.ts'],
        entries: [
          {
            path: 'checks/existing.geospec.ts',
            isDirectory: false,
            size: 120,
            contentKind: 'text',
            lineCount: 4,
          },
        ],
        totalFiles: 1,
      });

      const result = await backend.globInfo('**/*.geospec.ts', '/checks');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { pattern: '**/*.geospec.ts', path: 'checks' },
        }),
      );
      expect(result).toEqual([{ path: '/checks/existing.geospec.ts', is_dir: false, size: 120 }]);
    });

    it('should return absolute directory entries with trailing slashes', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        files: ['checks'],
        entries: [{ path: 'checks', isDirectory: true, size: 0 }],
        totalFiles: 1,
      });

      await expect(backend.globInfo('*', '/')).resolves.toEqual([{ path: '/checks/', is_dir: true, size: 0 }]);
      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({ args: { pattern: '*', path: '' } }),
      );
    });

    it('should reject non-canonical relative RPC entry paths', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        files: ['./src/a.ts'],
        entries: [{ path: './src/a.ts', isDirectory: false, size: 1, contentKind: 'text', lineCount: 1 }],
        totalFiles: 1,
      });

      await expect(backend.globInfo('*.ts', '/src')).rejects.toMatchObject({
        name: 'VirtualPathError',
        code: 'INVALID_PATH',
      });
    });
  });

  describe('write', () => {
    it('should write file and return WriteResult with null filesUpdate', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        message: 'File created: test.txt',
        diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: '', modifiedContent: 'data' },
      });

      const result = await backend.write('/test.txt', 'data');

      expect(result).toEqual({
        path: '/test.txt',
        filesUpdate: null,
        metadata: { message: 'File created: test.txt' },
      });
    });

    it('should translate an absolute DeepAgents file path while preserving it in the result', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        message: 'File created: draft.ts',
        diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: '', modifiedContent: 'data' },
      });

      const result = await backend.write('/draft.ts', 'data');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({ args: { targetFile: 'draft.ts', content: 'data' } }),
      );
      expect(result.path).toBe('/draft.ts');
    });
  });

  describe('append', () => {
    it('should translate an absolute DeepAgents file path while preserving it in the result', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        message: 'Appended to draft.ts',
        diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: 'a', modifiedContent: 'ab' },
      });

      const result = await backend.append('/draft.ts', 'b');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({ args: { targetFile: 'draft.ts', content: 'b' } }),
      );
      expect(result.path).toBe('/draft.ts');
    });
  });

  describe('edit', () => {
    it('should delegate to editFile RPC and return EditResult', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        message: 'Replaced 1 occurrence in test.ts',
        occurrences: 1,
      });

      const result = await backend.edit('/test.ts', 'x = 1', 'x = 2');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          rpcName: 'edit_file',
          args: { targetFile: 'test.ts', oldString: 'x = 1', newString: 'x = 2', replaceAll: undefined },
        }),
      );
      expect(result).toEqual({
        path: '/test.ts',
        filesUpdate: null,
        occurrences: 1,
      });
    });

    it('should pass replaceAll flag', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        message: 'Replaced 3 occurrences in test.ts',
        occurrences: 3,
      });

      const result = await backend.edit('/test.ts', 'old', 'new', true);

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { targetFile: 'test.ts', oldString: 'old', newString: 'new', replaceAll: true },
        }),
      );
      expect(result).toEqual({
        path: '/test.ts',
        filesUpdate: null,
        occurrences: 3,
      });
    });

    it('should throw when RPC returns error', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: false,
        errorCode: 'IO_ERROR',
        message: 'String not found in test.ts',
      });

      await expect(backend.edit('/test.ts', 'not found', 'replacement')).rejects.toThrow('String not found in test.ts');
    });

    it('should translate an absolute DeepAgents file path while preserving it in the result', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        occurrences: 1,
      });

      const result = await backend.edit('/draft.ts', 'old', 'new');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            targetFile: 'draft.ts',
            oldString: 'old',
            newString: 'new',
            replaceAll: undefined,
          },
        }),
      );
      expect(result.path).toBe('/draft.ts');
    });
  });
});
