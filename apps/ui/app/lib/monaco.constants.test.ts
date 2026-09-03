import { describe, it, expect } from 'vitest';
import { languageFromExtension } from '@taucad/types/constants';
import { codeLanguageToMonacoLanguage, extensionToMonacoLanguage, monacoLanguages } from '#lib/monaco.constants.js';

describe('JSON-family language mappings', () => {
  describe('jsonl', () => {
    it('should map to a distinct language from json so the JSON validator does not flag multi-root documents', () => {
      expect(languageFromExtension.jsonl).not.toBe(languageFromExtension.json);
      expect(languageFromExtension.jsonl).toBe('jsonl');
    });

    it('should have a dedicated Monaco language ID separate from json', () => {
      expect(extensionToMonacoLanguage['jsonl']).toBe(monacoLanguages.jsonl);
      expect(monacoLanguages.jsonl).not.toBe(monacoLanguages.json);
    });
  });

  describe('jsonc', () => {
    it('should map to the jsonc language that allows comments without diagnostics errors', () => {
      expect(languageFromExtension.jsonc).toBe('jsonc');
    });

    it('should have a dedicated Monaco language ID for JSON with Comments', () => {
      expect(extensionToMonacoLanguage['jsonc']).toBe(monacoLanguages.jsonc);
      expect(monacoLanguages.jsonc).toBe('jsonc');
    });

    it('should be distinct from plain json so comment syntax is not flagged', () => {
      expect(monacoLanguages.jsonc).not.toBe(monacoLanguages.json);
      expect(languageFromExtension.jsonc).not.toBe(languageFromExtension.json);
    });
  });

  describe('json', () => {
    it('should remain unchanged as strict json', () => {
      expect(languageFromExtension.json).toBe('json');
      expect(extensionToMonacoLanguage['json']).toBe('json');
    });
  });
});

describe('Markdown language mappings', () => {
  it('should map markdown extensions through the shared language contract', () => {
    expect(languageFromExtension.md).toBe('markdown');
    expect(languageFromExtension.markdown).toBe('markdown');
    expect(extensionToMonacoLanguage['md']).toBe(monacoLanguages.markdown);
    expect(extensionToMonacoLanguage['markdown']).toBe(monacoLanguages.markdown);
  });
});

describe('derived Monaco language mapping', () => {
  it('should adapt shared JSX/TSX code language ids to Monaco family ids', () => {
    expect(codeLanguageToMonacoLanguage.jsx).toBe(monacoLanguages.javascriptreact);
    expect(codeLanguageToMonacoLanguage.tsx).toBe(monacoLanguages.typescriptreact);
    expect(extensionToMonacoLanguage['jsx']).toBe(monacoLanguages.javascriptreact);
    expect(extensionToMonacoLanguage['tsx']).toBe(monacoLanguages.typescriptreact);
  });

  it('should preserve UI-only module extension aliases without changing shared import mappings', () => {
    expect(extensionToMonacoLanguage['mjs']).toBe(monacoLanguages.javascript);
    expect(extensionToMonacoLanguage['mts']).toBe(monacoLanguages.typescript);
  });

  it('should register shell files with the Tau bash language id', () => {
    expect(languageFromExtension.sh).toBe('bash');
    expect(extensionToMonacoLanguage['sh']).toBe(monacoLanguages.bash);
    expect(extensionToMonacoLanguage['bash']).toBe(monacoLanguages.bash);
  });

  it("should map C# files to Monaco's built-in C# language", () => {
    expect(languageFromExtension.cs).toBe('csharp');
    expect(extensionToMonacoLanguage['cs']).toBe(monacoLanguages.csharp);
  });
});
