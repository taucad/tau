import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import type { Completion } from '@codemirror/autocomplete';
import type * as LSP from 'vscode-languageserver-protocol';
import { goToDefinitionAt } from '#components/code/editor-definition.js';
import { EditorDocument } from '#lib/editor-document.js';
import type { TextChange } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import {
  acquireCsharpLanguage,
  CsharpBackend,
  csharpCompletion,
  csharpExtensions,
  csharpHover,
  offsetAt,
  positionAt,
} from '#lib/csharp-language/csharp-codemirror.js';
import type { CsharpClient } from '#lib/csharp-language/csharp-codemirror.js';

type Handler = (method: string, params: unknown) => unknown;

function fakeClient(handler: Handler): CsharpClient & { notify: Mock<CsharpClient['notify']> } {
  return {
    initialize: vi.fn(async () => ({ capabilities: {} })),
    request: vi.fn(async (method: string, params: unknown) => handler(method, params)) as CsharpClient['request'],
    notify: vi.fn<CsharpClient['notify']>(),
    refreshWorkspace: vi.fn(),
    dispose: vi.fn(),
  };
}

function environmentFor(navigate = vi.fn()): EditorLanguageEnvironment {
  const treeService = mock<EditorLanguageEnvironment['treeService']>();
  treeService.subscribeTree.mockReturnValue(() => undefined);
  return {
    session: mock<EditorLanguageEnvironment['session']>(),
    diagnostics: new EditorDiagnostics(),
    fileManagerRef: mock<EditorLanguageEnvironment['fileManagerRef']>(),
    contentService: mock<EditorLanguageEnvironment['contentService']>(),
    treeService,
    fileManager: mock<EditorLanguageEnvironment['fileManager']>(),
    navigate,
  };
}

/** A view whose transactions also apply to the session document, as a mounted code pane does. */
function boundView(document: EditorDocument, extensions: Extension[] = []): EditorView {
  return new EditorView({
    state: EditorState.create({ doc: document.text, selection: { anchor: document.text.length }, extensions }),
    parent: globalThis.document.body,
    dispatchTransactions: (transactions, view) => {
      view.update(transactions);
      for (const transaction of transactions) {
        const changes: TextChange[] = [];
        // oxlint-disable-next-line max-params -- CodeMirror's iterator supplies five positional values.
        transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
          changes.push({ from, to, insert: inserted.toString() });
        });
        if (changes.length > 0) {
          document.apply({ expectedVersion: document.version, origin: 'view', changes });
        }
      }
    },
  });
}

function range(line: number, start: number, end = start): LSP.Range {
  return { start: { line, character: start }, end: { line, character: end } };
}

function applyCompletion(view: EditorView, completion: Completion, from: number): void {
  const { apply } = completion;
  if (typeof apply !== 'function') {
    throw new TypeError('C# completions apply through a function');
  }
  apply(view, completion, from, view.state.doc.length);
}

describe('C# positions', () => {
  it('maps LSP positions and offsets in both directions', () => {
    const text = 'using PicoGK;\nvar v = 1;\n';
    expect(positionAt(text, text.indexOf('v ='))).toEqual({ line: 1, character: 4 });
    expect(offsetAt(text, { line: 1, character: 4 })).toBe(text.indexOf('v ='));
    expect(offsetAt(text, { line: 9, character: 0 })).toBe(text.length);
  });
});

