/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defineLanguage } from '#define-language.js';
import { parser } from '#bash/bash.parser.js';

const keywords =
  'if then else elif fi for in while until do done case esac function select return exit local export declare readonly unset break continue time';

/** POSIX shell and Bash syntax. */
export const bashLanguage = defineLanguage({
  name: 'bash',
  parser,
  styles: {
    [keywords]: t.keyword,
    '"!"': t.logicOperator,
    'CommandName/...': t.function(t.variableName),
    Number: t.number,
    String: t.string,
    Variable: t.special(t.variableName),
    Assignment: t.definition(t.variableName),
    'LoopVariable/...': t.definition(t.variableName),
    Comment: t.lineComment,
    'Redirect ; ;; & && | || |&': t.operator,
    '$( ( )': t.paren,
    '{ }': t.brace,
  },
  delimited: { Group: ')', Block: '}', Substitution: ')' },
  languageData: {
    commentTokens: { line: '#' },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"', '`'] },
  },
});

/** Shell language support. */
export function bash(): LanguageSupport {
  return new LanguageSupport(bashLanguage);
}
