/**
 * @public
 */
export const codeLanguages = {
  typescript: 'typescript',
  kcl: 'kcl',
  openscad: 'openscad',
  stepfile: 'stepfile',
  stl: 'stl',
  usd: 'usd',
  sysml: 'sysml',
  javascript: 'javascript',
  jsx: 'jsx',
  tsx: 'tsx',
  bash: 'bash',
  json: 'json',
  jsonl: 'jsonl',
  jsonc: 'jsonc',
} as const;

/**
 * @public
 */
export const languageFromExtension = {
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
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  sh: 'bash',
  json: 'json',
  jsonl: 'jsonl',
  jsonc: 'jsonc',
} as const;
