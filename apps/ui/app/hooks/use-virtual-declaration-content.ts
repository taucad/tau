import { useMemo } from 'react';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import type { EditorDocumentSession } from '@taucad/editor-ui/lib/editor-document-session';
import { isVirtualDeclarationPath } from '@taucad/editor-ui/lib/virtual-declarations';

const encoder = new TextEncoder();

/**
 * A library declaration's text for its read-only tab, served by the editor session instead of the filesystem.
 * `undefined` for a project file, and for a declaration path the session does not hold, which then reads from the
 * filesystem: installed package types under `node_modules/` live there too.
 */
export function useVirtualDeclarationContent(
  session: EditorDocumentSession | undefined,
  path: string,
): FileContentResult | undefined {
  return useMemo((): FileContentResult | undefined => {
    if (!isVirtualDeclarationPath(path)) {
      return undefined;
    }
    if (!session) {
      return { kind: 'loading' };
    }
    const text = session.declarationText(path);
    return text === undefined ? undefined : { kind: 'text', content: encoder.encode(text) };
  }, [session, path]);
}
