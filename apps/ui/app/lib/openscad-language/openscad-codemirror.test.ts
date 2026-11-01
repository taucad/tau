import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Completion } from '@codemirror/autocomplete';
import type * as LSP from 'vscode-languageserver-protocol';
import { openscadBuiltinsUri } from '@taucad/openscad-language/protocol';
import { goToDefinitionAt } from '#components/code/editor-definition.js';
import { availableLanguageActions, languageFeatures } from '#components/code/editor-language-features.js';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import {
  applyOpenscadWorkspaceEdit,
  OpenscadBackend,
  openscadDocumentation,
  openscadExtensions,
  openscadLspCompletion,
} from '#lib/openscad-language/openscad-codemirror.js';
import type { OpenscadClient } from '#lib/openscad-language/openscad-codemirror.js';

type FileEntry = NonNullable<Awaited<ReturnType<EditorLanguageEnvironment['treeService']['getEntry']>>>;
type Call = { method: string; params: unknown };
type Apply = Exclude<Completion['apply'], string | undefined>;
type Info = Exclude<Completion['info'], string | undefined>;

/** A scripted server: each request method answers from `responses`; every message is recorded. */
function scriptedClient(responses: ReadonlyMap<string, (params: unknown) => unknown> = new Map()): {
  client: OpenscadClient;
  requests: Call[];
  notifications: Call[];
} {
  const requests: Call[] = [];
  const notifications: Call[] = [];
  const client: OpenscadClient = {
    initialize: vi.fn(async () => ({ capabilities: {} })),
    async request<T>(method: string, params: unknown): Promise<T> {
      requests.push({ method, params });
      return responses.get(method)?.(params) as T;
    },
    notify(method, params) {
      notifications.push({ method, params });
    },
    refreshWorkspace: vi.fn(),
    dispose: vi.fn(),
  };
  return { client, requests, notifications };
}

function environmentWith(overrides: Partial<EditorLanguageEnvironment> = {}): EditorLanguageEnvironment {
  return {
    session: mock<EditorLanguageEnvironment['session']>(),
    diagnostics: new EditorDiagnostics(),
    fileManagerRef: mock<EditorLanguageEnvironment['fileManagerRef']>(),
    contentService: mock<EditorLanguageEnvironment['contentService']>(),
    treeService: mock<EditorLanguageEnvironment['treeService']>({ subscribeTree: () => () => undefined }),
    fileManager: mock<EditorLanguageEnvironment['fileManager']>(),
    navigate: vi.fn(),
    ...overrides,
  };
}

const views: EditorView[] = [];
function viewOf(text: string, extensions: ReturnType<typeof openscadExtensions> = []): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: text, extensions }),
    parent: globalThis.document.body,
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
  vi.useRealTimers();
});

describe('OpenSCAD documentation links', () => {
  it('turns the server’s resolved {@link} targets into definition links', () => {
    const { markdown, targets } = openscadDocumentation(
      'See [`spur_gear`](file:///lib/gears.scad#L5,8) and [plain](file:///a%20b.scad#L1,1), not [web](https://openscad.org).',
    );
    expect(markdown).toBe(
      'See [`spur_gear`](#tau-definition-0) and [plain](#tau-definition-1), not [web](https://openscad.org).',
    );
    expect(targets).toEqual([
      { uri: 'file:///lib/gears.scad', line: 5, column: 8 },
      { uri: 'file:///a%20b.scad', line: 1, column: 1 },
    ]);
  });
});

describe('OpenSCAD completion', () => {
  const autoImport: LSP.CompletionItem = {
    label: 'bracket',
    kind: 3,
    detail: 'module bracket(size = 10) — auto-import from parts/bracket.scad',
    labelDetails: { description: 'parts/bracket.scad' },
    sortText: '6bracket',
    filterText: 'bracket',
    insertTextFormat: 2,
    textEdit: {
      range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } },
      newText: 'bracket($1)$0',
    },
    additionalTextEdits: [
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
        newText: 'use <parts/bracket.scad>\n',
      },
    ],
    data: { uri: 'file:///parts/bracket.scad', name: 'bracket', namespace: 'module', from: 'file:///main.scad' },
  };

  it('adds the import when an auto-import suggestion is accepted', () => {
    const text = 'use <lib/gears.scad>\n\nbrack';
    const document = new EditorDocument('main.scad', text);
    const { client } = scriptedClient();
    const context = { client, document, environment: environmentWith(), isDisposed: () => false };
    const completion = openscadLspCompletion(autoImport, {
      ...context,
      version: document.version,
      showSignature: vi.fn(),
    });
    const view = viewOf(text);
    (completion.apply as Apply)(view, completion, text.length - 5, text.length);
    expect(view.state.doc.toString()).toBe('use <lib/gears.scad>\nuse <parts/bracket.scad>\n\nbracket()');
    expect(completion.detail).toBe('parts/bracket.scad');
  });

  it('resolves deferred documentation when the suggestion is shown', async () => {
    const document = new EditorDocument('main.scad', 'brack');
    const { client, requests } = scriptedClient(
      new Map<string, (params: unknown) => unknown>([
        [
          'completionItem/resolve',
          (item) => ({
            ...(item as LSP.CompletionItem),
            documentation: { kind: 'markdown', value: 'An L bracket.' },
          }),
        ],
      ]),
    );
    const completion = openscadLspCompletion(autoImport, {
      client,
      document,
      environment: environmentWith(),
      isDisposed: () => false,
      version: document.version,
      showSignature: vi.fn(),
    });
    const info = (await (completion.info as Info)(completion)) as HTMLElement;
    expect(requests.map((request) => request.method)).toEqual(['completionItem/resolve']);
    expect(info.textContent).toContain('module bracket(size = 10)');
    expect(info.textContent).toContain('An L bracket.');
  });
});

