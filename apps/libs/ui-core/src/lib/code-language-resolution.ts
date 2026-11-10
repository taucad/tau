import { resolveHighlightLanguageId } from '@taucad/grammars';
import type { HighlightLanguage } from '@taucad/grammars';

export const plaintextHighlightLanguage = 'plaintext';

export type CodeLanguage = HighlightLanguage | typeof plaintextHighlightLanguage;
export type HighlightLanguageInput = string | undefined;

export type ResolvedHighlightLanguage = {
  readonly input: string | undefined;
  readonly displayLanguage: string;
  readonly language: CodeLanguage;
  readonly isSupported: boolean;
};

export function resolveHighlightLanguage(input: HighlightLanguageInput): ResolvedHighlightLanguage {
  const trimmed = input?.trim().toLowerCase().replace(/^\./u, '');
  const normalizedInput = trimmed === '' ? undefined : trimmed;
  const language = resolveHighlightLanguageId(normalizedInput);
  return {
    input: normalizedInput,
    displayLanguage: normalizedInput ?? plaintextHighlightLanguage,
    language: language ?? plaintextHighlightLanguage,
    isSupported: language !== undefined,
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
