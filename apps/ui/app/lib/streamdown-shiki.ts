import { createBundledHighlighter } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import {
  bundledLanguages as shikiBundledLanguages,
  bundledLanguagesInfo as shikiBundledLanguagesInfo,
} from 'shiki/langs';
import { bundledThemes } from 'shiki/themes';

/** Bundled language loaders expected by Streamdown's language predicate. */
export const bundledLanguages = { ...shikiBundledLanguages };
export const bundledLanguagesInfo = [...shikiBundledLanguagesInfo];

/** Streamdown's bundled Shiki surface using its selected JavaScript regex engine without an unused Oniguruma fallback. */
export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine({ forgiving: true }),
});
