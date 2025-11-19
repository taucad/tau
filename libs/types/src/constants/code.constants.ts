export const codeLanguages = {
  typescript: 'typescript',
  kcl: 'kcl',
  openscad: 'openscad',
  javascript: 'javascript',
  jsx: 'jsx',
  tsx: 'tsx',
  bash: 'bash',
  json: 'json',
} as const;

export const languageFromExtension = {
  kcl: 'kcl',
  scad: 'openscad',
  openscad: 'scad',
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  sh: 'bash',
  json: 'json',
} as const;
