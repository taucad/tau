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

  beforeEach(() => {
    chatRpcService = mock<ChatRpcService>();
    backend = new TauRpcBackend(chatRpcService, 'chat-1', 'tool-call-1');
  });

  describe('lsInfo', () => {
    it('should list directory entries as FileInfo objects with metadata', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        entries: [
          { name: 'file.ts', type: 'file', size: 100, modifiedAt: '2026-01-15T10:00:00.000Z' },
          { name: 'subdir', type: 'dir', size: 0 },
        ],
        path: 'src',
      });

      const result = await backend.lsInfo('src');

      expect(result).toEqual([
        { path: 'src/file.ts', is_dir: false, size: 100, modified_at: '2026-01-15T10:00:00.000Z' },
        { path: 'src/subdir', is_dir: true, size: 0 },
      ]);
    });

    it('should throw on RPC error', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        errorCode: 'NO_CONNECTION',
        message: 'Disconnected',
        rpcName: 'list_directory',
      });

      await expect(backend.lsInfo('src')).rejects.toThrow('Disconnected');
    });
  });

  describe('read', () => {
    it('should return file content', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        content: 'hello world',
        totalLines: 1,
      });

      const content = await backend.read('test.txt');
      expect(content).toBe('hello world');
    });

    it('should pass offset and limit parameters', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        content: 'line 5',
        totalLines: 10,
      });

      await backend.read('test.txt', 5, 1);

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { targetFile: 'test.txt', offset: 5, limit: 1 },
        }),
      );
    });
  });

  describe('readRaw', () => {
    it('should return FileData with content lines and real timestamps', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        content: 'line1\nline2\nline3',
        totalLines: 3,
        createdAt: '2026-01-15T10:00:00.000Z',
        modifiedAt: '2026-01-20T14:30:00.000Z',
      });

      const fileData = await backend.readRaw('test.txt');

      expect(fileData.content).toEqual(['line1', 'line2', 'line3']);
      expect(fileData.created_at).toBe('2026-01-15T10:00:00.000Z');
      expect(fileData.modified_at).toBe('2026-01-20T14:30:00.000Z');
    });

    it('should use readFile RPC directly instead of delegating to read()', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        content: 'data',
        totalLines: 1,
        createdAt: '2026-03-01T00:00:00.000Z',
        modifiedAt: '2026-03-01T00:00:00.000Z',
      });

      await backend.readRaw('test.txt');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          rpcName: 'read_file',
          args: { targetFile: 'test.txt' },
        }),
      );
    });

    it('should fall back to current time when timestamps are not provided', async () => {
      const before = new Date().toISOString();
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        content: 'data',
        totalLines: 1,
      });

      const fileData = await backend.readRaw('test.txt');

      expect(fileData.created_at).toBeDefined();
      expect(fileData.modified_at).toBeDefined();
      expect(fileData.created_at >= before).toBe(true);
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

      const result = await backend.grepRaw('const x', 'src');

      expect(result).toEqual([{ path: 'src/a.ts', line: 10, text: 'const x = 1;' }]);
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
  });

  describe('globInfo', () => {
    it('should use entries with real metadata when available', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        files: ['src/a.ts', 'src/b.ts'],
        entries: [
          { path: 'src/a.ts', isDirectory: false, size: 150, modifiedAt: '2026-01-10T08:00:00.000Z' },
          { path: 'src/b.ts', isDirectory: false, size: 200, modifiedAt: '2026-02-20T12:00:00.000Z' },
        ],
        totalFiles: 2,
      });

      const result = await backend.globInfo('**/*.ts', 'src');

      expect(result).toEqual([
        { path: 'src/a.ts', is_dir: false, size: 150, modified_at: '2026-01-10T08:00:00.000Z' },
        { path: 'src/b.ts', is_dir: false, size: 200, modified_at: '2026-02-20T12:00:00.000Z' },
      ]);
    });

    it('should fall back to bare file paths when entries are not available', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        files: ['src/a.ts', 'src/b.ts'],
        totalFiles: 2,
      });

      const result = await backend.globInfo('**/*.ts', 'src');

      expect(result).toEqual([
        { path: 'src/a.ts', is_dir: false },
        { path: 'src/b.ts', is_dir: false },
      ]);
    });
  });

  describe('write', () => {
    it('should write file and return WriteResult with null filesUpdate', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        message: 'File created: test.txt',
        diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: '', modifiedContent: 'data' },
      });

      const result = await backend.write('test.txt', 'data');

      expect(result).toEqual({
        path: 'test.txt',
        filesUpdate: null,
        metadata: { message: 'File created: test.txt' },
      });
    });
  });

  describe('edit', () => {
    it('should delegate to editFile RPC and return EditResult', async () => {
      chatRpcService.sendRpcRequest.mockResolvedValue({
        success: true,
        message: 'Replaced 1 occurrence in test.ts',
        occurrences: 1,
      });

      const result = await backend.edit('test.ts', 'x = 1', 'x = 2');

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          rpcName: 'edit_file',
          args: { targetFile: 'test.ts', oldString: 'x = 1', newString: 'x = 2', replaceAll: undefined },
        }),
      );
      expect(result).toEqual({
        path: 'test.ts',
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

      const result = await backend.edit('test.ts', 'old', 'new', true);

      expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { targetFile: 'test.ts', oldString: 'old', newString: 'new', replaceAll: true },
        }),
      );
      expect(result).toEqual({
        path: 'test.ts',
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

      await expect(backend.edit('test.ts', 'not found', 'replacement')).rejects.toThrow('String not found in test.ts');
    });
  });
});
