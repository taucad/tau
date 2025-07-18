import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

/**
 * Register KCL language with Monaco editor.
 *
 * This provides basic language support for KCL files including language identification
 * and basic configuration. Full language features like completions, hover, and
 * definitions can be added later.
 *
 * @see https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
 */
export function registerKclLanguage(monaco: typeof Monaco): void {
  monaco.languages.register({
    id: 'kcl',
    extensions: ['.kcl'],
    aliases: ['KCL', 'kcl'],
    mimetypes: ['text/x-kcl'],
  });

  // Basic language configuration
  monaco.languages.setLanguageConfiguration('kcl', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
}
