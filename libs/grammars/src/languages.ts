import { languageFromExtension } from '@taucad/types/constants';

/** Every language Tau highlights, in the editor and on every static code surface. */
export const highlightLanguages = [
  'bash',
  'csharp',
  'javascript',
  'json',
  'jsonc',
  'jsonl',
  'jsx',
  'kcl',
  'markdown',
  'openscad',
  'python',
  'stepfile',
  'stl',
  'sysml',
  'tsx',
  'typescript',
  'usd',
  'yaml',
] as const;

export type HighlightLanguage = (typeof highlightLanguages)[number];

const highlightLanguageSet = new Set<string>(highlightLanguages);

/** Names a fence, a file extension or a language server may use for a highlight language. */
export const highlightLanguageAliases: Readonly<Record<string, HighlightLanguage>> = {
  ...languageFromExtension,
  cjs: 'javascript',
  mjs: 'javascript',
  js: 'javascript',
  javascriptreact: 'jsx',
  typescriptreact: 'tsx',
  mts: 'typescript',
  cts: 'typescript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  zsh: 'bash',
  cs: 'csharp',
  'c#': 'csharp',
  py: 'python',
  scad: 'openscad',
  md: 'markdown',
  yml: 'yaml',
  jsonlines: 'jsonl',
  'json-lines': 'jsonl',
  ndjson: 'jsonl',
  step: 'stepfile',
  usda: 'usd',
};

/** The highlight language for a language id, alias or extension; undefined for plain text. */
export function resolveHighlightLanguageId(input: string | undefined): HighlightLanguage | undefined {
  const normalized = input?.trim().toLowerCase().replace(/^\./u, '');
  if (!normalized) {
    return undefined;
  }
  if (highlightLanguageSet.has(normalized)) {
    return normalized as HighlightLanguage;
  }
  return highlightLanguageAliases[normalized];
}

/** The highlight language for a file path, by its extension. */
export function resolveHighlightLanguageIdForPath(path: string): HighlightLanguage | undefined {
  const fileName = path.split('/').at(-1) ?? path;
  return fileName.includes('.') ? resolveHighlightLanguageId(fileName.split('.').at(-1)) : undefined;
}
