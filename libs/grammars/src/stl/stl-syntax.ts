/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defineLanguage } from '#define-language.js';
import { parser } from '#stl/stl.parser.js';

/** ASCII STL syntax. */
export const stlLanguage = defineLanguage({
  name: 'stl',
  parser,
  styles: { Keyword: t.keyword, Number: t.number, Name: t.variableName },
  languageData: { closeBrackets: { brackets: [] } },
});

/** ASCII STL language support. */
export function stl(): LanguageSupport {
  return new LanguageSupport(stlLanguage);
}
