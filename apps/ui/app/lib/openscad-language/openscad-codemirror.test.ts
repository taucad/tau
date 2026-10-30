import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Completion } from '@codemirror/autocomplete';
import type * as LSP from 'vscode-languageserver-protocol';
import { openscadBuiltinsUri } from '@taucad/openscad-language/protocol';
import { goToDefinitionAt } from '#components/code/editor-definition.js';
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
