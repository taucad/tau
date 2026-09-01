import type * as Monaco from 'monaco-editor';
import { codeLanguages } from '@taucad/types/constants';
import type { LanguageContribution, ActivationContext, ActivationResult } from '#lib/monaco-language-registry.js';

/** Track if already registered to prevent duplicate registration */
let isRegistered = false;

/**
 * Language configuration aligned with SysML v2 tooling conventions (daltskin VS Code extension).
 *
 * @see https://github.com/daltskin/VSCode_SysML_Extension/blob/main/language-configuration.json
 */
function createSysmlLanguageConfiguration(monaco: typeof Monaco): Monaco.languages.LanguageConfiguration {
  return {
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
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: '/*', close: ' */', notIn: ['string'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
    folding: {
      markers: {
        start: /^\s*\/\/\s*#?region\b/,
        end: /^\s*\/\/\s*#?endregion\b/,
      },
    },
    indentationRules: {
      increaseIndentPattern: /^.*{[^}]*$/,
      decreaseIndentPattern: /^\s*}/,
    },
    onEnterRules: [
      {
        beforeText: /^\s*\/\*\*(?!\/)([^*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: {
          indentAction: monaco.languages.IndentAction.IndentOutdent,
          appendText: ' * ',
        },
      },
      {
        beforeText: /^\s*\/\*\*(?!\/)([^*]|\*(?!\/))*$/,
        action: {
          indentAction: monaco.languages.IndentAction.None,
          appendText: ' * ',
        },
      },
      {
        beforeText: /^(\s+)\*(\s+.*)?$/,
        action: {
          indentAction: monaco.languages.IndentAction.None,
          appendText: '* ',
        },
      },
      {
        beforeText: /^(\s+)\*\/\s*$/,
        action: {
          indentAction: monaco.languages.IndentAction.None,
          removeText: 1,
        },
      },
    ],
    wordPattern: new RegExp('(-?\\d*\\.\\d\\w*)|([^`~!@#%^&*()\\-=+\\[\\]{}\\\\|;:\'",.<>/?\\s]+)', 'u'),
  };
}

/**
 * Register SysML v2 textual notation with Monaco (KerML `.kerml` files share the same highlighter id).
 *
 * Syntax highlighting is supplied via Shiki precompiled grammar (`@taucad/grammars/sysml`).
 *
 * @see https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
 */
export function registerSysmlLanguage(monaco: typeof Monaco): void {
  if (isRegistered) {
    return;
  }

  isRegistered = true;

  monaco.languages.register({
    id: codeLanguages.sysml,
    extensions: ['.sysml', '.kerml'],
    aliases: ['SysML', 'sysml', 'KerML', 'kerml'],
    mimetypes: ['text/x-sysml'],
  });

  monaco.languages.setLanguageConfiguration(codeLanguages.sysml, createSysmlLanguageConfiguration(monaco));
}

// ============================================================================
// Language Contribution (for LanguageContributionRegistry)
// ============================================================================

/**
 * SysML v2 language contribution — mirrors STL/USD (register metadata + Shiki tokens, no LSP).
 */
export const sysmlContribution: LanguageContribution = {
  languageId: codeLanguages.sysml,
  activationLanguageIds: [codeLanguages.sysml],

  register(monaco: typeof Monaco): void {
    registerSysmlLanguage(monaco);
  },

  activate(_context: ActivationContext): ActivationResult {
    return {
      disposables: [],
    };
  },

  dispose(): void {
    isRegistered = false;
  },
};
