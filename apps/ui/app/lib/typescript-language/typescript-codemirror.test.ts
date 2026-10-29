import { describe, expect, it, vi } from 'vitest';
import { TypeScriptWorkerClient } from '@taucad/lsp/typescript-worker/client';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import type { EditorLanguageRequest } from '#lib/editor-language-runtime.js';
import { EditorDocument } from '#lib/editor-document.js';
import { acquireTypeScriptLanguage } from '#lib/typescript-language/typescript-codemirror.js';

const createTypeScriptService = vi.hoisted(() => vi.fn());
// eslint-disable-next-line @typescript-eslint/naming-convention -- Mock the exported environment contract and its configuration key.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_ACQUISITION: 'locked' } }));
vi.mock('#lib/typescript-language/typescript-service.js', () => ({ createTypeScriptService }));
vi.mock('#lib/typescript-language/create-typescript-extensions.js', () => ({
  createTypeScriptExtensions: () => [],
}));
vi.mock('#lib/typescript-language/typescript-rename-participant.js', () => ({
  registerTypeScriptRenameParticipant: () => () => undefined,
}));

describe('TypeScript project worker recovery', () => {
  it('evicts a crashed shared worker and retries from the retained document', async () => {
    const document = new EditorDocument('main.ts', 'const value = 1;');
    const attachedTexts: string[] = [];
    class FaultingWorker extends EventTarget {
      public readonly postMessage = vi.fn();
      public readonly terminate = vi.fn();
    }
    const workers: FaultingWorker[] = [];
    const makeService = (client: TypeScriptWorkerClient) => ({
      attach: vi.fn(async (attached: EditorDocument) => {
        attachedTexts.push(attached.text);
      }),
      detach: vi.fn(async () => undefined),
      dispose: vi.fn(() => {
        client.dispose();
      }),
      client,
    });
    const createdServices: Array<ReturnType<typeof makeService>> = [];
    createTypeScriptService
      .mockReset()
      .mockImplementation(async (options: { onWorkerFailure: (error: Error) => void }) => {
        const worker = new FaultingWorker();
        workers.push(worker);
        const client = new TypeScriptWorkerClient({
          createWorker: () => worker as unknown as Worker,
          onFatal: options.onWorkerFailure,
        });
        const service = makeService(client);
        createdServices.push(service);
        return service;
      });
    const environment = {
      session: {},
      fileManagerRef: {
        getSnapshot: () => ({ matches: (state: string) => state === 'ready', context: { viewClient: {} } }),
      },
    } as unknown as EditorLanguageEnvironment;
    const firstFailure = vi.fn();
    const secondFailure = vi.fn();
    const makeRequest = (onFailure: (error: Error) => void): EditorLanguageRequest => ({
      languageId: 'typescript',
      document,
      environment,
      signal: new AbortController().signal,
      onFailure,
    });
    const first = await acquireTypeScriptLanguage(makeRequest(firstFailure));
    const split = await acquireTypeScriptLanguage(makeRequest(secondFailure));
    expect(createTypeScriptService).toHaveBeenCalledTimes(1);

    const pending = createdServices[0]?.client.request({ kind: 'diagnostics', uri: document.uri });
    const pendingFailure = expect(pending).rejects.toThrow('worker crashed');
    const failure = new Event('error');
    Object.defineProperty(failure, 'message', { value: 'worker crashed' });
    workers[0]?.dispatchEvent(failure);
    await pendingFailure;
    await Promise.resolve();
    expect(firstFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'worker crashed' }));
    expect(secondFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'worker crashed' }));
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    await expect(createdServices[0]?.client.request({ kind: 'diagnostics', uri: document.uri })).rejects.toThrow();
    expect(workers[0]?.postMessage).toHaveBeenCalledTimes(2);
    expect(createdServices[0]?.dispose).toHaveBeenCalledOnce();
    document.apply({ expectedVersion: 1, origin: 'view', changes: [{ from: 14, to: 15, insert: '2' }] });

    const retry = await acquireTypeScriptLanguage(makeRequest(vi.fn()));
    expect(createTypeScriptService).toHaveBeenCalledTimes(2);
    expect(workers).toHaveLength(2);
    expect(attachedTexts).toEqual(['const value = 1;', 'const value = 1;', 'const value = 2;']);
    expect(document.text).toBe('const value = 2;');
    retry.dispose();
    split.dispose();
    first.dispose();
  });
});
