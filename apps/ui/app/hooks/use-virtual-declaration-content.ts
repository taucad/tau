import { useMemo } from 'react';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import type { EditorDocumentSession } from '#lib/editor-document-session.js';
import { isVirtualDeclarationPath } from '#lib/virtual-declarations.js';

const encoder = new TextEncoder();

/**
 * A library declaration's text for its read-only tab, served by the editor session instead of the filesystem.
 * `undefined` for a project file. A declaration the session no longer holds, such as one restored after a
 * reload, reads as not found.
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
    return text === undefined ? { kind: 'orphaned' } : { kind: 'text', content: encoder.encode(text) };
  }, [session, path]);
}
