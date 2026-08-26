import type { LanguageInput } from 'shiki';

export const runtimeShikiLanguageLoaders = [
  import('@shikijs/langs-precompiled/bash'),
  import('@shikijs/langs-precompiled/javascript'),
  import('@shikijs/langs-precompiled/jsx'),
  import('@shikijs/langs-precompiled/json'),
  import('@shikijs/langs-precompiled/jsonc'),
  import('@shikijs/langs-precompiled/jsonl'),
  import('@shikijs/langs-precompiled/markdown'),
  import('@shikijs/langs-precompiled/tsx'),
  import('@shikijs/langs-precompiled/typescript'),
  import('#lib/openscad-language/openscad-shiki-precompiled.js'),
  import('#lib/kcl-language/kcl-shiki-precompiled.js'),
  import('#lib/stepfile-language/stepfile-shiki-precompiled.js'),
  import('#lib/stl-language/stl-shiki-precompiled.js'),
  import('#lib/usd-language/usd-shiki-precompiled.js'),
  import('#lib/sysml-language/sysml-shiki-precompiled.js'),
] as unknown as LanguageInput[];
