import type * as Monaco from 'monaco-editor';
import { codeLanguages } from '@taucad/types/constants';
import type { ActivationContext, ActivationResult, LanguageContribution } from '#lib/monaco-language-registry.js';

let isRegistered = false;

export function registerBashLanguage(monaco: typeof Monaco): void {
  if (isRegistered) {
    return;
  }

  isRegistered = true;

  monaco.languages.register({
    id: codeLanguages.bash,
    extensions: ['.sh', '.bash'],
    aliases: ['Shell', 'shell', 'sh', 'Bash', 'bash'],
    mimetypes: ['text/x-shellscript'],
  });

  monaco.languages.setLanguageConfiguration(codeLanguages.bash, {
    comments: {
      lineComment: '#',
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
      { open: '"', close: '"', notIn: ['string', 'comment'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
    folding: {
      markers: {
        start: /^\s*#\s*#?region\b/,
        end: /^\s*#\s*#?endregion\b/,
      },
    },
  });
}

export const bashContribution: LanguageContribution = {
  languageId: codeLanguages.bash,
  activationLanguageIds: [codeLanguages.bash],

  register(monaco: typeof Monaco): void {
    registerBashLanguage(monaco);
  },

  activate(_context: ActivationContext): ActivationResult {
    return { disposables: [] };
  },

  dispose(): void {
    isRegistered = false;
  },
};
