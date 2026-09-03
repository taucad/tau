/**
 * Monaco Editor Constants
 *
 * Centralized constants for Monaco language IDs, file extensions, and URI prefixes.
 * Follows pattern from @libs/types/src/constants/code.constants.ts
 */
import type { CodeLanguage } from '@taucad/types';
import { languageFromExtension } from '@taucad/types/constants';

export const monacoLanguages = {
  typescript: 'typescript',
  typescriptreact: 'typescriptreact',
  javascript: 'javascript',
  javascriptreact: 'javascriptreact',
  bash: 'bash',
  python: 'python',
  csharp: 'csharp',
  json: 'json',
  jsonl: 'jsonl',
  jsonc: 'jsonc',
  markdown: 'markdown',
  kcl: 'kcl',
  openscad: 'openscad',
  stepfile: 'stepfile',
  stl: 'stl',
  usd: 'usd',
  sysml: 'sysml',
} as const;

export type MonacoLanguage = (typeof monacoLanguages)[keyof typeof monacoLanguages];

export const codeLanguageToMonacoLanguage = {
  bash: monacoLanguages.bash,
  javascript: monacoLanguages.javascript,
  jsx: monacoLanguages.javascriptreact,
  json: monacoLanguages.json,
  jsonc: monacoLanguages.jsonc,
  jsonl: monacoLanguages.jsonl,
  kcl: monacoLanguages.kcl,
  markdown: monacoLanguages.markdown,
  openscad: monacoLanguages.openscad,
  python: monacoLanguages.python,
  csharp: monacoLanguages.csharp,
  stepfile: monacoLanguages.stepfile,
  stl: monacoLanguages.stl,
  sysml: monacoLanguages.sysml,
  tsx: monacoLanguages.typescriptreact,
  typescript: monacoLanguages.typescript,
  usd: monacoLanguages.usd,
} as const satisfies Record<CodeLanguage, MonacoLanguage>;

const uiOnlyExtensionToCodeLanguage = {
  cjs: 'javascript',
  mjs: 'javascript',
  cts: 'typescript',
  mts: 'typescript',
  bash: 'bash',
} as const satisfies Record<string, CodeLanguage>;

export const extensionToMonacoLanguage = Object.fromEntries(
  [...Object.entries(languageFromExtension), ...Object.entries(uiOnlyExtensionToCodeLanguage)].map(
    ([extension, language]) => [extension, codeLanguageToMonacoLanguage[language]],
  ),
) as Record<string, MonacoLanguage>;

export const jsLikeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'] as const;
export type JsLikeExtension = (typeof jsLikeExtensions)[number];

/**
 * Check if a file path is a JavaScript-like file.
 */
export function isJsLikeFile(path: string): boolean {
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ext is conventional abbreviation for extension
  return jsLikeExtensions.some((ext) => path.endsWith(ext));
}

/**
 * Get Monaco language ID from file extension.
 */
export function getMonacoLanguage(path: string): MonacoLanguage | undefined {
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ext is conventional abbreviation for extension
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? extensionToMonacoLanguage[ext] : undefined;
}
