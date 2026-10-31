/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { defineLanguage } from '#define-language.js';
import { parser } from '#csharp/csharp.parser.js';

const keywords = [
  'abstract as async await base break case catch checked const continue default do else event explicit extern',
  'finally fixed for foreach get goto if implicit in init internal is lock nameof operator out override params',
  'partial private protected public readonly ref required return sealed set sizeof stackalloc static switch',
  'throw try typeof unchecked unsafe value virtual volatile when where while with yield and or not global file',
  'scoped class struct interface enum record delegate namespace using new',
].join(' ');

const typeKeywords =
  'bool byte char decimal double dynamic float int long nint nuint object sbyte short string uint ulong ushort var void';

/** C# syntax. */
export const csharpLanguage = defineLanguage({
  name: 'csharp',
  parser,
  styles: {
    [keywords]: t.keyword,
    this: t.self,
    [typeKeywords]: t.standard(t.typeName),
    'true false': t.bool,
    null: t.null,
    'TypeName/Identifier': t.typeName,
    'TypeDeclaration/TypeName/Identifier': t.definition(t.typeName),
    'Namespace/Identifier': t.namespace,
    'CallExpression/Identifier': t.function(t.variableName),
    'VariableName/Identifier': t.variableName,
    String: t.string,
    Character: t.character,
    Number: t.number,
    LineComment: t.lineComment,
    DocComment: t.docComment,
    BlockComment: t.blockComment,
    Preprocessor: t.processingInstruction,
    'Operator ?': t.operator,
    '=': t.definitionOperator,
    '< >': t.angleBracket,
    '( )': t.paren,
    '[ ]': t.squareBracket,
    '{ }': t.brace,
    ', ; :': t.separator,
    '.': t.derefOperator,
  },
  delimited: { Block: '}', Group: ')', List: ']' },
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"'] },
    indentOnInput: /^\s*[}\])]$/u,
  },
});

/** C# language support. */
export function csharp(): LanguageSupport {
  return new LanguageSupport(csharpLanguage);
}
