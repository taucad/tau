import type * as Monaco from 'monaco-editor';
import { codeLanguages } from '@taucad/types/constants';
import type { ActivationContext, ActivationResult, LanguageContribution } from '#lib/monaco-language-registry.js';

let isRegistered = false;

export function registerMarkdownLanguage(monaco: typeof Monaco): void {
  if (isRegistered) {
    return;
  }

  isRegistered = true;

  monaco.languages.register({
    id: codeLanguages.markdown,
    extensions: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdwn', '.mdtxt', '.mdtext'],
    aliases: ['Markdown', 'markdown', 'md'],
    mimetypes: ['text/markdown'],
  });

  monaco.languages.setLanguageConfiguration(codeLanguages.markdown, {
    comments: {
      blockComment: ['<!--', '-->'],
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
      { open: '`', close: '`' },
      { open: '<', close: '>', notIn: ['string'] },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '`', close: '`' },
    ],
    folding: {
      markers: {
        start: /^\s*<!--\s*#?region\b.*-->/,
        end: /^\s*<!--\s*#?endregion\b.*-->/,
      },
    },
  });
}

export const markdownContribution: LanguageContribution = {
  languageId: codeLanguages.markdown,
  activationLanguageIds: [codeLanguages.markdown],

  register(monaco: typeof Monaco): void {
    registerMarkdownLanguage(monaco);
  },

  activate(_context: ActivationContext): ActivationResult {
    return { disposables: [] };
  },

  dispose(): void {
    isRegistered = false;
  },
};
