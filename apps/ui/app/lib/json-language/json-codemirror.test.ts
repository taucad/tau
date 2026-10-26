import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { acquireJsonLanguage, JsonBackend } from '#lib/json-language/json-codemirror.js';

type Listener = (event: MessageEvent) => void;

class FakeWorker {
  public static instances: FakeWorker[] = [];
  public static failOnPost = false;
  readonly #listeners = new Map<string, Listener[]>();
  public terminated = false;
  public stall = false;

  public constructor() { FakeWorker.instances.push(this); }

  public addEventListener(type: string, listener: Listener): void {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  public postMessage(message: { id: number; method: string }): void {
    if (FakeWorker.failOnPost) { throw new Error('worker boot post failed'); }
    if (this.stall) { return; }
    queueMicrotask(() => {
      const result = message.method === 'fold' || message.method === 'validate' ? [] : undefined;
      for (const listener of this.#listeners.get('message') ?? []) {
        listener(new MessageEvent('message', { data: { id: message.id, result } }));
      }
    });
  }

  public terminate(): void { this.terminated = true; }

  public fail(): void {
    for (const listener of this.#listeners.get('error') ?? []) { listener(new MessageEvent('error')); }
  }
}

function environment(): EditorLanguageEnvironment {
  return {
    session: mock<EditorLanguageEnvironment['session']>(),
    diagnostics: new EditorDiagnostics(),
    fileManagerRef: mock<EditorLanguageEnvironment['fileManagerRef']>(),
    contentService: mock<EditorLanguageEnvironment['contentService']>(),
    treeService: mock<EditorLanguageEnvironment['treeService']>(),
    fileManager: mock<EditorLanguageEnvironment['fileManager']>(),
    navigate: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances.length = 0;
  FakeWorker.failOnPost = false;
});

describe('JSON worker fatal recovery', () => {
  it('rejects pending requests when its worker fails', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const backend = new JsonBackend(environment());
    const document = new EditorDocument('tau.json', '{}');
    const worker = FakeWorker.instances[0]!;
    worker.stall = true;
    const pending = backend.request('complete', document);
    worker.fail();
    await expect(pending).rejects.toThrow('JSON language worker failed');
    expect(worker.terminated).toBe(true);
  });

  it('rejects an immediate boot failure and allows a later acquire', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const ports = environment();
    const document = new EditorDocument('tau.json', '{}');
    const onFailure = vi.fn();
    FakeWorker.failOnPost = true;
    await expect(acquireJsonLanguage({ document, environment: ports, signal: new AbortController().signal, onFailure })).rejects.toThrow('worker boot post failed');
    expect(onFailure).not.toHaveBeenCalled();
    FakeWorker.failOnPost = false;
    const retry = await acquireJsonLanguage({ document, environment: ports, signal: new AbortController().signal, onFailure });
    expect(FakeWorker.instances).toHaveLength(2);
    retry.dispose();
  });

  it('notifies live split panes and starts a new worker for the same document on retry', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const ports = environment();
    const document = new EditorDocument('tau.json', '{}');
    const leftFailure = vi.fn();
    const rightFailure = vi.fn();
    const abortedFailure = vi.fn();
    const left = await acquireJsonLanguage({ document, environment: ports, signal: new AbortController().signal, onFailure: leftFailure });
    const right = await acquireJsonLanguage({ document, environment: ports, signal: new AbortController().signal, onFailure: rightFailure });
    const aborted = new AbortController();
    await acquireJsonLanguage({ document, environment: ports, signal: aborted.signal, onFailure: abortedFailure });
    aborted.abort();
    expect(FakeWorker.instances).toHaveLength(1);
    const failedWorker = FakeWorker.instances[0]!;
    failedWorker.fail();
    failedWorker.fail();
    expect(leftFailure).toHaveBeenCalledOnce();
    expect(rightFailure).toHaveBeenCalledOnce();
    expect(abortedFailure).not.toHaveBeenCalled();
    const retry = await acquireJsonLanguage({ document, environment: ports, signal: new AbortController().signal });
    expect(FakeWorker.instances).toHaveLength(2);
    left.dispose();
    right.dispose();
    expect(FakeWorker.instances[1]!.terminated).toBe(false);
    retry.dispose();
    expect(FakeWorker.instances[1]!.terminated).toBe(true);
  });
});
