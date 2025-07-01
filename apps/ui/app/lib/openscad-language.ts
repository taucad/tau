// @ts-expect-error -- typed import path not resolved in build setup, we just need the runtime types
import type * as MonacoNamespace from 'monaco-editor/esm/vs/editor/editor.api';

/**
 * Register a minimal OpenSCAD language in Monaco.
 * The implementation is intentionally lightweight – keywords & numbers are
 * tokenised so that we get syntax highlighting and IntelliSense without
 * bundling a full parser.
 */
export function registerOpenSCAD(monaco: typeof MonacoNamespace): void {
  const LANGUAGE_ID = 'openscad';

  // If already registered skip (useful for hot-reload).
  if (monaco.languages.getLanguages().some((l: { id: string }) => l.id === LANGUAGE_ID)) return;

  const KEYWORDS = [
    'module',
    'function',
    'include',
    'use',
    'for',
    'intersection_for',
    'if',
    'else',
    'let',
    'assert',
    'echo',
    'union',
    'difference',
    'intersection',
    'translate',
    'rotate',
    'scale',
    'mirror',
    'color',
    'linear_extrude',
    'rotate_extrude',
    'projection',
    'cube',
    'sphere',
    'cylinder',
    'polyhedron',
    'square',
    'circle',
    'polygon',
    'text',
    'import',
  ];

  monaco.languages.register({ id: LANGUAGE_ID, extensions: ['.scad'] });

  // Basic lexer using Monarch
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    defaultToken: '',
    tokenPostfix: '.scad',
    keywords: KEYWORDS,
    operators: ['<=', '>=', '==', '!=', '&&', '||', '<', '>', '+', '-', '*', '/', '%', '!', '^'],
    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    // The main tokenizer for our languages
    tokenizer: {
      root: [
        // identifiers and keywords
        [/[a-zA-Z_][\w_]*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],

        // whitespace
        { include: '@whitespace' },

        // numbers
        [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/\d+/, 'number'],

        // delimiters and operators
        [/[@symbols]/, {
          cases: {
            '@operators': 'operator',
            '@default': ''
          }
        }],

        // strings
        [/'/, 'string', '@string_single'],
        [/"/, 'string', '@string_double'],
      ],

      whitespace: [
        [/[ \t\r\n]+/, ''],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],

      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],

      string_double: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],

      string_single: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, 'string', '@pop'],
      ],
    },
  });

  // Simple completions – return keyword list
  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    triggerCharacters: ['.', '(', '$'],
    provideCompletionItems: () => {
      const suggestions: MonacoNamespace.languages.CompletionItem[] = KEYWORDS.map((kw) => ({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw,
      }));
      return { suggestions };
    },
  });

  // Basic brackets matching
  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
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
      { open: "'", close: "'", notIn: ['string'] },
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