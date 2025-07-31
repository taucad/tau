import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRawEngine } from 'shiki/engine/javascript';

export const highlighter = await createHighlighterCore({
  themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark')],
  langs: [
    import('@shikijs/langs-precompiled/javascript'),
    import('@shikijs/langs-precompiled/typescript'),
    // @ts-expect-error -- TODO: migrate the precompiled grammar to the Shiki project.
    import('#lib/openscad-language/openscad-shiki-precompiled.js'),
    // @ts-expect-error -- TODO: migrate the precompiled grammar to the Shiki project.
    import('#lib/kcl-language/kcl-shiki-precompiled.js'),
  ],
  engine: createJavaScriptRawEngine(),
});
