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
  import('@taucad/grammars/openscad'),
  import('@taucad/grammars/kcl'),
  import('@taucad/grammars/stepfile'),
  import('@taucad/grammars/stl'),
  import('@taucad/grammars/usd'),
  import('@taucad/grammars/sysml'),
] as unknown as LanguageInput[];
