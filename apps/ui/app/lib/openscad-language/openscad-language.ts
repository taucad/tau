import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

const languageKeywords = [
  'module',
  'function',
  'if',
  'else',
  'for',
  'while',
  'let',
  'assert',
  'echo',
  'each',
  'undef',
  'include',
  'use',
];

const builtinFunctions = [
  'abs',
  'acos',
  'asin',
  'atan',
  'atan2',
  'ceil',
  'cos',
  'cross',
  'exp',
  'floor',
  'len',
  'ln',
  'log',
  'lookup',
  'max',
  'min',
  'norm',
  'pow',
  'rands',
  'round',
  'sign',
  'sin',
  'sqrt',
  'tan',
  'str',
  'chr',
  'ord',
  'concat',
  'search',
  'version',
  'version_num',
  'parent_module',
];

const builtinModules = [
  'cube',
  'sphere',
  'cylinder',
  'polyhedron',
  'square',
  'circle',
  'polygon',
  'text',
  'linear_extrude',
  'rotate_extrude',
  'scale',
  'resize',
  'rotate',
  'translate',
  'mirror',
  'multmatrix',
  'color',
  'offset',
  'hull',
  'minkowski',
  'union',
  'difference',
  'intersection',
  'render',
  'surface',
  'projection',
];

const builtinConstants = [
  'true',
  'false',
  'PI',
  'undef',
  '$fa',
  '$fs',
  '$fn',
  '$t',
  '$vpt',
  '$vpr',
  '$vpd',
  '$vpf',
  '$children',
  '$preview',
  '$OPENSCAD_VERSION',
];

// Export the static keywords for use in completions
export const openscadLanguageKeywords = [
  ...builtinFunctions,
  ...builtinModules,
  ...builtinConstants,
  ...languageKeywords,
];

export function createOpenscadLanguageConfiguration(
  monacoInstance: typeof monaco,
): monaco.languages.LanguageConfiguration {
  return {
    colorizedBracketPairs: [
      ['{', '}'],
      ['(', ')'],
      ['[', ']'],
    ],

    wordPattern: /(-?\d*\.\d\w*)|(?:\$[a-zA-Z_]|[a-zA-Z_])\w*/g,
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    onEnterRules: [
      {
        beforeText: /^\s*\/\*\*(?!\/)([^*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: {
          indentAction: monacoInstance.languages.IndentAction.IndentOutdent,
          appendText: ' * ',
        },
      },
      {
        beforeText: /^\s*\/\*\*(?!\/)([^*]|\*(?!\/))*$/,
        action: {
          indentAction: monacoInstance.languages.IndentAction.None,
          appendText: ' * ',
        },
      },
      {
        beforeText: /^(\t|( {2}))* \*( ([^*]|\*(?!\/))*)?$/,
        action: {
          indentAction: monacoInstance.languages.IndentAction.None,
          appendText: '* ',
        },
      },
      {
        beforeText: /^(\t|( {2}))* \*\/\s*$/,
        action: {
          indentAction: monacoInstance.languages.IndentAction.None,
          removeText: 1,
        },
      },
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
      { open: '/**', close: ' */', notIn: ['string'] },
    ],
    folding: {
      markers: {
        start: /^\s*\/\/\s*#?region\b/,
        end: /^\s*\/\/\s*#?endregion\b/,
      },
    },
  };
}
