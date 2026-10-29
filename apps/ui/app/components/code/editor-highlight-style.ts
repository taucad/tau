import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/** Shared rendered syntax styles for every admitted editor language. */
export const editorHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: 'var(--cm-keyword)' },
  { tag: [tags.definition(tags.variableName), tags.variableName], color: 'var(--cm-variable)' },
  { tag: [tags.propertyName], color: 'var(--cm-number)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--cm-function)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--cm-number)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--cm-string)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--cm-comment)' },
  { tag: [tags.typeName, tags.className], color: 'var(--cm-type)' },
  { tag: [tags.bracket, tags.paren, tags.brace], color: 'var(--cm-punctuation)' },
  { tag: tags.heading, color: 'var(--cm-function)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--cm-string)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--cm-string)' },
  { tag: [tags.meta, tags.processingInstruction], color: 'var(--cm-comment)' },
  { tag: tags.tagName, color: 'var(--cm-type)' },
  { tag: tags.attributeName, color: 'var(--cm-number)' },
  { tag: [tags.operator, tags.punctuation, tags.contentSeparator], color: 'var(--cm-punctuation)' },
]);
