import type { Extension } from '@codemirror/state';

/** Load only the syntax family of an admitted code pane. Failed imports remain retryable. */
export const loadEditorSyntax = async (languageId: string, signal?: AbortSignal): Promise<Extension> => {
  const assertActive = (): void => {
    signal?.throwIfAborted();
  };
  assertActive();
  switch (languageId) {
    case 'typescript':
    case 'typescriptreact':
    case 'tsx':
    case 'javascript':
    case 'javascriptreact':
    case 'jsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      assertActive();
      return javascript({
        typescript: ['typescript', 'typescriptreact', 'tsx'].includes(languageId),
        jsx: ['typescriptreact', 'javascriptreact', 'tsx', 'jsx'].includes(languageId),
      });
    }
    case 'python': {
      const { python } = await import('@codemirror/lang-python');
      assertActive();
      return python();
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      assertActive();
      return json();
    }
    case 'markdown': {
      const [{ markdown }, languageModule, { supportedHighlightLanguages, highlightLanguageAliases }] =
        await Promise.all([
          import('@codemirror/lang-markdown'),
          import('@codemirror/language'),
          import('#lib/code-language-resolution.js'),
        ]);
      assertActive();
      return markdown({
        codeLanguages: supportedHighlightLanguages
          .filter((id) => id !== 'markdown')
          .map((id) =>
            languageModule.LanguageDescription.of({
              name: id,
              alias: Object.entries(highlightLanguageAliases)
                .filter(([, language]) => language === id)
                .map(([alias]) => alias),
              load: async () => {
                const syntax = await loadEditorSyntax(id);
                if (syntax instanceof languageModule.LanguageSupport) {
                  return syntax;
                }
                if (syntax instanceof languageModule.Language) {
                  return new languageModule.LanguageSupport(syntax);
                }
                throw new Error(`No fenced-code parser for ${id}`);
              },
            }),
          ),
      });
    }
    case 'yaml': {
      const { yaml } = await import('@codemirror/lang-yaml');
      assertActive();
      return yaml();
    }
    case 'bash': {
      const [{ StreamLanguage: streamLanguage }, { shell }] = await Promise.all([
        import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/shell'),
      ]);
      assertActive();
      return streamLanguage.define(shell);
    }
    case 'csharp': {
      const [{ StreamLanguage: streamLanguage }, { csharp }] = await Promise.all([
        import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/clike'),
      ]);
      assertActive();
      return streamLanguage.define(csharp);
    }
    case 'kcl':
    case 'openscad':
    case 'stepfile':
    case 'stl':
    case 'usd':
    case 'sysml':
    case 'jsonc':
    case 'jsonl': {
      const { loadTextMateSyntax } = await import('#lib/editor-textmate-syntax.js');
      assertActive();
      return loadTextMateSyntax(languageId);
    }
    default: {
      return [];
    }
  }
};
