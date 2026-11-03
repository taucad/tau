import { tagHighlighter, tags } from '@lezer/highlight';

/**
 * Token classes shared by the editor and every static code surface.
 *
 * One stylesheet colours these classes, so a language highlights the same in the
 * editor, its tooltips, chat code blocks and diffs. The most specific tag of a token wins.
 */
export const tauHighlighter = tagHighlighter([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.moduleKeyword,
      tags.definitionKeyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.self,
    ],
    class: 'tok-keyword',
  },
  {
    tag: [tags.variableName, tags.definition(tags.variableName), tags.local(tags.variableName)],
    class: 'tok-variable',
  },
  { tag: [tags.special(tags.variableName), tags.labelName], class: 'tok-variable tok-special' },
  { tag: [tags.propertyName, tags.definition(tags.propertyName), tags.attributeName], class: 'tok-property' },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.function(tags.definition(tags.variableName)),
      tags.macroName,
    ],
    class: 'tok-function',
  },
  { tag: [tags.number, tags.integer, tags.float, tags.unit], class: 'tok-number' },
  { tag: [tags.bool, tags.null, tags.atom, tags.constant(tags.variableName)], class: 'tok-atom' },
  {
    tag: [tags.string, tags.special(tags.string), tags.character, tags.regexp, tags.escape, tags.docString],
    class: 'tok-string',
  },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'tok-comment' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.tagName], class: 'tok-type' },
  {
    tag: [
      tags.punctuation,
      tags.separator,
      tags.bracket,
      tags.paren,
      tags.brace,
      tags.squareBracket,
      tags.angleBracket,
    ],
    class: 'tok-punctuation',
  },
  { tag: [tags.operator, tags.derefOperator], class: 'tok-operator' },
  { tag: [tags.meta, tags.annotation, tags.processingInstruction, tags.documentMeta], class: 'tok-meta' },
  { tag: tags.heading, class: 'tok-heading' },
  { tag: tags.strong, class: 'tok-strong' },
  { tag: tags.emphasis, class: 'tok-emphasis' },
  { tag: tags.strikethrough, class: 'tok-strikethrough' },
  { tag: [tags.link, tags.url], class: 'tok-link' },
  { tag: tags.monospace, class: 'tok-monospace' },
  { tag: tags.contentSeparator, class: 'tok-punctuation' },
  { tag: tags.inserted, class: 'tok-inserted' },
  { tag: tags.deleted, class: 'tok-deleted' },
  { tag: tags.invalid, class: 'tok-invalid' },
]);
