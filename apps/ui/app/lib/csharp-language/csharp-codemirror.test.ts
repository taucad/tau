import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import type { Completion } from '@codemirror/autocomplete';
import { foldable } from '@codemirror/language';
import type * as LSP from 'vscode-languageserver-protocol';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { FileEntry, FileStatEntry } from '@taucad/types';
import { goToDefinitionAt } from '#components/code/editor-definition.js';
import {
  formatDocument,
  languageFeatureNavigation,
  quickFix,
  renameSymbol,
  triggerParameterHints,
} from '#components/code/editor-language-features.js';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorDocumentSession } from '#lib/editor-document-session.js';
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

const encoder = new TextEncoder();

/** A project whose files load through a real editor session, so checked workspace edits change and save them. */
function workspaceFor(files: Readonly<Record<string, string>>) {
  const stored = new Map(Object.entries(files).map(([path, text]) => [path, encoder.encode(text)]));
  const contentService = mock<FileContentService>();
  contentService.resolve.mockImplementation(async (path) => ({ kind: 'text', content: stored.get(path)! }));
  contentService.saveEditor.mockImplementation(async (path, content) => {
    stored.set(path, content);
  });
  contentService.peekOutcome.mockImplementation((path) => ({ kind: 'text', content: stored.get(path)! }));
  contentService.onDidContentChange.mockReturnValue(() => undefined);
  contentService.onDidChangeOutcome.mockReturnValue(() => undefined);
  const entry = (path: string): FileEntry & FileStatEntry => ({
    type: 'file',
    path,
    name: path,
    size: stored.get(path)?.length ?? 0,
    contentKind: 'text',
    lineCount: 1,
    isLoaded: true,
    mtimeMs: 0,
  });
  const treeService = mock<FileTreeService>();
  treeService.subscribeTree.mockReturnValue(() => undefined);
  treeService.getEntry.mockImplementation(async (path) => entry(path));
  treeService.searchFiles.mockImplementation(async (query) =>
    Object.keys(files)
      .filter((path) => path.endsWith(query))
      .map((path) => entry(path)),
  );
  const fileManagerRef = mock<EditorLanguageEnvironment['fileManagerRef']>();
  fileManagerRef.getSnapshot.mockReturnValue({
    context: { rootDirectory: '/project' },
  } as ReturnType<EditorLanguageEnvironment['fileManagerRef']['getSnapshot']>);
  const session = new EditorDocumentSession({ contentService, projectId: 'test' });
  const environment: EditorLanguageEnvironment = {
    session,
    diagnostics: new EditorDiagnostics(),
    fileManagerRef,
    contentService,
    treeService,
    fileManager: mock<EditorLanguageEnvironment['fileManager']>(),
    navigate: vi.fn(),
  };
  return { environment, session, stored };
}

/** Submit the open CodeMirror dialog, after `fill` sets its control. */
async function submitDialog(view: EditorView, fill: (form: HTMLFormElement) => void): Promise<void> {
  await vi.waitFor(() => {
    expect(view.dom.querySelector('.cm-dialog form')).not.toBeNull();
  });
  const form = view.dom.querySelector<HTMLFormElement>('.cm-dialog form')!;
  fill(form);
  form.requestSubmit();
}

describe('C# rename', () => {
  const main = 'var shape = Shapes.Ball(1f);\n';
  const shapes = 'static class Shapes\n{\n    public static int Ball(float r) => 1;\n}\n';

  function renameServer(versionOf: (document: EditorDocument) => number) {
    return (document: EditorDocument) =>
      fakeClient((method) => {
        if (method === 'textDocument/prepareRename') {
          return { range: range(0, 19, 23), placeholder: 'Ball' };
        }
        if (method === 'textDocument/rename') {
          return {
            documentChanges: [
              {
                textDocument: { uri: document.uri, version: versionOf(document) },
                edits: [{ range: range(0, 19, 23), newText: 'Sphere' }],
              },
              {
                textDocument: { uri: 'file:///Shapes.cs', version: null },
                edits: [{ range: range(2, 22, 26), newText: 'Sphere' }],
              },
            ],
          };
        }
        return undefined;
      });
  }

  it('renames across files with versioned edits checked against the request-time sources', async () => {
    const { environment, session, stored } = workspaceFor({ 'main.cs': main, 'Shapes.cs': shapes });
    const document = (await session.acquire('main.cs'))!;
    const client = renameServer((current) => current.version)(document);
    const view = boundView(document, csharpExtensions({ client, document, environment, isDisposed: () => false }));
    try {
      view.dispatch({ selection: { anchor: main.indexOf('Ball') + 1 } });
      expect(renameSymbol(view)).toBe(true);
      await submitDialog(view, (form) => {
        form.querySelector('input')!.value = 'Sphere';
      });
      await vi.waitFor(() => {
        expect(new TextDecoder().decode(stored.get('Shapes.cs'))).toContain('public static int Sphere(float r)');
      });
      expect(document.text).toBe('var shape = Shapes.Sphere(1f);\n');
      expect(new TextDecoder().decode(stored.get('main.cs'))).toBe(document.text);
      expect(client.request).toHaveBeenCalledWith('textDocument/rename', {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 20 },
        newName: 'Sphere',
      });
    } finally {
      view.destroy();
      session.dispose();
    }
  });

  it('refuses a rename the server computed against another version of the open file', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { environment, session, stored } = workspaceFor({ 'main.cs': main, 'Shapes.cs': shapes });
    const document = (await session.acquire('main.cs'))!;
    const client = renameServer((current) => current.version - 1)(document);
    const view = boundView(document, csharpExtensions({ client, document, environment, isDisposed: () => false }));
    try {
      view.dispatch({ selection: { anchor: main.indexOf('Ball') + 1 } });
      renameSymbol(view);
      await submitDialog(view, (form) => {
        form.querySelector('input')!.value = 'Sphere';
      });
      await vi.waitFor(() => {
        expect(String(warn.mock.calls.at(-1)?.[1])).toContain('stale document version');
      });
      expect(document.text).toBe(main);
      expect(new TextDecoder().decode(stored.get('Shapes.cs'))).toBe(shapes);
    } finally {
      view.destroy();
      session.dispose();
      warn.mockRestore();
    }
  });
});

