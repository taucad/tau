/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defineLanguage } from '#define-language.js';
import { parser } from '#stepfile/stepfile.parser.js';

/** ISO 10303-21 (STEP) exchange file syntax. */
export const stepfileLanguage = defineLanguage({
  name: 'stepfile',
  parser,
  styles: {
    'Keyword UserKeyword': t.keyword,
    TypeName: t.typeName,
    'Entity/EntityReference': t.definition(t.variableName),
    EntityReference: t.variableName,
    String: t.string,
    Binary: t.special(t.string),
    Number: t.number,
    Enumeration: t.atom,
    Omitted: t.null,
    BlockComment: t.blockComment,
    '( )': t.paren,
    '=': t.definitionOperator,
    ', ;': t.separator,
  },
  delimited: { Group: ')' },
  languageData: {
    commentTokens: { block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', "'"] },
  },
});

/** STEP exchange file language support. */
export function stepfile(): LanguageSupport {
  return new LanguageSupport(stepfileLanguage);
}
