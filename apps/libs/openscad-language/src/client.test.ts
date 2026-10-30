import { describe, expect, it, vi } from 'vitest';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { OpenscadLanguageClient, OpenscadLanguageError } from '#client.js';
import type { OpenscadWorkerCommand, OpenscadWorkerEvent } from '#protocol.js';

/** An in-memory Worker that records commands and lets the test emit worker events. */
class FakeWorker extends EventTarget {
  public readonly commands: OpenscadWorkerCommand[] = [];
  public terminated = false;

  public postMessage(command: OpenscadWorkerCommand): void {
    this.commands.push(command);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emit(event: OpenscadWorkerEvent): void {
    this.dispatchEvent(new MessageEvent('message', { data: event }));
  }

  public lspMessages(): Array<{ id?: number; method: string; params: unknown }> {
    return this.commands
      .filter((command): command is Extract<OpenscadWorkerCommand, { type: 'lsp' }> => command.type === 'lsp')
      .map((command) => JSON.parse(command.message) as { id?: number; method: string; params: unknown });
  }
}

const files = new Map([['main.scad', new TextEncoder().encode('cube(1);')]]);

const createClient = (onFatal?: (error: Error) => void): { client: OpenscadLanguageClient; worker: FakeWorker } => {
  const worker = new FakeWorker();
  const client = new OpenscadLanguageClient({
    assets: { url: '/openscad-language/abc/assets-manifest.json', sha256: 'a'.repeat(64) },
    fs: {
      rootDirectory: '/projects/demo',
      paths: new WorkspacePathResolver('/projects/demo'),
      fileManager: {
        readFile: async (path: string) => {
          const bytes = files.get(path);
          if (!bytes) {
            throw new Error(`ENOENT: ${path}`);
          }
          return new Uint8Array(bytes);
        },
      },
      treeService: {
        searchFiles: vi.fn(async () => [{ path: 'main.scad', type: 'file', size: 10, mtimeMs: 0 }]),
      } as unknown as FileTreeService,
    },
    createWorker: () => worker as unknown as Worker,
    onFatal,
  });
  return { client, worker };
};

const answer = (worker: FakeWorker, id: number, payload: Record<string, unknown>): void => {
  worker.emit({ type: 'lsp', message: JSON.stringify({ jsonrpc: '2.0', id, ...payload }) });
};

describe('OpenscadLanguageClient', () => {
  it('boots the worker with the asset identity and the workspace root', () => {
    const { worker } = createClient();
    expect(worker.commands[0]).toEqual({
      type: 'init',
      assets: { url: '/openscad-language/abc/assets-manifest.json', sha256: 'a'.repeat(64) },
      rootDirectory: '/projects/demo',
      filePoolBuffer: undefined,
    });
  });

  it('runs the initialize handshake after the worker is ready', async () => {
    const { client, worker } = createClient();
    const initialized = client.initialize();
    await Promise.resolve();
    expect(worker.lspMessages()).toEqual([]);
    worker.emit({ type: 'ready', files: 1 });
    await vi.waitFor(() => {
      expect(worker.lspMessages()).toHaveLength(1);
    });
    const [initialize] = worker.lspMessages();
    expect(initialize).toMatchObject({ method: 'initialize', params: { capabilities: {} } });
    answer(worker, initialize!.id!, { result: { capabilities: { hoverProvider: true } } });
    await expect(initialized).resolves.toEqual({ capabilities: { hoverProvider: true } });
    expect(client.capabilities).toEqual({ hoverProvider: true });
    expect(worker.lspMessages().at(-1)).toEqual({ jsonrpc: '2.0', method: 'initialized', params: {} });
  });

  it('correlates responses and surfaces server errors with their code', async () => {
    const { client, worker } = createClient();
    const hover = client.request('textDocument/hover', { position: { line: 0, character: 0 } });
    const rename = client.request('textDocument/rename', {});
    const [first, second] = worker.lspMessages();
    answer(worker, second!.id!, { error: { code: -32_803, message: 'This element cannot be renamed.' } });
    answer(worker, first!.id!, { result: null });
    await expect(hover).resolves.toBeUndefined();
    const error = await rename.catch((error: unknown) => error);
    expect(error).toBeInstanceOf(OpenscadLanguageError);
    expect(error).toMatchObject({ code: -32_803, message: 'This element cannot be renamed.' });
  });

  it('serves worker filesystem requests through the project file manager', async () => {
    const { worker } = createClient();
    worker.emit({
      type: 'fs-request',
      request: { jsonrpc: '2.0', id: 7, method: 'fs/content', params: { uri: 'file:///main.scad' } },
    });
    await vi.waitFor(() => {
      expect(worker.commands.some((command) => command.type === 'fs-response')).toBe(true);
    });
    const response = worker.commands.find((command) => command.type === 'fs-response');
    expect(response).toMatchObject({
      response: { id: 7, result: { dataBase64: Buffer.from('cube(1);').toString('base64') } },
    });
    worker.emit({
      type: 'fs-request',
      request: { jsonrpc: '2.0', id: 8, method: 'fs/findFiles', params: { pattern: '.scad' } },
    });
    await vi.waitFor(() => {
      expect(worker.commands.filter((command) => command.type === 'fs-response')).toHaveLength(2);
    });
    expect(worker.commands.at(-1)).toMatchObject({ response: { id: 8, result: ['main.scad'] } });
  });

  it('rejects pending work and reports a worker failure once', async () => {
    const onFatal = vi.fn();
    const { client, worker } = createClient(onFatal);
    const pending = client.request('textDocument/completion', {});
    const ready = client.initialize();
    worker.emit({ type: 'fatal', message: 'manifest integrity mismatch' });
    worker.dispatchEvent(new Event('error'));
    await expect(pending).rejects.toThrow('OpenSCAD language worker failed: manifest integrity mismatch');
    await expect(ready).rejects.toThrow('manifest integrity mismatch');
    expect(onFatal).toHaveBeenCalledTimes(1);
    await expect(client.request('textDocument/hover', {})).rejects.toThrow('manifest integrity mismatch');
    client.notify('textDocument/didOpen', {});
    expect(worker.lspMessages()).toHaveLength(1);
  });

  it('terminates the worker and rejects requests after disposal', async () => {
    const { client, worker } = createClient();
    const pending = client.request('textDocument/hover', {});
    client.refreshWorkspace();
    expect(worker.commands.at(-1)).toEqual({ type: 'refresh' });
    client.dispose();
    client.dispose();
    expect(worker.terminated).toBe(true);
    await expect(pending).rejects.toThrow('OpenSCAD language client disposed');
    await expect(client.request('textDocument/hover', {})).rejects.toThrow('OpenSCAD language client disposed');
    client.refreshWorkspace();
    expect(worker.commands.at(-1)).toEqual({ type: 'refresh' });
  });
});
