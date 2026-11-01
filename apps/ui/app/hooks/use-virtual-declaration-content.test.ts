import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { EditorDocumentSession } from '#lib/editor-document-session.js';
import { useVirtualDeclarationContent } from '#hooks/use-virtual-declaration-content.js';

function createSession(): EditorDocumentSession {
  const content = mock<FileContentService>();
  content.onDidContentChange.mockReturnValue(() => undefined);
  content.onDidChangeOutcome.mockReturnValue(() => undefined);
  return new EditorDocumentSession({ contentService: content, projectId: 'declarations' });
}

describe('useVirtualDeclarationContent', () => {
  it('should serve a declaration the session holds', () => {
    const session = createSession();
    session.openDeclaration('node_modules/replicad/index.d.ts', 'export declare const makeCylinder: () => void;');
    const { result } = renderHook(() => useVirtualDeclarationContent(session, 'node_modules/replicad/index.d.ts'));
    expect(result.current?.kind).toBe('text');
  });

  it('should leave a declaration path the session does not hold to the filesystem', () => {
    const session = createSession();
    const { result } = renderHook(() => useVirtualDeclarationContent(session, 'node_modules/replicad/index.d.ts'));
    expect(result.current).toBeUndefined();
  });

  it('should leave project files to the filesystem', () => {
    const session = createSession();
    const { result } = renderHook(() => useVirtualDeclarationContent(session, 'main.ts'));
    expect(result.current).toBeUndefined();
  });
});
