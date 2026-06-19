import { languageFromExtension } from '@taucad/types/constants';

export const plaintextHighlightLanguage = 'plaintext';

export const supportedHighlightLanguages = [
  'bash',
  'javascript',
  'jsx',
  'json',
  'jsonc',
  'jsonl',
  'kcl',
  'markdown',
  'openscad',
  'stepfile',
  'stl',
  'sysml',
  'tsx',
  'typescript',
  'usd',
] as const;

export type HighlightLanguage = (typeof supportedHighlightLanguages)[number];
export type ShikiLanguage = HighlightLanguage | typeof plaintextHighlightLanguage;
export type HighlightLanguageInput = string | undefined;

export type ResolvedHighlightLanguage = {
  readonly input: string | undefined;
  readonly displayLanguage: string;
  readonly shikiLanguage: ShikiLanguage;
  readonly isSupported: boolean;
};

export const builtinHighlightLanguages = [
  'bash',
  'javascript',
  'jsx',
  'json',
  'jsonc',
  'jsonl',
  'markdown',
  'tsx',
  'typescript',
] as const satisfies readonly HighlightLanguage[];

export const customHighlightLanguages = [
  'kcl',
  'openscad',
  'stepfile',
  'stl',
  'sysml',
  'usd',
] as const satisfies readonly HighlightLanguage[];

const supportedHighlightLanguageSet = new Set<string>(supportedHighlightLanguages);

const extensionAliases = Object.fromEntries(
  Object.entries(languageFromExtension).map(([extension, language]) => [extension, language]),
) as Record<string, HighlightLanguage>;

const highlightLanguageAliasEntries = {
  ...extensionAliases,
  cjs: 'javascript',
  mjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  zsh: 'bash',
  md: 'markdown',
  markdown: 'markdown',
  jsonlines: 'jsonl',
  'json-lines': 'jsonl',
  ndjson: 'jsonl',
} as const satisfies Record<string, HighlightLanguage>;

export const highlightLanguageAliases: Readonly<Record<string, HighlightLanguage>> = highlightLanguageAliasEntries;

function normalizeLanguageInput(input: HighlightLanguageInput): string | undefined {
  const trimmed = input?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.toLowerCase().replace(/^\./, '');
}

export function resolveHighlightLanguage(input: HighlightLanguageInput): ResolvedHighlightLanguage {
  const normalizedInput = normalizeLanguageInput(input);
  if (!normalizedInput) {
    return {
      input: undefined,
      displayLanguage: plaintextHighlightLanguage,
      shikiLanguage: plaintextHighlightLanguage,
      isSupported: false,
    };
  }

  const aliasedLanguage = highlightLanguageAliases[normalizedInput];
  const shikiLanguage =
    aliasedLanguage ?? (supportedHighlightLanguageSet.has(normalizedInput) ? normalizedInput : undefined);

  if (shikiLanguage) {
    return {
      input: normalizedInput,
      displayLanguage: normalizedInput,
      shikiLanguage: shikiLanguage as HighlightLanguage,
      isSupported: true,
    };
  }

  return {
    input: normalizedInput,
    displayLanguage: normalizedInput,
    shikiLanguage: plaintextHighlightLanguage,
    isSupported: false,
  };
}

export function resolveHighlightLanguageForPath(path: string): ResolvedHighlightLanguage {
  const fileName = path.split('/').at(-1) ?? path;
  const extension = fileName.includes('.') ? fileName.split('.').at(-1) : undefined;
  return resolveHighlightLanguage(extension);
}

export function extractLanguageFromClassName(className: string | undefined): string | undefined {
  const languageClass = className?.split(/\s+/u).find((entry) => entry.startsWith('language-'));
  const language = languageClass?.slice('language-'.length).trim();
  return language === '' ? undefined : language;
}
