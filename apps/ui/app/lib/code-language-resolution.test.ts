import { describe, expect, it } from 'vitest';
import {
  extractLanguageFromClassName,
  resolveHighlightLanguage,
  resolveHighlightLanguageForPath,
  supportedHighlightLanguages,
} from '#lib/code-language-resolution.js';

describe('code language resolution', () => {
  it('resolves every supported highlight language directly', () => {
    for (const language of supportedHighlightLanguages) {
      expect(resolveHighlightLanguage(language)).toEqual({
        input: language,
        displayLanguage: language,
        shikiLanguage: language,
        isSupported: true,
      });
    }
  });

  it('normalizes common aliases to supported Shiki languages', () => {
    expect(resolveHighlightLanguage('md').shikiLanguage).toBe('markdown');
    expect(resolveHighlightLanguage('sh').shikiLanguage).toBe('bash');
    expect(resolveHighlightLanguage('shellscript').shikiLanguage).toBe('bash');
    expect(resolveHighlightLanguage('ts').shikiLanguage).toBe('typescript');
    expect(resolveHighlightLanguage('js').shikiLanguage).toBe('javascript');
    expect(resolveHighlightLanguage('scad').shikiLanguage).toBe('openscad');
    expect(resolveHighlightLanguage('stp').shikiLanguage).toBe('stepfile');
    expect(resolveHighlightLanguage('kerml').shikiLanguage).toBe('sysml');
  });

  it('keeps unsupported display labels while falling back to plaintext', () => {
    expect(resolveHighlightLanguage('python')).toEqual({
      input: 'python',
      displayLanguage: 'python',
      shikiLanguage: 'plaintext',
      isSupported: false,
    });
  });

  it('uses plaintext when no language input is present', () => {
    expect(resolveHighlightLanguage(undefined)).toEqual({
      input: undefined,
      displayLanguage: 'plaintext',
      shikiLanguage: 'plaintext',
      isSupported: false,
    });
  });

  it('resolves file paths by extension', () => {
    expect(resolveHighlightLanguageForPath('README.md').shikiLanguage).toBe('markdown');
    expect(resolveHighlightLanguageForPath('docs/guide.markdown').shikiLanguage).toBe('markdown');
    expect(resolveHighlightLanguageForPath('main.scad').shikiLanguage).toBe('openscad');
    expect(resolveHighlightLanguageForPath('data.jsonl').shikiLanguage).toBe('jsonl');
    expect(resolveHighlightLanguageForPath('unknown.xyz').shikiLanguage).toBe('plaintext');
  });

  it('extracts non-word markdown code fence language classes', () => {
    expect(extractLanguageFromClassName('language-c++')).toBe('c++');
    expect(extractLanguageFromClassName('some-class language-shell-session another')).toBe('shell-session');
    expect(extractLanguageFromClassName('language-objective-c')).toBe('objective-c');
  });
});
