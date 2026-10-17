import type { LanguageInput } from 'shiki';

/**
 * Grammar loaders, as functions: the highlighter calls them when it is
 * created, so a module that imports this list loads no grammar (startup R7,
 * B-16 / D-UI-09). A top-level `import()` here ran on module evaluation and
 * fetched all 18 grammars as soon as the chat chunk loaded.
 */
export const runtimeShikiLanguageLoaders = [
  async () => import('@shikijs/langs-precompiled/bash'),
  async () => import('@shikijs/langs-precompiled/javascript'),
  async () => import('@shikijs/langs-precompiled/jsx'),
  async () => import('@shikijs/langs-precompiled/json'),
  async () => import('@shikijs/langs-precompiled/jsonc'),
  async () => import('@shikijs/langs-precompiled/jsonl'),
  async () => import('@shikijs/langs-precompiled/markdown'),
  async () => import('#lib/python-language/python-shiki-precompiled.js'),
  async () => import('@shikijs/langs-precompiled/csharp'),
  async () => import('@shikijs/langs-precompiled/tsx'),
  async () => import('@shikijs/langs-precompiled/typescript'),
  async () => import('@shikijs/langs-precompiled/yaml'),
  async () => import('@taucad/grammars/openscad'),
  async () => import('@taucad/grammars/kcl'),
  async () => import('@taucad/grammars/stepfile'),
  async () => import('@taucad/grammars/stl'),
  async () => import('@taucad/grammars/usd'),
  async () => import('@taucad/grammars/sysml'),
] as unknown as LanguageInput[];