describe('OpenSCAD navigation', () => {
  it('opens a built-in declaration with the source the server generates', async () => {
    const document = new EditorDocument('main.scad', 'cube(1);');
    const navigate = vi.fn();
    const { client } = scriptedClient(
      new Map<string, (params: unknown) => unknown>([
        [
          'textDocument/definition',
          () => [
            {
              targetUri: openscadBuiltinsUri,
              targetRange: { start: { line: 40, character: 0 }, end: { line: 40, character: 30 } },
              targetSelectionRange: { start: { line: 40, character: 7 }, end: { line: 40, character: 11 } },
            },
          ],
        ],
        ['tau/declarationSource', () => ({ text: 'module cube(size = [1, 1, 1], center = false) {}' })],
      ]),
    );
    const environment = environmentWith({ navigate });
    const view = viewOf(document.text, openscadExtensions({ client, document, environment, isDisposed: () => false }));
    expect(goToDefinitionAt(view, 2)).toBe(true);
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        uri: openscadBuiltinsUri,
        line: 41,
        column: 8,
        declaration: { text: 'module cube(size = [1, 1, 1], center = false) {}' },
      });
    });
  });
});

describe('OpenSCAD backend', () => {
  it('syncs edits incrementally and publishes pulled diagnostics', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const document = new EditorDocument('main.scad', 'cube(1);');
    const { client, notifications } = scriptedClient(
      new Map<string, (params: unknown) => unknown>([
        [
          'textDocument/diagnostic',
          () => ({
            kind: 'full',
            items: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
                severity: 1,
                code: 'unknown-module',
                source: 'openscad',
                message: 'Unknown module `cub`',
              },
            ],
          }),
        ],
      ]),
    );
    const environment = environmentWith();
    const backend = new OpenscadBackend(environment, client);
    await backend.initialize();
    backend.retain(document);
    document.apply({ changes: [{ from: 3, to: 4, insert: '' }], origin: 'view', expectedVersion: document.version });
    expect(notifications.map((notification) => notification.method)).toEqual([
      'textDocument/didOpen',
      'textDocument/didChange',
    ]);
    expect(notifications[1]?.params).toEqual({
      textDocument: { uri: document.uri, version: document.version },
      contentChanges: [{ range: { start: { line: 0, character: 3 }, end: { line: 0, character: 4 } }, text: '' }],
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(environment.diagnostics.get(document.uri).get('openscad-lsp')).toEqual([
      {
        from: 0,
        to: 3,
        message: 'Unknown module `cub`',
        severity: 'error',
        source: 'openscad',
        code: 'unknown-module',
      },
    ]);
    expect(backend.release(document)).toBe(true);
    expect(notifications.at(-1)?.method).toBe('textDocument/didClose');
    expect(client.dispose).toHaveBeenCalled();
  });
});

describe('OpenSCAD workspace edits', () => {
  it('refuses an edit computed against another version of the file', async () => {
    const edit: LSP.WorkspaceEdit = {
      documentChanges: [
        {
          textDocument: { uri: 'file:///main.scad', version: 3 },
          edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, newText: 'gear' }],
        },
      ],
    };
    await expect(
      applyOpenscadWorkspaceEdit(
        edit,
        environmentWith(),
        new Map([['file:///main.scad', { version: 4, text: 'cube' }]]),
      ),
    ).rejects.toThrow('stale document version');
  });
});

