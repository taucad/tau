import { afterAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorState } from '@codemirror/state';
import { acceptCompletion, currentCompletions, setSelectedCompletion, startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { acquireJsonLanguage } from '#lib/json-language/json-codemirror.js';

type WorkerRequest = {
  id: number;
  method: 'validate' | 'complete' | 'hover' | 'format' | 'fold';
  uri: string;
  text: string;
  version: number;
  jsonc: boolean;
  offset?: number;
};
type WorkerResponse = { id: number; result?: unknown; error?: string };

let listener: ((event: MessageEvent<WorkerRequest>) => void) | undefined;

class WorkerBridge {
  public static instance: WorkerBridge | undefined;
  #listener: ((event: MessageEvent<WorkerResponse>) => void) | undefined;

  public constructor() {
    WorkerBridge.instance = this;
  }
  public addEventListener(type: string, callback: (event: MessageEvent<WorkerResponse>) => void): void {
    if (type === 'message') {
      this.#listener = callback;
    }
  }
  public postMessage(request: WorkerRequest): void {
    listener?.(new MessageEvent('message', { data: request }));
  }
  public emit(response: WorkerResponse): void {
    this.#listener?.(new MessageEvent('message', { data: response }));
  }
  public terminate(): void {
    WorkerBridge.instance = undefined;
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

describe('JSON language worker', () => {
  const responses: WorkerResponse[] = [];
  vi.stubGlobal('self', {
    location: globalThis.location,
    addEventListener(_name: string, callback: (event: MessageEvent<WorkerRequest>) => void) {
      listener = callback;
    },
    postMessage(response: WorkerResponse) {
      responses.push(response);
      WorkerBridge.instance?.emit(response);
    },
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('validates a tau.json schema field and permits JSONC comments', async () => {
    await import('#lib/json-language/json-language.worker.js');
    const send = (request: WorkerRequest): void => {
      listener?.({ data: request } as MessageEvent<WorkerRequest>);
    };
    send({ id: 1, method: 'validate', uri: 'file:///tau.json', text: '{"name": 42}', version: 1, jsonc: false });
    await vi.waitFor(() => {
      expect(responses.some((response) => response.id === 1)).toBe(true);
    });
    const invalid = responses.find((response) => response.id === 1);
    expect(invalid?.error).toBeUndefined();
    const diagnostics: unknown = invalid?.result;
    expect(Array.isArray(diagnostics)).toBe(true);
    if (Array.isArray(diagnostics)) {
      expect(diagnostics.length).toBeGreaterThan(0);
    }

    send({
      id: 2,
      method: 'validate',
      uri: 'file:///sample.jsonc',
      text: '// allowed\n{"ok": true}',
      version: 1,
      jsonc: true,
    });
    await vi.waitFor(() => {
      expect(responses.some((response) => response.id === 2)).toBe(true);
    });
    expect(responses.find((response) => response.id === 2)?.result).toEqual([]);
  }, 20_000);

  it('should preserve snippet metadata for schema property completions', async () => {
    await import('#lib/json-language/json-language.worker.js');
    listener?.({
      data: { id: 3, method: 'complete', uri: 'file:///tau.json', text: '{}', version: 1, jsonc: false, offset: 1 },
    } as MessageEvent<WorkerRequest>);
    await vi.waitFor(() => {
      expect(responses.some((response) => response.id === 3)).toBe(true);
    });
    const response = responses.find((entry) => entry.id === 3);
    expect(response?.error).toBeUndefined();
    expect(response?.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'name', isSnippet: true })]),
    );
    expect(JSON.stringify(response?.result)).toContain('$1');
  });

  it('should apply a real JSON schema snippet through the CodeMirror adapter', async () => {
    vi.stubGlobal('Worker', WorkerBridge);
    await import('#lib/json-language/json-language.worker.js');
    const document = new EditorDocument('tau.json', '{}');
    const lease = await acquireJsonLanguage({
      document,
      environment: environment(),
      signal: new AbortController().signal,
    });
    const view = new EditorView({
      state: EditorState.create({ doc: '{}', selection: { anchor: 1 }, extensions: lease.extensions }),
      parent: globalThis.document.body,
    });
    try {
      view.focus();
      expect(startCompletion(view)).toBe(true);
      await vi.waitFor(() => {
        expect(currentCompletions(view.state).some((item) => item.label === 'name')).toBe(true);
      });
      const nameIndex = currentCompletions(view.state).findIndex((item) => item.label === 'name');
      view.dispatch({ effects: setSelectedCompletion(nameIndex) });
      await vi.waitFor(() => {
        expect(acceptCompletion(view)).toBe(true);
      });
      expect(view.state.doc.toString()).toBe('{"name": ""}');
      expect(view.state.selection.main.head).toBe('{"name": "'.length);
    } finally {
      view.destroy();
      lease.dispose();
    }
  });
});
