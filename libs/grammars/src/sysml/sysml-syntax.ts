/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defineLanguage } from '#define-language.js';
import { parser } from '#sysml/sysml.parser.js';

const keywords = [
  'def package library specializes subsets redefines references conjugates defined by',
  'about abstract accept action actor after alias all allocate allocation analysis and as assert assign assume at',
  'attribute bind binding calc case comment concern connect connection constant constraint crosses decide',
  'dependency derived do doc else end entry enum event exhibit exit expose filter first flow for fork frame from',
  'hastype if implies import in include individual inout interface istype item join language loop merge message',
  'meta metadata nonunique not objective occurrence of or ordered out parallel part perform port private protected',
  'public readonly ref render rendering rep require requirement return satisfy send snapshot stakeholder standard',
  'state subject succession terminate then timeslice to transition until use variant variation verification',
  'verify via view viewpoint when while xor',
].join(' ');

/** SysML v2 textual notation syntax. */
export const sysmlLanguage = defineLanguage({
  name: 'sysml',
  parser,
  styles: {
    [keywords]: t.keyword,
    'true false': t.bool,
    null: t.null,
    'DefinitionName/...': t.definition(t.typeName),
    'PackageName/...': t.namespace,
    'TypeReference/...': t.typeName,
    'Name/...': t.variableName,
    String: t.string,
    Number: t.number,
    LineComment: t.lineComment,
    BlockComment: t.blockComment,
    'Operator ~ :> :>> ::>': t.operator,
    ':': t.punctuation,
    '. ::': t.derefOperator,
    '( )': t.paren,
    '[ ]': t.squareBracket,
    '{ }': t.brace,
    ', ;': t.separator,
  },
  delimited: { Block: '}', Group: ')', List: ']' },
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"'] },
    indentOnInput: /^\s*\}$/u,
  },
});

/** SysML v2 language support. */
export function sysml(): LanguageSupport {
  return new LanguageSupport(sysmlLanguage);
}
