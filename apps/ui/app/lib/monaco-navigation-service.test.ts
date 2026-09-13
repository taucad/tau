import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AnyActorRef } from 'xstate';
import * as monaco from 'monaco-editor';
import { registerMonacoNavigation } from '#lib/monaco-navigation-service.js';
import { createMonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

function createNavDeps(): {
  editorRef: AnyActorRef;
  sent: unknown[];
} {
  const sent: unknown[] = [];
  const editorRef = {
    on: vi.fn(() => ({ unsubscribe: vi.fn() })),
    send: (event: unknown) => {
      sent.push(event);
    },
  } as unknown as AnyActorRef;
  return { editorRef, sent };
}

describe('registerMonacoNavigation', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('openCodeEditor uses workspaceFs and forwards readOnly: false for normal paths', () => {
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      readText: async () => 'x',
      peekText: () => 'x',
      onDidChange: () => ({ dispose: () => undefined }),
      isReadOnly: (uri) => uri.path.includes('node_modules'),
    });

    const { editorRef, sent } = createNavDeps();

    const registerSpy = vi.spyOn(monaco.editor, 'registerEditorOpener');
    const disposable = registerMonacoNavigation({ monaco, editorRef, workspaceFs });

    const opener = registerSpy.mock.calls[0]![0] as {
      openCodeEditor(s: unknown, resource: monaco.Uri, selection?: unknown): boolean;
    };

    const handled = opener.openCodeEditor({} as unknown, monaco.Uri.file('/src/a.ts'), new monaco.Position(2, 3));
    expect(handled).toBe(true);

    expect(sent[0]).toEqual(
      expect.objectContaining({
        type: 'openFile',
        path: 'src/a.ts',
        readOnly: false,
        lineNumber: 2,
        column: 3,
      }),
    );

    registerSpy.mockRestore();
    disposable.dispose();
    workspaceFs.dispose();
  });

  it('sets readOnly: true for node_modules paths', () => {
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      readText: async () => 'x',
      peekText: () => 'x',
      onDidChange: () => ({ dispose: () => undefined }),
      isReadOnly: (uri) => uri.path.includes('node_modules'),
    });

    const { editorRef, sent } = createNavDeps();
    const registerSpy = vi.spyOn(monaco.editor, 'registerEditorOpener');
    const disposable = registerMonacoNavigation({ monaco, editorRef, workspaceFs });
    const opener = registerSpy.mock.calls[0]![0] as {
      openCodeEditor(s: unknown, resource: monaco.Uri): boolean;
    };

    opener.openCodeEditor({} as unknown, monaco.Uri.file('/node_modules/pkg/x.js'));
    expect(sent[0]).toEqual(
      expect.objectContaining({
        type: 'openFile',
        path: 'node_modules/pkg/x.js',
        readOnly: true,
      }),
    );

    registerSpy.mockRestore();
    disposable.dispose();
    workspaceFs.dispose();
  });

  it('returns false when scheme is not file', () => {
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    const { editorRef } = createNavDeps();
    const registerSpy = vi.spyOn(monaco.editor, 'registerEditorOpener');
    const disposable = registerMonacoNavigation({ monaco, editorRef, workspaceFs });
    const opener = registerSpy.mock.calls[0]![0] as {
      openCodeEditor(s: unknown, resource: monaco.Uri): boolean;
    };
    expect(opener.openCodeEditor({} as unknown, monaco.Uri.parse('https://example.com/x'))).toBe(false);
    registerSpy.mockRestore();
    disposable.dispose();
    workspaceFs.dispose();
  });
});
