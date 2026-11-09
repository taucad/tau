/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defineLanguage } from '#define-language.js';
import { parser } from '#openscad/openscad.parser.js';

/** OpenSCAD syntax. */
export const openscadLanguage = defineLanguage({
  name: 'openscad',
  parser,
  styles: {
    'module function': t.definitionKeyword,
    'include use': t.moduleKeyword,
    'if else for let each intersection_for': t.controlKeyword,
    'assert echo': t.keyword,
    'true false': t.bool,
    undef: t.null,
    PI: t.constant(t.variableName),
    'DefinitionName/Identifier': t.function(t.definition(t.variableName)),
    'CallExpression/Identifier': t.function(t.variableName),
    'CallExpression/SpecialVariable': t.function(t.variableName),
    'VariableName/Identifier': t.variableName,
    SpecialVariable: t.special(t.variableName),
    IncludePath: t.special(t.string),
    String: t.string,
    Number: t.number,
    LineComment: t.lineComment,
    BlockComment: t.blockComment,
    'Operator ?': t.operator,
    Modifier: t.modifier,
    '=': t.definitionOperator,
    '( )': t.paren,
    '[ ]': t.squareBracket,
    '{ }': t.brace,
    ', ; : .': t.separator,
  },
  delimited: { Block: '}', Group: ')', List: ']' },
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', '"'] },
    indentOnInput: /^\s*[}\])]$/u,
  },
});

/** OpenSCAD language support. */
export function openscad(): LanguageSupport {
  return new LanguageSupport(openscadLanguage);
}