describe('C# formatting and quick fixes', () => {
  it('formats the document with the editor indentation', async () => {
    const source = 'class A{int x;}\n';
    const { environment, session } = workspaceFor({ 'main.cs': source });
    const document = (await session.acquire('main.cs'))!;
    const client = fakeClient((method) =>
      method === 'textDocument/formatting'
        ? [
            { range: range(0, 7, 8), newText: '\n{\n  ' },
            { range: range(0, 14, 15), newText: '\n}' },
          ]
        : undefined,
    );
    const view = boundView(document, csharpExtensions({ client, document, environment, isDisposed: () => false }));
    try {
      expect(formatDocument(view)).toBe(true);
      await vi.waitFor(() => {
        expect(document.text).toBe('class A\n{\n  int x;\n}\n');
      });
      expect(client.request).toHaveBeenCalledWith('textDocument/formatting', {
        textDocument: { uri: document.uri },
        options: { tabSize: 4, insertSpaces: true },
      });
    } finally {
      view.destroy();
      session.dispose();
    }
  });

  it('resolves and applies the chosen quick fix for the diagnostic at the cursor', async () => {
    const source = 'class Fix { object O = Vector3.Zero; }';
    const { environment, session } = workspaceFor({ 'fix.cs': source });
    const document = (await session.acquire('fix.cs'))!;
    environment.diagnostics.set(document.uri, 'csharp-lsp', [
      { from: 23, to: 30, message: "The name 'Vector3' does not exist", severity: 'error', code: 'CS0103' },
    ]);
    const action = { title: 'using System.Numerics;', kind: 'quickfix', data: { resultId: 1, index: 0 } };
    const client = fakeClient((method) => {
      if (method === 'textDocument/codeAction') {
        return [{ title: 'Generate field', kind: 'quickfix', data: { resultId: 1, index: 1 } }, action];
      }
      if (method === 'codeAction/resolve') {
        return {
          ...action,
          edit: {
            documentChanges: [
              {
                textDocument: { uri: document.uri, version: document.version },
                edits: [{ range: range(0, 0), newText: 'using System.Numerics;\n\n' }],
              },
            ],
          },
        };
      }
      return undefined;
    });
    const view = boundView(document, csharpExtensions({ client, document, environment, isDisposed: () => false }));
    try {
      view.dispatch({ selection: { anchor: 25 } });
      expect(quickFix(view)).toBe(true);
      await submitDialog(view, (form) => {
        form.querySelector('select')!.value = '1';
      });
      await vi.waitFor(() => {
        expect(document.text).toBe(`using System.Numerics;\n\n${source}`);
      });
      expect(client.request).toHaveBeenCalledWith('textDocument/codeAction', {
        textDocument: { uri: document.uri },
        range: { start: { line: 0, character: 25 }, end: { line: 0, character: 25 } },
        context: {
          diagnostics: [
            {
              range: range(0, 23, 30),
              message: "The name 'Vector3' does not exist",
              severity: 1,
              source: undefined,
              code: 'CS0103',
            },
          ],
        },
      });
      expect(client.request).toHaveBeenCalledWith('codeAction/resolve', action);
    } finally {
      view.destroy();
      session.dispose();
    }
  });
});