describe('OpenSCAD editor commands', () => {
  const range = (line: number, from: number, to: number): LSP.Range => ({
    start: { line, character: from },
    end: { line, character: to },
  });

  it('offers every command the server supports in the context menu, like the other languages', () => {
    const document = new EditorDocument('main.scad', 'cube(1);');
    const { client } = scriptedClient();
    const view = viewOf(
      document.text,
      openscadExtensions({ client, document, environment: environmentWith(), isDisposed: () => false }),
    );
    expect(availableLanguageActions(view.state).map((action) => action.label)).toEqual([
      'Find All References',
      'Show Call Hierarchy',
      'Go to Symbol in Editor…',
      'Go to Symbol in Workspace…',
      'Rename Symbol',
      'Format Document',
      'Quick Fix…',
      'Trigger Parameter Hints',
    ]);
  });

  it('formats the document through the server with the editor indentation', async () => {
    const text = 'module m() {\n      cube();\n}\n';
    const document = new EditorDocument('main.scad', text);
    const { client, requests } = scriptedClient(
      new Map<string, (params: unknown) => unknown>([
        ['textDocument/formatting', () => [{ range: range(1, 0, 6), newText: '  ' }]],
      ]),
    );
    const session = mock<EditorLanguageEnvironment['session']>();
    session.acquire.mockResolvedValue(document);
    session.get.mockReturnValue(document);
    session.apply.mockImplementation((_path, change) => document.apply(change));
    const environment = environmentWith({
      session,
      treeService: mock<EditorLanguageEnvironment['treeService']>({
        subscribeTree: () => () => undefined,
        getEntry: vi.fn(async () => mock<FileEntry>({ type: 'file', provenance: undefined })),
      }),
    });
    const view = viewOf(text, openscadExtensions({ client, document, environment, isDisposed: () => false }));
    await view.state.facet(languageFeatures).format?.(view);
    expect(requests.at(-1)).toEqual({
      method: 'textDocument/formatting',
      params: { textDocument: { uri: document.uri }, options: { tabSize: 2, insertSpaces: true } },
    });
    expect(document.text).toBe('module m() {\n  cube();\n}\n');
  });

  it('lists references, symbols and calls with their file, line and source preview', async () => {
    const text = 'module plate() {\n  cube(1);\n}\nplate();\n';
    const document = new EditorDocument('main.scad', text);
    const navigate = vi.fn();
    const { client } = scriptedClient(
      new Map<string, (params: unknown) => unknown>([
        [
          'textDocument/references',
          () => [
            { uri: document.uri, range: range(0, 7, 12) },
            { uri: document.uri, range: range(3, 0, 5) },
          ],
        ],
        [
          'textDocument/documentSymbol',
          () => [{ name: 'plate', kind: 2, range: range(0, 0, 16), selectionRange: range(0, 7, 12), children: [] }],
        ],
        [
          'textDocument/documentHighlight',
          () => [
            { range: range(0, 7, 12), kind: 3 },
            { range: range(3, 0, 5), kind: 2 },
          ],
        ],
        [
          'textDocument/prepareCallHierarchy',
          () => [
            { name: 'plate', kind: 2, uri: document.uri, range: range(0, 0, 16), selectionRange: range(0, 7, 12) },
          ],
        ],
        [
          'callHierarchy/outgoingCalls',
          () => [
            {
              to: {
                name: 'cube',
                kind: 2,
                uri: openscadBuiltinsUri,
                range: range(1, 0, 9),
                selectionRange: range(1, 7, 11),
              },
              fromRanges: [range(1, 2, 6)],
            },
          ],
        ],
        ['tau/declarationSource', () => ({ text: 'module sphere() {}\nmodule cube(size) {}\n' })],
      ]),
    );
    const view = viewOf(
      text,
      openscadExtensions({ client, document, environment: environmentWith({ navigate }), isDisposed: () => false }),
    );
    const features = view.state.facet(languageFeatures);
    const found = (await features.references?.(view, 8)) ?? [];
    expect(found.map(({ label, detail, preview }) => ({ label, detail, preview }))).toEqual([
      { label: 'main.scad:1', detail: '', preview: 'module plate() {' },
      { label: 'main.scad:4', detail: '', preview: 'plate();' },
    ]);
    await found[1]?.open();
    expect(navigate).toHaveBeenCalledWith({ uri: document.uri, line: 4, column: 1 });
    expect(await features.documentSymbols?.(view)).toEqual([
      { name: 'plate', kind: 'module', detail: undefined, from: 0, to: 16, selectionFrom: 7, children: [] },
    ]);
    expect(await features.occurrences?.(view, 8)).toEqual([
      { from: 7, to: 12, kind: 'write' },
      { from: 30, to: 35, kind: 'read' },
    ]);
    const calls = (await features.callHierarchy?.(view, 8, 'outgoing')) ?? [];
    expect(calls.map(({ label, kind, detail, preview }) => ({ label, kind, detail, preview }))).toEqual([
      { label: 'cube', kind: 'module', detail: 'builtins.scad:2', preview: 'module cube(size) {}' },
    ]);
  });
});
