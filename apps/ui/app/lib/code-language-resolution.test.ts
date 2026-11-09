import { describe, expect, it } from 'vitest';
import {
  extractLanguageFromClassName,
  resolveHighlightLanguage,
  resolveHighlightLanguageForPath,
} from '#lib/code-language-resolution.js';
import { highlightLanguages } from '@taucad/grammars';

describe('code language resolution', () => {
  it('resolves every supported highlight language directly', () => {
    for (const language of highlightLanguages) {
      expect(resolveHighlightLanguage(language)).toEqual({
        input: language,
        displayLanguage: language,
        language,
        isSupported: true,
      });
    }
  });

  it('normalizes common aliases to supported highlight languages', () => {
    expect(resolveHighlightLanguage('md').language).toBe('markdown');
    expect(resolveHighlightLanguage('sh').language).toBe('bash');
    expect(resolveHighlightLanguage('shellscript').language).toBe('bash');
    expect(resolveHighlightLanguage('ts').language).toBe('typescript');
    expect(resolveHighlightLanguage('js').language).toBe('javascript');
    expect(resolveHighlightLanguage('scad').language).toBe('openscad');
    expect(resolveHighlightLanguage('stp').language).toBe('stepfile');
    expect(resolveHighlightLanguage('kerml').language).toBe('sysml');
    expect(resolveHighlightLanguage('cs').language).toBe('csharp');
  });

  it('keeps unsupported display labels while falling back to plaintext', () => {
    expect(resolveHighlightLanguage('brainfuck')).toEqual({
      input: 'brainfuck',
      displayLanguage: 'brainfuck',
      language: 'plaintext',
      isSupported: false,
    });
  });

  it('uses plaintext when no language input is present', () => {
    expect(resolveHighlightLanguage(undefined)).toEqual({
      input: undefined,
      displayLanguage: 'plaintext',
      language: 'plaintext',
      isSupported: false,
    });
  });

  it('resolves file paths by extension', () => {
    expect(resolveHighlightLanguageForPath('README.md').language).toBe('markdown');
    expect(resolveHighlightLanguageForPath('docs/guide.markdown').language).toBe('markdown');
    expect(resolveHighlightLanguageForPath('main.scad').language).toBe('openscad');
    expect(resolveHighlightLanguageForPath('data.jsonl').language).toBe('jsonl');
    expect(resolveHighlightLanguageForPath('main.cs').language).toBe('csharp');
    expect(resolveHighlightLanguageForPath('unknown.xyz').language).toBe('plaintext');
  });

  it('extracts non-word markdown code fence language classes', () => {
    expect(extractLanguageFromClassName('language-c++')).toBe('c++');
    expect(extractLanguageFromClassName('some-class language-shell-session another')).toBe('shell-session');
    expect(extractLanguageFromClassName('language-objective-c')).toBe('objective-c');
  });
});
