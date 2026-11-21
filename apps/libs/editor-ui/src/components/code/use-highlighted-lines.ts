import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { LanguageSupport } from '@codemirror/language';
import { highlightLines, loadLanguage, peekLanguage } from '@taucad/grammars';
import type { HighlightSegment } from '@taucad/grammars';
import type { CodeLanguage } from '#lib/code-language-resolution.js';
import { plaintextHighlightLanguage } from '#lib/code-language-resolution.js';

/**
 * Longest text, in UTF-16 code units, that static surfaces syntax highlight (D-UI-28).
 * Longer text is shown plain: it is read for its shape, and a parse that long would hold the main thread.
 */
export const maxHighlightedCodeLength = 100_000;

/**
 * A language's parser for a static code surface: available on the first render once any surface has loaded it,
 * otherwise loaded once and then rendered. `undefined` while it loads or for plaintext.
 */
export function useHighlightLanguage(language: CodeLanguage | undefined): LanguageSupport | undefined {
  const highlightable = language !== undefined && language !== plaintextHighlightLanguage ? language : undefined;
  const [loaded, setLoaded] = useState<{ language: CodeLanguage; support: LanguageSupport }>();
  const peeked = highlightable === undefined ? undefined : peekLanguage(highlightable);

  useEffect(() => {
    if (highlightable === undefined || peeked !== undefined) {
      return undefined;
    }
    let isCurrent = true;
    const load = async (): Promise<void> => {
      try {
        const support = await loadLanguage(highlightable);
        if (isCurrent) {
          setLoaded({ language: highlightable, support });
        }
      } catch (error) {
        // The text stays plain: a grammar that fails to load leaves the code readable.
        console.error(`Failed to load the ${highlightable} grammar`, error);
      }
    };
    // async-iife: bootstrap -- `isCurrent` fences a grammar that loads after the language changes.
    void load();
    return () => {
      isCurrent = false;
    };
  }, [highlightable, peeked]);

  return peeked ?? (loaded?.language === highlightable ? loaded?.support : undefined);
}

/**
 * Highlighted lines for `text`. While text streams in, highlighting follows the latest value React has time for,
 * so typing-speed updates never queue a parse per chunk.
 */
export function useHighlightedLines(
  text: string,
  language: CodeLanguage | undefined,
): { readonly lines: HighlightSegment[][]; readonly isHighlighted: boolean } {
  const support = useHighlightLanguage(language);
  const deferredText = useDeferredValue(text);
  const highlightable = support !== undefined && deferredText.length <= maxHighlightedCodeLength;
  const lines = useMemo(
    () => highlightLines(deferredText, highlightable ? support : undefined),
    [deferredText, highlightable, support],
  );
  // Until the deferred value catches up, show the latest text plain rather than stale highlighted text.
  return deferredText === text
    ? { lines, isHighlighted: highlightable }
    : { lines: highlightLines(text), isHighlighted: false };
}
