import { JSONRPCServer } from 'json-rpc-2.0';
import { describe, it, expect, vi } from 'vitest';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { fileType, lspFsErrorCode } from '@taucad/lsp-fs/protocol';

import { serveLanguageFileSystemRequests } from '#language-fs-bridge.js';

describe('serveLanguageFileSystemRequests', () => {
  it('fs/content delegates readFile with a workspace-relative key from file URIs', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array(new ArrayBuffer(2)));
    const server = new JSONRPCServer();
    const paths = new WorkspacePathResolver('/w');
    const disposable = serveLanguageFileSystemRequests(server, {
      fileManager: { readFile },
      treeService: { stat: vi.fn(), listDirectory: vi.fn() } as unknown as FileTreeService,
      proxy: { searchFiles: vi.fn().mockReturnValue([]) },
      paths,
    });

    const response = await server.receive({
      jsonrpc: '2.0',
      id: 1,
      method: 'fs/content',
      params: { uri: 'file:///x/y.txt' },
    });

    expect(readFile).toHaveBeenCalledWith('x/y.txt');
    expect(response && 'result' in response && response.result).toBeDefined();
    const content = response && 'result' in response ? (response.result as { dataBase64: string }) : undefined;
    expect(typeof content?.dataBase64).toBe('string');
    disposable.dispose();
  });

  it('fs/stat maps ENOENT to lsp-fs enoent code', async () => {
    const stat = vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    const server = new JSONRPCServer();
    const paths = new WorkspacePathResolver('/root');
    const disposable = serveLanguageFileSystemRequests(server, {
      fileManager: { readFile: vi.fn() },
      treeService: { stat, listDirectory: vi.fn() } as unknown as FileTreeService,
      proxy: { searchFiles: vi.fn().mockReturnValue([]) },
      paths,
    });

    const response = await server.receive({
      jsonrpc: '2.0',
      id: 2,
      method: 'fs/stat',
      params: { uri: 'file:///missing.txt' },
    });

    expect(stat).toHaveBeenCalledWith('missing.txt');
    expect(response && 'error' in response && response.error?.code).toBe(lspFsErrorCode.fileNotFound);
    disposable.dispose();
  });

  it('fs/readDir delegates listDirectory entries', async () => {
    const listDirectory = vi.fn().mockResolvedValue([
      { name: 'a', path: 'd/a', isFolder: false },
      { name: 'b', path: 'd/b', isFolder: true },
    ]);
    const server = new JSONRPCServer();
    const paths = new WorkspacePathResolver('/root');
    const disposable = serveLanguageFileSystemRequests(server, {
      fileManager: { readFile: vi.fn() },
      treeService: { stat: vi.fn(), listDirectory } as unknown as FileTreeService,
      proxy: { searchFiles: vi.fn().mockReturnValue([]) },
      paths,
    });

    const response = await server.receive({
      jsonrpc: '2.0',
      id: 3,
      method: 'fs/readDir',
      params: { uri: 'file:///d' },
    });

    expect(listDirectory).toHaveBeenCalledWith('d');
    expect(response && 'result' in response && response.result).toEqual([
      ['a', fileType.file],
      ['b', fileType.directory],
    ]);
    disposable.dispose();
  });

  it('fs/findFiles passes max to searchFiles', async () => {
    const searchFiles = vi.fn().mockReturnValue([{ path: 'out.txt' }]);
    const server = new JSONRPCServer();
    const paths = new WorkspacePathResolver('/root');
    const disposable = serveLanguageFileSystemRequests(server, {
      fileManager: { readFile: vi.fn() },
      treeService: { stat: vi.fn(), listDirectory: vi.fn() } as unknown as FileTreeService,
      proxy: { searchFiles },
      paths,
    });

    const response = await server.receive({
      jsonrpc: '2.0',
      id: 4,
      method: 'fs/findFiles',
      params: { pattern: '*.scad', max: 12 },
    });

    expect(searchFiles).toHaveBeenCalledWith('/root', '*.scad', { maxResults: 12, includeDirectories: false });
    expect(response && 'result' in response && response.result).toEqual(['out.txt']);
    disposable.dispose();
  });

  it('dispose removes fs/* handlers', async () => {
    const server = new JSONRPCServer();
    const paths = new WorkspacePathResolver('/root');
    const disposable = serveLanguageFileSystemRequests(server, {
      fileManager: { readFile: vi.fn() },
      treeService: { stat: vi.fn(), listDirectory: vi.fn() } as unknown as FileTreeService,
      proxy: { searchFiles: vi.fn().mockReturnValue([]) },
      paths,
    });

    disposable.dispose();
    const response = await server.receive({
      jsonrpc: '2.0',
      id: 5,
      method: 'fs/content',
      params: { uri: 'file:///a' },
    });
    expect(response && 'error' in response).toBe(true);
  });
});
