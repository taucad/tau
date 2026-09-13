/**
 * Monaco Editor Constants
 *
 * Centralized constants for Monaco language IDs, file extensions, and URI prefixes.
 * Follows pattern from @packages/types/src/constants/code.constants.ts
 */

export const monacoLanguages = {
  typescript: 'typescript',
  typescriptreact: 'typescriptreact',
  javascript: 'javascript',
  javascriptreact: 'javascriptreact',
  json: 'json',
  jsonl: 'jsonl',
  jsonc: 'jsonc',
  kcl: 'kcl',
  openscad: 'openscad',
  stepfile: 'stepfile',
  stl: 'stl',
  usd: 'usd',
  sysml: 'sysml',
} as const;

export type MonacoLanguage = (typeof monacoLanguages)[keyof typeof monacoLanguages];

export const extensionToMonacoLanguage: Record<string, MonacoLanguage> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  mts: 'typescript',
  mjs: 'javascript',
  json: 'json',
  jsonl: 'jsonl',
  jsonc: 'jsonc',
  kcl: 'kcl',
  scad: 'openscad',
  step: 'stepfile',
  stp: 'stepfile',
  p21: 'stepfile',
  stl: 'stl',
  usd: 'usd',
  sysml: 'sysml',
  kerml: 'sysml',
  usda: 'usd',
  usdc: 'usd',
  usdz: 'usd',
};

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
  const ext = path.split('.').pop();
  return ext ? extensionToMonacoLanguage[ext] : undefined;
}
