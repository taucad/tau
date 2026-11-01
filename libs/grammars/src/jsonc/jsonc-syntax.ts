/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defineLanguage } from '#define-language.js';
import { parser } from '#jsonc/jsonc.parser.js';

const styles = {
  'PropertyName/String': t.propertyName,
  String: t.string,
  Number: t.number,
  'True False': t.bool,
  Null: t.null,
  LineComment: t.lineComment,
  BlockComment: t.blockComment,
  ',': t.separator,
  ':': t.punctuation,
  '[ ]': t.squareBracket,
  '{ }': t.brace,
};
const delimited = { Object: '}', Array: ']' };

/** JSON with comments and trailing commas. */
export const jsoncLanguage = defineLanguage({
  name: 'jsonc',
  parser,
  styles,
  delimited,
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['{', '[', '"'] },
    indentOnInput: /^\s*[}\]]$/u,
  },
});

/** Newline-delimited JSON: one value per line. */
export const jsonlLanguage = defineLanguage({
  name: 'jsonl',
  parser: parser.configure({ top: 'JsonLines' }),
  styles,
  delimited,
  languageData: { closeBrackets: { brackets: ['{', '[', '"'] } },
});

/** JSONC language support. */
export function jsonc(): LanguageSupport {
  return new LanguageSupport(jsoncLanguage);
}

/** JSONL language support. */
export function jsonl(): LanguageSupport {
  return new LanguageSupport(jsonlLanguage);
}
