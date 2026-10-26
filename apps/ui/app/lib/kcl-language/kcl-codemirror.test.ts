import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type * as LSP from 'vscode-languageserver-protocol';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import type { KclSymbol, KclSymbolService } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import type { EditorDocumentSession } from '#lib/editor-document-session.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { applyKclWorkspaceEdit, jumpToDefinition, KclBackend, kclHoverFallback, kclImportAt } from '#lib/kcl-language/kcl-codemirror.js';

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
    expect(client.setCurrentDocumentUri.mock.invocationCallOrder[0]).toBeLessThan(client.textDocumentDidOpen.mock.invocationCallOrder[0]!);
    expect(client.textDocumentDidOpen).toHaveBeenCalledTimes(1);
    expect(client.textDocumentDidOpen).toHaveBeenCalledWith({ textDocument: { uri: document.uri, languageId: 'kcl', version: 1, text: 'one' } });
    document.apply({ expectedVersion: 1, origin: 'view', changes: [{ from: 3, to: 3, insert: ' two' }] });
    expect(client.textDocumentDidChange).toHaveBeenCalledWith({ textDocument: { uri: document.uri, version: 2 }, contentChanges: [{ text: 'one two' }] });
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
    await jumpToDefinition(mock<Pick<EditorView, 'state'>>({ state: importState }), client, { document, environment, symbols });
    expect(navigate).toHaveBeenCalledWith({ uri: 'file:///bench/part.kcl', line: 1, column: 1 });

    const symbol = mock<KclSymbol>({ name: 'myVar', kind: 'variable', uri: document.uri, lineNumber: 2, column: 1 });
    symbols.getDefinitionForUsage.mockReturnValue(symbol);
    const symbolState = EditorState.create({ doc: document.text, selection: { anchor: document.text.length - 2 } });
    await jumpToDefinition(mock<Pick<EditorView, 'state'>>({ state: symbolState }), client, { document, environment, symbols });
    expect(navigate).toHaveBeenLastCalledWith({ uri: document.uri, line: 2, column: 1 });
  });

  it('shows module import and user symbol text when LSP hover is absent', () => {
    const symbols = mock<KclSymbolService>();
    const document = new EditorDocument('main.kcl', 'import "part.kcl"\nmyVar');
    expect(kclHoverFallback({ text: document.text, offset: 10, uri: document.uri, symbols })).toContain('module "part.kcl"');
    symbols.getDefinitionForUsage.mockReturnValue(mock<KclSymbol>({ name: 'myVar', kind: 'variable', uri: document.uri, lineNumber: 2, column: 1, value: undefined }));
    expect(kclHoverFallback({ text: document.text, offset: document.text.length - 2, uri: document.uri, symbols })).toContain('myVar');
  });
});

function environmentFor(document: EditorDocument): { environment: EditorLanguageEnvironment; session: EditorDocumentSession } {
  const session = mock<EditorDocumentSession>();
  session.getOrEnsureDocument.mockResolvedValue(document);
  session.acquire.mockResolvedValue(document);
  session.get.mockReturnValue(document);
  session.apply.mockImplementation((_path, transaction) => document.apply(transaction));
  session.save.mockResolvedValue(undefined);
  const treeService = mock<FileTreeService>();
  treeService.getEntry.mockResolvedValue({ type: 'file', path: document.path, name: document.path, size: 3, mtimeMs: 0, contentKind: 'text', isLoaded: true });
  return { environment: mock<EditorLanguageEnvironment>({ session, treeService }), session };
}

describe('KCL workspace edits', () => {
  it('applies an LSP text edit to the authoritative document and saves it', async () => {
    const document = new EditorDocument('main.kcl', 'one\ntwo\n');
    const { environment, session } = environmentFor(document);
    const edit: LSP.WorkspaceEdit = { documentChanges: [{
      textDocument: { uri: document.uri, version: document.version },
      edits: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } }, newText: 'TWO' }],
    }] };
    await applyKclWorkspaceEdit(edit, environment, new Map([[document.uri, { version: document.version, text: document.text }]]));
    expect(document.text).toBe('one\nTWO\n');
    expect(session.apply).toHaveBeenCalledWith('main.kcl', expect.objectContaining({ expectedVersion: 1, origin: 'workspace-edit' }));
    expect(session.save).toHaveBeenCalledWith('main.kcl');
  });

  it('refuses stale server versions without applying or saving', async () => {
    const document = new EditorDocument('main.kcl', 'one');
    const { environment, session } = environmentFor(document);
    const edit: LSP.WorkspaceEdit = { documentChanges: [{
      textDocument: { uri: document.uri, version: 0 },
      edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'two' }],
    }] };
    await expect(applyKclWorkspaceEdit(edit, environment, new Map([[document.uri, { version: document.version, text: document.text }]]))).rejects.toThrow('stale');
    expect(document.text).toBe('one');
    expect(vi.mocked(session.save)).not.toHaveBeenCalled();
  });

  it('applies unversioned edits to another KCL file only with its request-time text', async () => {
    const source = new EditorDocument('main.kcl', 'import "part.kcl"');
    const target = new EditorDocument('part.kcl', 'old');
    const { environment, session } = environmentFor(source);
    const docs = new Map([['main.kcl', source], ['part.kcl', target]]);
    vi.mocked(session.acquire).mockImplementation(async (path) => docs.get(path));
    vi.mocked(session.get).mockImplementation((path) => docs.get(path));
    vi.mocked(session.apply).mockImplementation((path, transaction) => docs.get(path)?.apply(transaction));
    const edit: LSP.WorkspaceEdit = { changes: { [target.uri]: [{
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'new',
    }] } };
    const basis = new Map([[source.uri, { version: 1, text: source.text }], [target.uri, { version: 1, text: target.text }]]);
    await applyKclWorkspaceEdit(edit, environment, basis);
    expect(target.text).toBe('new');
    expect(session.save).toHaveBeenCalledWith('part.kcl');
    target.apply({ expectedVersion: target.version, origin: 'view', changes: [{ from: 0, to: 3, insert: 'newer' }] });
    await expect(applyKclWorkspaceEdit(edit, environment, basis)).rejects.toThrow('refused');
    expect(target.text).toBe('newer');
  });
});
