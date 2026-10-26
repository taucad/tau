import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { Transaction } from '@codemirror/state';
import type { Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import type { TypeScriptEditBasis } from '@taucad/lsp/typescript-worker/typescript-service';
import ts from 'typescript';
import { EditorDocument } from '#lib/editor-document.js';
import {
  applyTypeScriptCompletionSelection,
  createTypeScriptActions,
} from '#lib/typescript-language/create-typescript-extensions.js';
import type { TypeScriptService } from '#lib/typescript-language/typescript-service.js';

describe('TypeScript CodeMirror navigation adapter', () => {
  it('opens a real worker builtin definition as virtual read-only declaration text', async () => {
    const document = new EditorDocument('main.ts', 'const n = 1; n.toFixed(2);');
    const navigate = vi.fn();
    const request = vi.fn(async (command: { kind: string }) => {
      if (command.kind === 'definitionLocations') {
        return [{ uri: 'file:///__typescript_lib__/lib.es5.d.ts', line: 571, column: 5, start: 100, length: 7 }];
      }
      if (command.kind === 'readDeclaration') {
        return 'interface Number { toFixed(fractionDigits?: number): string; }';
      }
      throw new Error(`Unexpected request: ${command.kind}`);
    });
    const service = { flush: vi.fn(async () => undefined), client: { request } } as unknown as TypeScriptService;
    const actions = createTypeScriptActions({ document, service, navigate });
    await actions.definition(document.text.indexOf('toFixed'));
    expect(navigate).toHaveBeenCalledWith({
      uri: 'file:///__typescript_lib__/lib.es5.d.ts',
      line: 571,
      column: 5,
      start: 100,
      length: 7,
      declaration: { text: 'interface Number { toFixed(fractionDigits?: number): string; }' },
    });
  });

  it('drops a definition response after the source version changes', async () => {
    const document = new EditorDocument('main.ts', 'const value = 1;');
    const navigate = vi.fn();
    const request = vi.fn(async () => {
      document.apply({ expectedVersion: document.version, origin: 'view', changes: [{ from: 0, to: 0, insert: ' ' }] });
      return [{ uri: 'file:///lib.ts', line: 1, column: 1, start: 0, length: 1 }];
    });
    const service = { flush: vi.fn(async () => undefined), client: { request } } as unknown as TypeScriptService;
    await createTypeScriptActions({ document, service, navigate }).definition(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('resolves a type definition through the worker navigation action', async () => {
    const document = new EditorDocument('main.ts', 'const value: number = 1;');
    const navigate = vi.fn();
    const location = { uri: 'file:///types.ts', line: 3, column: 1, start: 20, length: 6 };
    const request = vi.fn(async () => [location]);
    const service = { flush: vi.fn(async () => undefined), client: { request } } as unknown as TypeScriptService;

    await createTypeScriptActions({ document, service, navigate }).typeDefinition(document.text.indexOf('value'));

    expect(request).toHaveBeenCalledWith({
      kind: 'typeDefinitionLocations',
      uri: document.uri,
      position: document.text.indexOf('value'),
      expectedVersion: document.version,
    });
    expect(navigate).toHaveBeenCalledWith(location);
  });
});

describe('TypeScript completion edits', () => {
  it('applies a checked import before inserting a real snippet field at its shifted range', async () => {
    const source = 'const result = sha;\n';
    const document = new EditorDocument('main.ts', source);
    let state = EditorState.create({ doc: source });
    const view = {
      get state() {
        return state;
      },
      dispatch: (transaction: Transaction) => {
        state = transaction.state;
        const changes: Array<{ from: number; to: number; insert: string }> = [];
        // oxlint-disable-next-line eslint/max-params -- CodeMirror's iterator supplies five positional values.
        transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
          changes.push({ from, to, insert: inserted.toString() });
        });
        document.apply({ expectedVersion: document.version, origin: 'view', changes });
      },
    } as unknown as EditorView;
    const importText = "import { shape } from 'shape-kit';\n";
    const emptyService = {};
    const service = emptyService as TypeScriptService;
    const extras: TypeScriptEditBasis[] = [
      { uri: document.uri, baseText: source, workerVersion: 1, changes: [{ from: 0, to: 0, insert: importText }] },
    ];
    const applyWorkspaceEdits = vi.fn(async (edits: readonly TypeScriptEditBasis[]) => {
      expect(edits).toEqual(extras);
      const edit = edits[0];
      if (!edit) {
        throw new Error('Expected one checked import edit');
      }
      const transaction = state.update({ changes: edit.changes });
      state = transaction.state;
      document.apply({ expectedVersion: document.version, origin: 'workspace-edit', changes: edit.changes });
      return true;
    });
    const from = source.indexOf('sha');
    const completion: Completion = { label: 'shape' };
    await applyTypeScriptCompletionSelection({
      options: {
        document,
        service,
        navigate: vi.fn(),
        applyWorkspaceEdits,
      },
      view,
      completion,
      entry: {
        name: 'shape',
        kind: ts.ScriptElementKind.functionElement,
        sortText: '0',
        insertText: `shape(\${1:value})`,
        isSnippet: true,
      },
      version: 1,
      from,
      to: from + 3,
      extras,
    });
    expect(applyWorkspaceEdits).toHaveBeenCalledOnce();
    expect(document.text).toBe(`${importText}const result = shape(value);\n`);
    expect(state.doc.toString()).toBe(document.text);
    expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe('value');
  });
});
