/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import {
  LRLanguage,
  LanguageSupport,
  continuedIndent,
  delimitedIndent,
  foldInside,
  foldNodeProp,
  indentNodeProp,
} from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { parser } from '#kcl/kcl.parser.js';

/** KCL syntax: the language's own grammar, with standard library declaration forms. */
export const kclLanguage = LRLanguage.define({
  name: 'kcl',
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        Body: delimitedIndent({ closing: '}' }),
        ArgumentList: delimitedIndent({ closing: ')' }),
        ParamList: delimitedIndent({ closing: ')' }),
        ArrayExpression: delimitedIndent({ closing: ']' }),
        ObjectExpression: delimitedIndent({ closing: '}' }),
        PipeExpression: continuedIndent(),
      }),
      foldNodeProp.add({
        'Body ArgumentList ParamList ArrayExpression ObjectExpression': foldInside,
        BlockComment: (node) => ({ from: node.from + 2, to: node.to - 2 }),
      }),
      styleTags({
        'fn export type': t.definitionKeyword,
        'import from as': t.moduleKeyword,
        'return if else': t.controlKeyword,
        'var sketch': t.keyword,
        'true false': t.bool,
        nil: t.null,
        String: t.string,
        Number: t.number,
        TagDeclarator: t.special(t.variableName),
        PipeSubstitution: t.special(t.variableName),
        LineComment: t.lineComment,
        DocComment: t.docComment,
        BlockComment: t.blockComment,
        Shebang: t.meta,
        AnnotationName: t.annotation,
        'UnlabeledParameter/AnnotationName': t.definition(t.variableName),
        VariableName: t.variableName,
        VariableDefinition: t.definition(t.variableName),
        FunctionName: t.function(t.definition(t.variableName)),
        'CallExpression/VariableName': t.function(t.variableName),
        'ArgumentLabel PropertyName': t.propertyName,
        'TypeName EnumVariant': t.typeName,
        TypeDefinition: t.definition(t.typeName),
        'AddOp MultOp ExpOp': t.arithmeticOperator,
        CompOp: t.compareOperator,
        'LogicOp BangOp': t.logicOperator,
        Equals: t.definitionOperator,
        PipeOperator: t.controlOperator,
        '..': t.operator,
        '. ::': t.derefOperator,
        '( )': t.paren,
        '[ ]': t.squareBracket,
        '{ }': t.brace,
        ', ; :': t.separator,
        '?': t.operator,
      }),
    ],
  }),
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"'] },
    indentOnInput: /^\s*[}\])]$/u,
  },
});

/** KCL language support for an editor or a static highlighter. */
export function kcl(): LanguageSupport {
  return new LanguageSupport(kclLanguage);
}
