/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defineLanguage } from '#define-language.js';
import { parser } from '#usd/usd.parser.js';

/** USD ASCII layer (.usda) syntax. */
export const usdLanguage = defineLanguage({
  name: 'usd',
  parser,
  styles: {
    Keyword: t.keyword,
    TypeName: t.typeName,
    'PrimType/Identifier': t.className,
    Atom: t.atom,
    Identifier: t.propertyName,
    String: t.string,
    AssetPath: t.special(t.string),
    PathReference: t.link,
    Number: t.number,
    Header: t.meta,
    LineComment: t.lineComment,
    BlockComment: t.blockComment,
    '( )': t.paren,
    '[ ]': t.squareBracket,
    '{ }': t.brace,
    '= -': t.operator,
    ', ; : .': t.separator,
  },
  delimited: { Block: '}', Group: ')', List: ']' },
  languageData: {
    commentTokens: { line: '#', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"', '@', '<'] },
    indentOnInput: /^\s*[}\])]$/u,
  },
});

/** USD ASCII language support. */
export function usd(): LanguageSupport {
  return new LanguageSupport(usdLanguage);
}
