import { describe, expect, it, onTestFinished } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { EditorDocumentSession } from '#lib/editor-document-session.js';
import { applyEditorWorkspaceEdits } from '#lib/editor-workspace-edits.js';

function fixture() {
  const content = mock<FileContentService>();
  content.resolve.mockResolvedValue({ kind: 'text', content: new TextEncoder().encode('old') });
  content.saveEditor.mockResolvedValue(undefined);
  content.peekOutcome.mockReturnValue({ kind: 'text', content: new TextEncoder().encode('new') });
  content.onDidContentChange.mockReturnValue(() => undefined);
  content.onDidChangeOutcome.mockReturnValue(() => undefined);
  const treeService = mock<FileTreeService>();
  treeService.getEntry.mockImplementation(async (path) => ({
    type: 'file',
    path,
    name: path,
    size: 3,
    contentKind: 'text',
    isLoaded: true,
    mtimeMs: 0,
  }));
  const session = new EditorDocumentSession({ contentService: content, projectId: 'test' });
  onTestFinished(() => {
    session.dispose();
  });
  return { session, treeService, content };
}

const edit = (uri: string, baseText = 'old') => ({ uri, baseText, changes: [{ from: 0, to: 3, insert: 'new' }] });

describe('checked workspace edits', () => {
  it('should refuse read-only dependency targets before changing project files', async () => {
    const environment = fixture();
    environment.treeService.getEntry.mockImplementation(async (path) => ({
      type: 'file',
      path,
      name: path,
      size: 3,
      contentKind: 'text',
      isLoaded: true,
      mtimeMs: 0,
      provenance: { source: path === 'b.ts' ? 'dependencies' : 'project', versioned: false, agentAccess: 'read-only' },
    }));
    expect(await applyEditorWorkspaceEdits(environment, [edit('file:///a.ts'), edit('file:///b.ts')])).toBe(false);
    expect(environment.session.get('a.ts')?.text).toBe('old');
    expect(environment.content.saveEditor).not.toHaveBeenCalled();
  });

  it('should preflight closed files and save through checked editor persistence', async () => {
    const environment = fixture();
    expect(await applyEditorWorkspaceEdits(environment, [edit('file:///a.ts'), edit('file:///b.ts')])).toBe(true);
    expect(environment.session.get('a.ts')?.text).toBe('new');
    expect(environment.content.saveEditor).toHaveBeenCalledWith(
      'a.ts',
      new TextEncoder().encode('new'),
      new TextEncoder().encode('old'),
    );
  });

  it('should refuse every edit when a later target differs from the worker basis', async () => {
    const environment = fixture();
    expect(await applyEditorWorkspaceEdits(environment, [edit('file:///a.ts'), edit('file:///b.ts', 'bad')])).toBe(
      false,
    );
    expect(environment.session.get('a.ts')?.text).toBe('old');
    expect(environment.content.saveEditor).not.toHaveBeenCalled();
  });

  it('should recheck earlier versions after an asynchronous target read', async () => {
    const environment = fixture();
    environment.treeService.getEntry.mockImplementation(async (path) => {
      if (path === 'b.ts') {
        const document = environment.session.get('a.ts')!;
        document.apply({
          expectedVersion: document.version,
          origin: 'view',
          changes: [{ from: 0, to: 0, insert: '!' }],
        });
      }
      return { type: 'file', path, name: path, size: 3, contentKind: 'text', isLoaded: true, mtimeMs: 0 };
    });
    expect(await applyEditorWorkspaceEdits(environment, [edit('file:///a.ts'), edit('file:///b.ts')])).toBe(false);
    expect(environment.session.get('a.ts')?.text).toBe('!old');
    expect(environment.session.get('b.ts')?.text).toBe('old');
    expect(environment.content.saveEditor).not.toHaveBeenCalled();
  });

  it.each(['file://other/a.ts', 'file:///a.ts?version=1', 'file:///a.ts#selection', 'https://example.com/a.ts'])(
    'should refuse nonlocal or decorated edit URI %s',
    async (uri) => {
      const environment = fixture();
      expect(await applyEditorWorkspaceEdits(environment, [edit(uri)])).toBe(false);
      expect(environment.content.resolve).not.toHaveBeenCalled();
    },
  );

  it('should refuse malformed edit ranges before changing any document', async () => {
    const environment = fixture();
    expect(
      await applyEditorWorkspaceEdits(environment, [
        edit('file:///a.ts'),
        {
          uri: 'file:///b.ts',
          baseText: 'old',
          changes: [{ from: 0, to: 30, insert: 'bad' }],
        },
      ]),
    ).toBe(false);
    expect(environment.session.get('a.ts')?.text).toBe('old');
  });
});
