import { describe, expect, it } from 'vitest';
import { getEditorLanguage } from '#lib/editor-languages.js';

describe('source language selection', () => {
  it.each([
    ['source.ts', 'typescript'],
    ['source.tsx', 'typescriptreact'],
    ['source.js', 'javascript'],
    ['source.jsx', 'javascriptreact'],
    ['source.mts', 'typescript'],
    ['source.cts', 'typescript'],
    ['source.mjs', 'javascript'],
    ['source.cjs', 'javascript'],
    ['schema.json', 'json'],
    ['schema.jsonc', 'jsonc'],
    ['rows.jsonl', 'jsonl'],
    ['README.md', 'markdown'],
    ['README.markdown', 'markdown'],
    ['run.sh', 'bash'],
    ['run.bash', 'bash'],
    ['main.py', 'python'],
    ['main.cs', 'csharp'],
    ['main.kcl', 'kcl'],
    ['main.scad', 'openscad'],
    ['part.step', 'stepfile'],
    ['part.stl', 'stl'],
    ['part.usd', 'usd'],
    ['system.sysml', 'sysml'],
    ['config.yaml', 'yaml'],
    ['config.yml', 'yaml'],
  ])('should select %s as %s without starting an editor', (path, expected) => {
    expect(getEditorLanguage(path)).toBe(expected);
  });

  it('should leave unknown extensions in plain text mode', () => {
    expect(getEditorLanguage('notes.unknown')).toBeUndefined();
    expect(getEditorLanguage('LICENSE')).toBeUndefined();
  });
});
