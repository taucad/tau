import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRawEngine } from 'shiki/engine/javascript';

export const highlighter = await createHighlighterCore({
  themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark')],
  langs: [import('@shikijs/langs-precompiled/javascript'), import('@shikijs/langs-precompiled/typescript')],
  engine: createJavaScriptRawEngine(),
});