describe('C# signature help', () => {
  const help: LSP.SignatureHelp = {
    signatures: [
      {
        label: 'Voxels Shapes.Ball(float radius)',
        documentation: { kind: 'markdown', value: 'A ball at the origin.' },
        parameters: [{ label: [19, 31], documentation: { kind: 'markdown', value: 'The radius in mm.' } }],
        activeParameter: 0,
      },
      {
        label: 'Voxels Shapes.Ball(float radius, Vector3 center)',
        parameters: [{ label: [19, 31] }, { label: [33, 47] }],
      },
    ],
    activeSignature: 0,
    activeParameter: 0,
  };

  it('opens on the server trigger characters and on Mod-Shift-Space', async () => {
    // The jsdom environment has no text layout; the tooltip measures its anchor through Range rectangles.
    const layout = {
      getClientRects: () => [],
      getBoundingClientRect: () => new DOMRect(),
    };
    for (const name of Object.keys(layout) as Array<keyof typeof layout>) {
      const original = Object.getOwnPropertyDescriptor(Range.prototype, name);
      Object.defineProperty(Range.prototype, name, { configurable: true, writable: true, value: layout[name] });
      onTestFinished(() => {
        if (original) {
          Object.defineProperty(Range.prototype, name, original);
        } else {
          Reflect.deleteProperty(Range.prototype, name);
        }
      });
    }
    const document = new EditorDocument('main.cs', 'var b = Shapes.Ball');
    const client = fakeClient((method) => (method === 'textDocument/signatureHelp' ? help : undefined));
    const view = boundView(document, [
      languageFeatureNavigation(),
      csharpExtensions({ client, document, environment: environmentFor(), isDisposed: () => false }),
    ]);
    const signatureRequests = () =>
      vi.mocked(client.request).mock.calls.filter(([method]) => method === 'textDocument/signatureHelp');
    try {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: '(' },
        selection: { anchor: view.state.doc.length + 1 },
        userEvent: 'input.type',
      });
      await vi.waitFor(() => {
        expect(view.dom.querySelector('.cm-signature-active-parameter')?.textContent).toBe('float radius');
      });
      const tooltip = view.dom.querySelector('.cm-signature-help')!;
      expect(tooltip.textContent).toContain('1/2');
      expect(tooltip.textContent).toContain('The radius in mm.');
      expect(tooltip.textContent).toContain('A ball at the origin.');
      expect(signatureRequests()[0]?.[1]).toEqual({
        textDocument: { uri: document.uri },
        position: { line: 0, character: 20 },
      });

      view.dispatch({
        changes: { from: view.state.doc.length, insert: '1f,' },
        selection: { anchor: view.state.doc.length + 3 },
        userEvent: 'input.type',
      });
      await vi.waitFor(() => {
        expect(signatureRequests().at(-1)?.[1]).toMatchObject({ position: { line: 0, character: 23 } });
      });

      const count = signatureRequests().length;
      expect(triggerParameterHints(view)).toBe(true);
      await vi.waitFor(() => {
        expect(signatureRequests()).toHaveLength(count + 1);
      });
    } finally {
      view.destroy();
    }
  });
});

describe('C# semantic tokens and folding', () => {
  it('colors the identifiers the server classifies and folds the ranges it reports', async () => {
    const source = 'static class Shapes\n{\n    public static int Ball(float radius) => 1;\n}\n';
    const document = new EditorDocument('Shapes.cs', source);
    const client = fakeClient((method) => {
      if (method === 'textDocument/semanticTokens/full') {
        // Keywords `static` and `class`, the static class `Shapes`, the method `Ball` and the parameter `radius`.
        return { data: [0, 0, 6, 13, 0, 0, 7, 5, 13, 0, 0, 6, 6, 1, 1, 2, 22, 4, 7, 1, 0, 11, 6, 11, 0] };
      }
      return method === 'textDocument/foldingRange' ? [{ startLine: 1, endLine: 3 }] : undefined;
    });
    const view = boundView(
      document,
      csharpExtensions({ client, document, environment: environmentFor(), isDisposed: () => false }),
    );
    try {
      await vi.waitFor(() => {
        expect(view.dom.querySelector('.cm-csharp-semantic-type')?.textContent).toBe('Shapes');
      });
      expect(view.dom.querySelector('.cm-csharp-semantic-function')?.textContent).toBe('Ball');
      expect(view.dom.querySelector('.cm-csharp-semantic-parameter')?.textContent).toBe('radius');
      expect(view.dom.querySelectorAll('[class*="cm-csharp-semantic-"]')).toHaveLength(3);
      const brace = view.state.doc.line(2);
      expect(foldable(view.state, brace.from, brace.to)).toEqual({ from: brace.to, to: view.state.doc.line(4).to });
    } finally {
      view.destroy();
    }
  });
});
