import type { LanguageSupport } from '@codemirror/language';
import { highlightCode } from '@lezer/highlight';
import { tauHighlighter } from '#highlighter.js';

/** A run of text and the token classes that colour it; an empty class is plain text. */
export type HighlightSegment = Readonly<{ text: string; className: string }>;

/**
 * Highlight text outside an editor, line by line, with the same parser and token
 * classes the editor uses. Without a language every line is one plain segment.
 */
export function highlightLines(text: string, support?: LanguageSupport): HighlightSegment[][] {
  if (!support) {
    return text.split('\n').map((line) => (line ? [{ text: line, className: '' }] : []));
  }
  const lines: HighlightSegment[][] = [[]];
  highlightCode(
    text,
    support.language.parser.parse(text),
    tauHighlighter,
    (segment, className) => {
      lines.at(-1)!.push({ text: segment, className });
    },
    () => {
      lines.push([]);
    },
  );
  return lines;
}