describe('C# language acquisition', () => {
  it('keeps syntax editing only when the build staged no C# bundle', async () => {
    const createBackend = vi.fn();
    const lease = await acquireCsharpLanguage({
      document: new EditorDocument('main.cs', ''),
      environment: environmentFor(),
      signal: new AbortController().signal,
      assets: undefined,
      createBackend,
    });
    expect(lease.extensions).toEqual([]);
    expect(createBackend).not.toHaveBeenCalled();
  });

  it('shares one backend per session and stops it with the last pane', async () => {
    const environment = environmentFor();
    const client = fakeClient(() => ({ kind: 'full', items: [] }));
    const createBackend = vi.fn(() => new CsharpBackend(environment, { client }));
    const assets = { url: '/csharp-language/a/assets-manifest.json', sha256: 'a'.repeat(64) };
    const acquire = async (path: string) =>
      acquireCsharpLanguage({
        document: new EditorDocument(path, 'var x = 1;'),
        environment,
        signal: new AbortController().signal,
        assets,
        createBackend,
      });
    const first = await acquire('a.cs');
    const second = await acquire('b.cs');
    expect(createBackend).toHaveBeenCalledTimes(1);
    expect(client.notify).toHaveBeenCalledWith('textDocument/didOpen', expect.objectContaining({}));
    first.dispose();
    expect(client.dispose).not.toHaveBeenCalled();
    second.dispose();
    expect(client.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('C# backend', () => {
  it('syncs multi-range edits incrementally and publishes pulled diagnostics', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const environment = environmentFor();
    const client = fakeClient((method) =>
      method === 'textDocument/diagnostic'
        ? { kind: 'full', items: [{ range: range(0, 4, 5), message: 'CS0103', severity: 1 }] }
        : undefined,
    );
    const backend = new CsharpBackend(environment, { client });
    const document = new EditorDocument('main.cs', 'var a;\nvar b;\n');
    try {
      await backend.initialize();
      backend.retain(document);
      document.apply({
        expectedVersion: document.version,
        origin: 'view',
        changes: [
          { from: 4, to: 5, insert: 'first' },
          { from: 11, to: 12, insert: 'second' },
        ],
      });
      expect(document.text).toBe('var first;\nvar second;\n');
      const [, change] = client.notify.mock.calls.find(([method]) => method === 'textDocument/didChange') as [
        string,
        LSP.DidChangeTextDocumentParams,
      ];
      let text = 'var a;\nvar b;\n';
      for (const content of change.contentChanges) {
        if (!('range' in content)) {
          throw new TypeError('C# changes are incremental');
        }
        text = `${text.slice(0, offsetAt(text, content.range.start))}${content.text}${text.slice(offsetAt(text, content.range.end))}`;
      }
      expect(text).toBe(document.text);
      await vi.advanceTimersByTimeAsync(250);
      await vi.waitFor(() => {
        expect(environment.diagnostics.get(document.uri).get('csharp-lsp')).toEqual([
          { from: 4, to: 5, message: 'CS0103', severity: 'error', source: undefined, code: undefined },
        ]);
      });
      backend.release(document);
      expect(environment.diagnostics.get(document.uri).size).toBe(0);
      expect(client.dispose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('C# completion', () => {
  const usingEdit: LSP.TextEdit = { range: range(0, 0), newText: 'using System.Numerics;\n\n' };

  it('adds the using directive of an accepted unimported type', async () => {
    const source = 'var v = Vec';
    const document = new EditorDocument('main.cs', source);
    const item: LSP.CompletionItem = {
      label: 'Vector3',
      detail: 'System.Numerics',
      textEdit: { range: range(0, 8, 11), newText: 'Vector3' },
    };
    const client = fakeClient((method) =>
      method === 'completionItem/resolve' ? { ...item, additionalTextEdits: [usingEdit] } : undefined,
    );
    const view = boundView(document);
    try {
      const completion = csharpCompletion(item, document.version, {
        client,
        document,
        environment: environmentFor(),
        isDisposed: () => false,
      });
      applyCompletion(view, completion, 8);
      await vi.waitFor(() => {
        expect(document.text).toBe('using System.Numerics;\n\nvar v = Vector3');
      });
      expect(view.state.doc.toString()).toBe(document.text);
    } finally {
      view.destroy();
    }
  });

  it('asks for the same item at the current text when typing narrowed the open list', async () => {
    const source = 'var v = Vec';
    const document = new EditorDocument('main.cs', source);
    const stale: LSP.CompletionItem = {
      label: 'Vector3',
      detail: 'System.Numerics',
      textEdit: { range: range(0, 8, 11), newText: 'Vector3' },
      data: { resultId: 1 },
    };
    const current: LSP.CompletionItem = {
      ...stale,
      textEdit: { range: range(0, 8, 13), newText: 'Vector3' },
      data: { resultId: 2 },
    };
    const requests: Array<[string, unknown]> = [];
    const client = fakeClient((method, params) => {
      requests.push([method, params]);
      if (method === 'textDocument/completion') {
        return { isIncomplete: false, items: [{ label: 'Vector2', detail: 'System.Numerics' }, current] };
      }
      // The server drops a stale item's edits; only the current one resolves its using directive.
      return (params as LSP.CompletionItem).data?.resultId === 2
        ? { ...current, additionalTextEdits: [usingEdit] }
        : params;
    });
    const view = boundView(document);
    try {
      const completion = csharpCompletion(stale, document.version, {
        client,
        document,
        environment: environmentFor(),
        isDisposed: () => false,
      });
      view.dispatch({ changes: { from: source.length, insert: 'to' } });
      applyCompletion(view, completion, 8);
      await vi.waitFor(() => {
        expect(document.text).toBe('using System.Numerics;\n\nvar v = Vector3');
      });
      expect(requests[0]).toEqual([
        'textDocument/completion',
        { textDocument: { uri: document.uri }, position: { line: 0, character: 13 } },
      ]);
    } finally {
      view.destroy();
    }
  });
});

describe('C# navigation', () => {
  const metadataUri = 'file:///__csharp_metadata__/PicoGK/PicoGK.Voxels.cs';

  it('opens project definitions in the editor and library definitions as declarations', async () => {
    const navigate = vi.fn();
    const environment = environmentFor(navigate);
    const document = new EditorDocument('main.cs', 'var a = ShapeFactory.Create(1f);\nvar b = Voxels.voxSphere();\n');
    const client = fakeClient((method, params) => {
      if (method === 'textDocument/definition') {
        const { position } = params as LSP.DefinitionParams;
        return position.line === 0
          ? [{ uri: 'file:///ShapeFactory.cs', range: range(8, 25) }]
          : [{ uri: metadataUri, range: range(12, 4) }];
      }
      if (method === 'tau/metadataSource') {
        return { uri: metadataUri, text: 'namespace PicoGK;' };
      }
      return undefined;
    });
    const view = boundView(document, csharpExtensions({ client, document, environment, isDisposed: () => false }));
    try {
      expect(goToDefinitionAt(view, document.text.indexOf('Create'))).toBe(true);
      await vi.waitFor(() => {
        expect(navigate).toHaveBeenCalledWith({ uri: 'file:///ShapeFactory.cs', line: 9, column: 26 });
      });
      expect(goToDefinitionAt(view, document.text.indexOf('voxSphere'))).toBe(true);
      await vi.waitFor(() => {
        expect(navigate).toHaveBeenCalledWith({
          uri: metadataUri,
          line: 13,
          column: 5,
          declaration: { text: 'namespace PicoGK;' },
        });
      });
    } finally {
      view.destroy();
    }
  });

  it('renders documentation references as links that open their definitions', async () => {
    const navigate = vi.fn();
    const environment = environmentFor(navigate);
    const document = new EditorDocument('main.cs', 'var shapes = Wrapper.Make();\n');
    const client = fakeClient((method) => {
      if (method === 'textDocument/hover') {
        return {
          contents: {
            kind: 'markdown',
            value:
              '```csharp\nclass Wrapper\n```\n\nWraps [`ShapeFactory.Create`](#tau-definition-0) into [`Voxels`](#tau-definition-1).',
          },
          range: range(0, 13, 20),
          definitionTargets: [
            { uri: 'file:///ShapeFactory.cs', range: range(8, 25) },
            { uri: metadataUri, range: range(3, 0) },
          ],
        };
      }
      return method === 'tau/metadataSource' ? { uri: metadataUri, text: '// PicoGK' } : undefined;
    });
    const view = boundView(document);
    try {
      const tooltip = (await csharpHover({ client, document, environment, isDisposed: () => false })(
        view,
        15,
        1,
      )) as Tooltip;
      expect(tooltip).toMatchObject({ pos: 13, end: 20 });
      const { dom } = tooltip.create(view);
      const links = [...dom.querySelectorAll('a')];
      expect(links.map((link) => link.textContent)).toEqual(['ShapeFactory.Create', 'Voxels']);

      links[0]!.click();
      await vi.waitFor(() => {
        expect(navigate).toHaveBeenCalledWith({ uri: 'file:///ShapeFactory.cs', line: 9, column: 26 });
      });
      links[1]!.click();
      await vi.waitFor(() => {
        expect(navigate).toHaveBeenLastCalledWith({
          uri: metadataUri,
          line: 4,
          column: 1,
          declaration: { text: '// PicoGK' },
        });
      });
    } finally {
      view.destroy();
    }
  });
});
