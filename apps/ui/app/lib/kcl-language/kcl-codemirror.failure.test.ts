import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { acquireKclLanguage } from '#lib/kcl-language/kcl-codemirror.js';

const worker = vi.hoisted(() => ({
  constructed: 0,
  failures: [] as Array<(error: Error) => void>,
  opened: [] as string[],
  closed: [] as string[],
  failDuringBoot: false,
}));

vi.mock('#lib/kcl-language/lsp/kcl-lsp-client.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock the exported LSP client class name.
  KclLspClient: class {
    readonly #onError: (error: Error) => void;
    public constructor(options: { onError?: (error: Error) => void }) {
      worker.constructed += 1;
      this.#onError = options.onError ?? (() => undefined);
      worker.failures.push(this.#onError);
    }
    public async initialize(): Promise<void> {
      if (worker.failDuringBoot) {
        const error = new Error('worker failed during boot');
        this.#onError(error);
        throw error;
      }
    }
    public async waitForReady(): Promise<void> {
      /* Fake transport is immediately ready. */
    }
    public getServerCapabilities(): { textDocumentSync: number } {
      return { textDocumentSync: 1 };
    }
    public setCurrentDocumentUri(): void {
      /* The test observes didOpen. */
    }
    public textDocumentDidOpen(parameters: { textDocument: { uri: string } }): void {
      worker.opened.push(parameters.textDocument.uri);
    }
    public textDocumentDidClose(parameters: { textDocument: { uri: string } }): void {
      worker.closed.push(parameters.textDocument.uri);
    }
    public textDocumentDidChange(): void {
      /* Not needed for crash recovery. */
    }
    public dispose(): void {
      /* Crash callback owns the lease cleanup. */
    }
    public async parseKcl(): Promise<unknown> {
      throw new Error('test parser unavailable');
    }
  },
}));

function environment(): EditorLanguageEnvironment {
  const fileManagerRef = mock<EditorLanguageEnvironment['fileManagerRef']>();
  const snapshot = mock<ReturnType<typeof fileManagerRef.getSnapshot>>({
    context: mock<ReturnType<typeof fileManagerRef.getSnapshot>['context']>({ rootDirectory: '/workspace' }),
  });
  fileManagerRef.getSnapshot.mockReturnValue(snapshot);
  return {
    session: mock<EditorLanguageEnvironment['session']>(),
    diagnostics: new EditorDiagnostics(),
    fileManagerRef,
    contentService: mock<EditorLanguageEnvironment['contentService']>(),
    treeService: mock<EditorLanguageEnvironment['treeService']>(),
    fileManager: mock<EditorLanguageEnvironment['fileManager']>(),
    navigate: vi.fn(),
  };
}

describe('KCL fatal worker recovery', () => {
  it('notifies every live split pane and creates a fresh worker for the same document on retry', async () => {
    worker.constructed = 0;
    worker.failures.length = 0;
    worker.opened.length = 0;
    worker.closed.length = 0;
    worker.failDuringBoot = false;
    const ports = environment();
    const document = new EditorDocument('main.kcl', 'value = 1');
    const leftFailure = vi.fn();
    const rightFailure = vi.fn();
    const left = await acquireKclLanguage({
      document,
      environment: ports,
      signal: new AbortController().signal,
      onFailure: leftFailure,
    });
    const right = await acquireKclLanguage({
      document,
      environment: ports,
      signal: new AbortController().signal,
      onFailure: rightFailure,
    });
    expect(worker.constructed).toBe(1);
    expect(worker.opened).toEqual([document.uri]);

    worker.failures[0]?.(new Error('worker crashed'));
    worker.failures[0]?.(new Error('duplicate worker error'));
    expect(leftFailure).toHaveBeenCalledOnce();
    expect(rightFailure).toHaveBeenCalledOnce();
    expect(worker.closed).not.toContain(document.uri);

    const retryFailure = vi.fn();
    const retry = await acquireKclLanguage({
      document,
      environment: ports,
      signal: new AbortController().signal,
      onFailure: retryFailure,
    });
    expect(worker.constructed).toBe(2);
    expect(worker.opened).toEqual([document.uri, document.uri]);
    expect(retryFailure).not.toHaveBeenCalled();
    left.dispose();
    right.dispose();
    retry.dispose();
  });

  it('rejects boot failure without a post-ready signal and retries after the worker is replaced', async () => {
    worker.failDuringBoot = true;
    const ports = environment();
    const document = new EditorDocument('boot.kcl', 'value = 1');
    const onFailure = vi.fn();
    await expect(
      acquireKclLanguage({ document, environment: ports, signal: new AbortController().signal, onFailure }),
    ).rejects.toThrow('worker failed during boot');
    expect(onFailure).not.toHaveBeenCalled();
    worker.failDuringBoot = false;
    const retry = await acquireKclLanguage({
      document,
      environment: ports,
      signal: new AbortController().signal,
      onFailure,
    });
    expect(worker.opened).toContain(document.uri);
    retry.dispose();
  });
});
