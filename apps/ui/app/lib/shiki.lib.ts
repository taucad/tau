import type { HighlighterCore } from 'shiki/core';
import { runtimeShikiLanguageLoaders } from '#lib/shiki-language-loaders.js';

/**
 * Shiki helpers for the UI.
 *
 * Avoid `transformerNotationDiff` / `[!code …]` comment markers for multi-language
 * editors: those markers are only stripped when the active TextMate grammar
 * classifies the surrounding token as a comment, so `// [!code ++]` leaks on
 * grammars without `//` line comments.
 *
 * Prefer the `line` transformer in `diff-viewer.tsx` for diff styling.
 */
let cachedHighlighter: Promise<HighlighterCore> | undefined;

/**
 * Lazily create and return a memoized Shiki highlighter instance.
 * Defers grammar evaluation until first use, avoiding top-level `await`
 * that blocks module graph evaluation on startup.
 */
export const getHighlighter = async (): Promise<HighlighterCore> => {
  cachedHighlighter ??= (async () => {
    const { createHighlighterCore } = await import('shiki/core');
    const { createJavaScriptRawEngine } = await import('shiki/engine/javascript');

    return createHighlighterCore({
      themes: [
        import('@shikijs/themes/github-light'),
        import('@shikijs/themes/github-dark'),
        import('@shikijs/themes/github-light-high-contrast'),
        import('@shikijs/themes/github-dark-high-contrast'),
      ],
      langs: runtimeShikiLanguageLoaders,
      engine: createJavaScriptRawEngine(),
    });
  })();
  return cachedHighlighter;
};
