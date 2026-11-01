import type { Extension } from '@codemirror/state';
import { loadLanguage, resolveHighlightLanguageId } from '@taucad/grammars';

/** Load the syntax of an admitted code pane through the shared grammar registry. Failed imports stay retryable. */
export const loadEditorSyntax = async (languageId: string, signal?: AbortSignal): Promise<Extension> => {
  signal?.throwIfAborted();
  const language = resolveHighlightLanguageId(languageId);
  if (!language) {
    return [];
  }
  const support = await loadLanguage(language);
  signal?.throwIfAborted();
  return support;
};
