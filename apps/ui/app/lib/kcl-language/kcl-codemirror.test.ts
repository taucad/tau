import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { autocompletion, currentCompletions, selectedCompletion, startCompletion } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type * as LSP from 'vscode-languageserver-protocol';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import type { KclSymbol, KclSymbolService } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import type { EditorDocumentSession } from '#lib/editor-document-session.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import {
  applyKclWorkspaceEdit,
  jumpToDefinition,
  KclBackend,
  kclExtensions,
  kclHoverFallback,
  kclImportAt,
  kclLspCompletion,
  symbolCompletion,
} from '#lib/kcl-language/kcl-codemirror.js';

describe('KCL pending worker requests', () => {
  it('observes a rejected semantic refresh and keeps the editor usable', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const failure = Promise.withResolvers<LSP.SemanticTokens | undefined>();
    const client = mock<KclLspClient>();
    client.textDocumentSemanticTokensFull.mockReturnValue(failure.promise);
    client.textDocumentFoldingRange.mockResolvedValue([]);
    const document = new EditorDocument('main.kcl', 'one');
    const environment: EditorLanguageEnvironment = {
      session: mock<EditorLanguageEnvironment['session']>(),
      diagnostics: new EditorDiagnostics(),
      fileManagerRef: mock<EditorLanguageEnvironment['fileManagerRef']>(),
      contentService: mock<EditorLanguageEnvironment['contentService']>(),
      treeService: mock<EditorLanguageEnvironment['treeService']>(),
      fileManager: mock<EditorLanguageEnvironment['fileManager']>(),
      navigate: vi.fn(),
    };
    const backend = new KclBackend(environment, client);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = new EditorView({
      state: EditorState.create({
        doc: document.text,
        extensions: kclExtensions({
          backend,
          document,
          environment,
          isDisposed: () => false,
        }),
      }),
      parent: globalThis.document.body,
    });
    try {
      await vi.advanceTimersByTimeAsync(100);
      failure.reject(new Error('worker crashed'));
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledWith('[kcl] language service operation failed', expect.any(Error));
      });
      expect(error).not.toHaveBeenCalled();
      view.dispatch({ changes: { from: 3, insert: ' two' } });
      expect(view.state.doc.toString()).toBe('one two');
    } finally {
      view.destroy();
      warn.mockRestore();
      error.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('KCL completion parity', () => {
  function completionView(query: string, options: Completion[]): EditorView {
    return new EditorView({
      state: EditorState.create({
        doc: query,
        selection: { anchor: query.length },
        extensions: [autocompletion({ override: [() => ({ from: 0, options })] })],
      }),
      parent: globalThis.document.body,
    });
  }

  it('should match LSP filter text while displaying its label', async () => {
    const document = new EditorDocument('main.kcl', 'str');
    const completion = kclLspCompletion(
      { label: 'length', filterText: 'stringLength' },
      { document, version: 1, isDisposed: () => false },
    );
    const view = completionView('str', [completion]);
    try {
      view.focus();
      expect(startCompletion(view)).toBe(true);
      await vi.waitFor(() => {
        expect(currentCompletions(view.state)).toHaveLength(1);
      });
      expect(currentCompletions(view.state)[0]).toMatchObject({ label: 'stringLength', displayLabel: 'length' });
    } finally {
      view.destroy();
    }
  });

  it('should rank equal matches by LSP sort text and honor preselect', async () => {
    const document = new EditorDocument('main.kcl', 'same');
    const first = kclLspCompletion(
      { label: 'sameOne', sortText: 'z' },
      { document, version: 1, isDisposed: () => false },
    );
    const second = kclLspCompletion(
      { label: 'sameTwo', sortText: 'a' },
      { document, version: 1, isDisposed: () => false },
    );
    const sorted = completionView('same', [first, second]);
    try {
      sorted.focus();
      expect(startCompletion(sorted)).toBe(true);
      await vi.waitFor(() => {
        expect(currentCompletions(sorted.state)).toHaveLength(2);
      });
      expect(currentCompletions(sorted.state).map((item) => item.label)).toEqual(['sameTwo', 'sameOne']);
    } finally {
      sorted.destroy();
    }
    const preferred = kclLspCompletion(
      { label: 'sameOne', sortText: 'z', preselect: true },
      { document, version: 1, isDisposed: () => false },
    );
    const selected = completionView('same', [preferred, second]);
    try {
      selected.focus();
      expect(startCompletion(selected)).toBe(true);
      await vi.waitFor(() => {
        expect(currentCompletions(selected.state)).toHaveLength(2);
      });
      expect(selectedCompletion(selected.state)?.label).toBe('sameOne');
    } finally {
      selected.destroy();
    }
  });

  it('should apply an LSP snippet field instead of inserting a literal tabstop', () => {
    const document = new EditorDocument('main.kcl', 'fo');
    const item: LSP.CompletionItem = { label: 'foo', insertText: 'foo($1)', insertTextFormat: 2 };
    const completion = kclLspCompletion(item, { document, version: document.version, isDisposed: () => false });
    const view = new EditorView({ state: EditorState.create({ doc: 'fo' }), parent: globalThis.document.body });
    try {
      expect(typeof completion.apply).toBe('function');
      if (typeof completion.apply === 'function') {
        completion.apply(view, completion, 0, 2);
      }
      expect(view.state.doc.toString()).toBe('foo()');
      expect(view.state.selection.main.head).toBe(4);
    } finally {
      view.destroy();
    }
  });

  it('should retain function and parameter insertion text with signature details', () => {
    const functionSymbol = mock<KclSymbol>({
      name: 'shape',
      kind: 'function',
      importPath: undefined,
      returnType: 'Solid',
      parameters: [{ name: 'length', type: 'number', isLabeled: true, hasDefault: false, range: { start: 0, end: 0 } }],
    });
    const functionCompletion = symbolCompletion(functionSymbol, 2);
    expect(functionCompletion.detail).toBe('fn shape(length: number) -> Solid');
    const view = new EditorView({ state: EditorState.create({ doc: '' }), parent: globalThis.document.body });
    try {
      expect(typeof functionCompletion.apply).toBe('function');
      if (typeof functionCompletion.apply === 'function') {
        functionCompletion.apply(view, functionCompletion, 0, 0);
      }
      expect(view.state.doc.toString()).toBe('shape(length = )');
      expect(view.state.selection.main.head).toBe('shape(length = '.length);
    } finally {
      view.destroy();
    }
    const parameter = symbolCompletion(
      mock<KclSymbol>({ name: 'length', kind: 'parameter', containingFunction: 'shape', value: undefined }),
      2,
    );
    expect(parameter.apply).toBe('length = ');
  });
});

describe('KCL LSP document lifecycle', () => {
  it('opens once for split views, advances versions, closes after the last view, and stops changes', async () => {
    const client = mock<KclLspClient>();
    client.getServerCapabilities.mockReturnValue({ textDocumentSync: 1 });
    const environment: EditorLanguageEnvironment = {
      session: mock<EditorLanguageEnvironment['session']>(),
      diagnostics: new EditorDiagnostics(),
      fileManagerRef: mock<EditorLanguageEnvironment['fileManagerRef']>(),
      contentService: mock<EditorLanguageEnvironment['contentService']>(),
      treeService: mock<EditorLanguageEnvironment['treeService']>(),
      fileManager: mock<EditorLanguageEnvironment['fileManager']>(),
      navigate: vi.fn(),
    };
    const backend = new KclBackend(environment, client);
    await backend.initialize();
    const document = new EditorDocument('main.kcl', 'one');
    backend.retain(document);
    backend.retain(document);
    expect(client.setCurrentDocumentUri.mock.invocationCallOrder[0]).toBeLessThan(
      client.textDocumentDidOpen.mock.invocationCallOrder[0]!,
    );
    expect(client.textDocumentDidOpen).toHaveBeenCalledTimes(1);
    expect(client.textDocumentDidOpen).toHaveBeenCalledWith({
      textDocument: { uri: document.uri, languageId: 'kcl', version: 1, text: 'one' },
    });
    document.apply({ expectedVersion: 1, origin: 'view', changes: [{ from: 3, to: 3, insert: ' two' }] });
    expect(client.textDocumentDidChange).toHaveBeenCalledWith({
      textDocument: { uri: document.uri, version: 2 },
      contentChanges: [{ text: 'one two' }],
    });
    backend.release(document);
    expect(client.textDocumentDidClose).not.toHaveBeenCalled();
    backend.release(document);
    expect(client.textDocumentDidClose).toHaveBeenCalledTimes(1);
    expect(client.dispose).toHaveBeenCalledTimes(1);
    document.apply({ expectedVersion: 2, origin: 'view', changes: [{ from: 7, to: 7, insert: '!' }] });
    expect(client.textDocumentDidChange).toHaveBeenCalledTimes(1);
  });
});

describe('KCL import navigation', () => {
  it('finds quoted file imports at the cursor in both KCL import forms', () => {
    const simple = 'import "part.kcl"';
    expect(kclImportAt(simple, simple.indexOf('part') + 2)).toBe('part.kcl');
    const named = 'import * from "nested/part.kcl"';
    expect(kclImportAt(named, named.indexOf('part') + 2)).toBe('nested/part.kcl');
    expect(kclImportAt('let part = "part.kcl"', 15)).toBeUndefined();
  });

  it('navigates quoted imports and local WASM symbols when LSP has no definition', async () => {
    const document = new EditorDocument('bench/main.kcl', 'import "part.kcl"\nmyVar');
    const client = mock<KclLspClient>();
    client.textDocumentDefinition.mockResolvedValue(undefined);
    const symbols = mock<KclSymbolService>();
    const navigate = vi.fn();
    const environment = mock<EditorLanguageEnvironment>({ navigate });
    const importState = EditorState.create({ doc: document.text, selection: { anchor: 10 } });
    await jumpToDefinition(mock<Pick<EditorView, 'state'>>({ state: importState }), client, {
      document,
      environment,
      symbols,
    });
    expect(navigate).toHaveBeenCalledWith({ uri: 'file:///bench/part.kcl', line: 1, column: 1 });

    const symbol = mock<KclSymbol>({ name: 'myVar', kind: 'variable', uri: document.uri, lineNumber: 2, column: 1 });
    symbols.getDefinitionForUsage.mockReturnValue(symbol);
    const symbolState = EditorState.create({ doc: document.text, selection: { anchor: document.text.length - 2 } });
    await jumpToDefinition(mock<Pick<EditorView, 'state'>>({ state: symbolState }), client, {
      document,
      environment,
      symbols,
    });
    expect(navigate).toHaveBeenLastCalledWith({ uri: document.uri, line: 2, column: 1 });
  });

  it('shows module import and user symbol text when LSP hover is absent', () => {
    const symbols = mock<KclSymbolService>();
    const document = new EditorDocument('main.kcl', 'import "part.kcl"\nmyVar');
    expect(kclHoverFallback({ text: document.text, offset: 10, uri: document.uri, symbols })).toContain(
      'module "part.kcl"',
    );
    symbols.getDefinitionForUsage.mockReturnValue(
      mock<KclSymbol>({
        name: 'myVar',
        kind: 'variable',
        uri: document.uri,
        lineNumber: 2,
        column: 1,
        value: undefined,
      }),
    );
    expect(
      kclHoverFallback({ text: document.text, offset: document.text.length - 2, uri: document.uri, symbols }),
    ).toContain('myVar');
  });
});

function environmentFor(document: EditorDocument): {
  environment: EditorLanguageEnvironment;
  session: EditorDocumentSession;
} {
  const session = mock<EditorDocumentSession>();
  session.getOrEnsureDocument.mockResolvedValue(document);
  session.acquire.mockResolvedValue(document);
  session.get.mockReturnValue(document);
  session.apply.mockImplementation((_path, transaction) => document.apply(transaction));
  session.save.mockResolvedValue(undefined);
  const treeService = mock<FileTreeService>();
  treeService.getEntry.mockResolvedValue({
    type: 'file',
    path: document.path,
    name: document.path,
    size: 3,
    mtimeMs: 0,
    contentKind: 'text',
    isLoaded: true,
  });
  return { environment: mock<EditorLanguageEnvironment>({ session, treeService }), session };
}

describe('KCL workspace edits', () => {
  it('applies an LSP text edit to the authoritative document and saves it', async () => {
    const document = new EditorDocument('main.kcl', 'one\ntwo\n');
    const { environment, session } = environmentFor(document);
    const edit: LSP.WorkspaceEdit = {
      documentChanges: [
        {
          textDocument: { uri: document.uri, version: document.version },
          edits: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } }, newText: 'TWO' }],
        },
      ],
    };
    await applyKclWorkspaceEdit(
      edit,
      environment,
      new Map([[document.uri, { version: document.version, text: document.text }]]),
    );
    expect(document.text).toBe('one\nTWO\n');
    expect(session.apply).toHaveBeenCalledWith(
      'main.kcl',
      expect.objectContaining({ expectedVersion: 1, origin: 'workspace-edit' }),
    );
    expect(session.save).toHaveBeenCalledWith('main.kcl');
  });

  it('refuses stale server versions without applying or saving', async () => {
    const document = new EditorDocument('main.kcl', 'one');
    const { environment, session } = environmentFor(document);
    const edit: LSP.WorkspaceEdit = {
      documentChanges: [
        {
          textDocument: { uri: document.uri, version: 0 },
          edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'two' }],
        },
      ],
    };
    await expect(
      applyKclWorkspaceEdit(
        edit,
        environment,
        new Map([[document.uri, { version: document.version, text: document.text }]]),
      ),
    ).rejects.toThrow('stale');
    expect(document.text).toBe('one');
    expect(vi.mocked(session.save)).not.toHaveBeenCalled();
  });

  it('applies unversioned edits to another KCL file only with its request-time text', async () => {
    const source = new EditorDocument('main.kcl', 'import "part.kcl"');
    const target = new EditorDocument('part.kcl', 'old');
    const { environment, session } = environmentFor(source);
    const docs = new Map([
      ['main.kcl', source],
      ['part.kcl', target],
    ]);
    vi.mocked(session.acquire).mockImplementation(async (path) => docs.get(path));
    vi.mocked(session.get).mockImplementation((path) => docs.get(path));
    vi.mocked(session.apply).mockImplementation((path, transaction) => docs.get(path)?.apply(transaction));
    const edit: LSP.WorkspaceEdit = {
      changes: {
        [target.uri]: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
            newText: 'new',
          },
        ],
      },
    };
    const basis = new Map([
      [source.uri, { version: 1, text: source.text }],
      [target.uri, { version: 1, text: target.text }],
    ]);
    await applyKclWorkspaceEdit(edit, environment, basis);
    expect(target.text).toBe('new');
    expect(session.save).toHaveBeenCalledWith('part.kcl');
    target.apply({ expectedVersion: target.version, origin: 'view', changes: [{ from: 0, to: 3, insert: 'newer' }] });
    await expect(applyKclWorkspaceEdit(edit, environment, basis)).rejects.toThrow('refused');
    expect(target.text).toBe('newer');
  });
});
