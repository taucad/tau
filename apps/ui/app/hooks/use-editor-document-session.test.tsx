import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';

const editorRef = vi.hoisted(() => ({ send: vi.fn() }));
const contentService = vi.hoisted(() => ({ current: undefined as FileContentService | undefined }));
const treeService = vi.hoisted(() => ({ getEntry: vi.fn() }));
const fileManager = vi.hoisted(() => ({
  fileManagerRef: { getSnapshot: () => ({ context: {} }) },
  readFile: vi.fn(),
  exists: vi.fn(),
  readdir: vi.fn(),
  getDirectoryStat: vi.fn(),
}));

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', editorRef }) }));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ ...fileManager, contentService: contentService.current, treeService }),
}));

const { EditorDocumentSessionProvider, useEditorLanguageEnvironment } =
  await import('#hooks/use-editor-document-session.js');

const openFileCalls = (): unknown[] =>
  editorRef.send.mock.calls.map(([event]) => event as { type: string }).filter((event) => event.type === 'openFile');

async function mountEnvironment(): Promise<EditorLanguageEnvironment> {
  const content = mock<FileContentService>();
  content.onDidContentChange.mockReturnValue(() => undefined);
  content.onDidChangeOutcome.mockReturnValue(() => undefined);
  contentService.current = content;
  let environment: EditorLanguageEnvironment | undefined;
  function Probe(): undefined {
    environment = useEditorLanguageEnvironment();
    return undefined;
  }
  render(
    <EditorDocumentSessionProvider>
      <Probe />
    </EditorDocumentSessionProvider>,
  );
  await waitFor(() => {
    expect(environment).toBeDefined();
  });
  return environment!;
}

describe('EditorDocumentSessionProvider navigation', () => {
  it.each([
    'file:///__typescript_lib__/lib.es5.d.ts',
    'file:///cdn-types/three/index.d.ts',
    'file:///__csharp_metadata__/System.Math.cs',
    'file:///__kcl_std__/sketch.kcl',
    'file:///__openscad_builtins__/builtins.scad',
  ])('should open the library declaration %s as a read-only tab at its line and column', async (uri) => {
    editorRef.send.mockClear();
    const environment = await mountEnvironment();
    const path = uri.slice('file:///'.length);

    await environment.navigate({ uri, line: 12, column: 4, declaration: { text: 'declaration source' } });

    expect(editorRef.send).toHaveBeenCalledWith({
      type: 'openFile',
      path,
      source: 'user',
      readOnly: true,
      lineNumber: 12,
      column: 4,
    });
    const opened = await environment.session.acquire(path);
    expect(opened?.text).toBe('declaration source');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(treeService.getEntry).not.toHaveBeenCalled();
  });

  it('should reopen a declaration it already served when a later target carries no text', async () => {
    editorRef.send.mockClear();
    const environment = await mountEnvironment();
    await environment.navigate({
      uri: 'file:///__kcl_std__/sketch.kcl',
      line: 1,
      column: 1,
      declaration: { text: 'x' },
    });
    await environment.navigate({ uri: 'file:///__kcl_std__/sketch.kcl', line: 40, column: 2 });
    await environment.navigate({ uri: 'file:///__kcl_std__/never-served.kcl', line: 1, column: 1 });

    expect(openFileCalls()).toHaveLength(2);
    expect(openFileCalls().at(-1)).toEqual(expect.objectContaining({ lineNumber: 40, column: 2 }));
  });

  it('should ignore declaration text for paths outside a library root', async () => {
    editorRef.send.mockClear();
    const environment = await mountEnvironment();
    await environment.navigate({ uri: 'file:///main.kcl', line: 1, column: 1, declaration: { text: 'x' } });
    expect(openFileCalls()).toEqual([]);
  });
});
