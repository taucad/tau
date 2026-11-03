import type { HighlightLanguage } from '@taucad/grammars';
import { resolveHighlightLanguageForPath } from '#lib/code-language-resolution.js';

/** Canonical editor language identifiers; metadata never imports an editor runtime. */
export type EditorLanguage = HighlightLanguage | 'typescriptreact' | 'javascriptreact';

export const getEditorLanguage = (path: string): EditorLanguage | undefined => {
  const resolved = resolveHighlightLanguageForPath(path);
  if (!resolved.isSupported || resolved.language === 'plaintext') {
    return undefined;
  }
  if (resolved.language === 'tsx') {
    return 'typescriptreact';
  }
  if (resolved.language === 'jsx') {
    return 'javascriptreact';
  }
  return resolved.language;
};

export const jsLikeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'] as const;
export type JsLikeExtension = (typeof jsLikeExtensions)[number];
export const isJsLikeFile = (path: string): boolean =>
  jsLikeExtensions.some((extension) => path.toLowerCase().endsWith(extension));
