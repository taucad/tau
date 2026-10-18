import { useState, useEffect, useRef } from 'react';
import type { HighlighterCore } from 'shiki/core';
import type { ClassValue } from 'clsx';
import { cn } from '@taucad/ui/utils/cn';
import { getHighlighter } from '#lib/shiki.lib.js';
import { useTheme } from '#hooks/use-theme.js';
import type { HighlightLanguageInput, ShikiLanguage } from '#lib/code-language-resolution.js';
import { resolveHighlightLanguage } from '#lib/code-language-resolution.js';

type CodeViewerProps = {
  readonly text: string;
  readonly language?: HighlightLanguageInput;
  readonly className?: ClassValue;
};

const codeViewerClassName =
  'not-fumadocs-codeblock text-sm [&_pre]:m-0 [&_pre]:my-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:leading-[1.45]';
/** Milliseconds. */
const highlightThrottle = 150;

/**
 * Longest text, in UTF-16 code units, that is syntax highlighted (D-UI-28).
 *
 * Shiki's HTML is 5 to 15 times the source and is held beside it, so a large
 * file shown highlighted cost several times its size. Longer text is shown
 * plain.
 */
export const maxHighlightedCodeLength = 100_000;

function PlainCode({ text, className }: { readonly text: string; readonly className?: ClassValue }): React.JSX.Element {
  return (
    <div className={cn(codeViewerClassName, className)}>
      <pre className='m-0 bg-transparent p-0 leading-[1.45]'>
        <code>{text}</code>
      </pre>
    </div>
  );
}

export function CodeViewer({ text, language, className }: CodeViewerProps): React.JSX.Element {
  const { theme, isHighContrast } = useTheme();
  const [highlighter, setHighlighter] = useState<HighlighterCore | undefined>();

  useEffect(() => {
    const loadHighlighter = async () => {
      setHighlighter(await getHighlighter());
    };
    void loadHighlighter();
  }, []);

  if (!highlighter || text.length > maxHighlightedCodeLength) {
    return <PlainCode text={text} className={className} />;
  }

  const resolvedLanguage = resolveHighlightLanguage(language);

  return (
    <HighlightedCode
      text={text}
      language={resolvedLanguage.shikiLanguage}
      theme={`github-${theme}${isHighContrast ? '-high-contrast' : ''}`}
      highlighter={highlighter}
      className={className}
    />
  );
}

function HighlightedCode({
  text,
  language,
  theme,
  highlighter,
  className,
}: {
  text: string;
  language: ShikiLanguage;
  theme: string;
  highlighter: HighlighterCore;
  className?: ClassValue;
}): React.JSX.Element {
  const [html, setHtml] = useState<string>();
  const nextAllowedHighlightTime = useRef(0);

  useEffect(() => {
    const now = Date.now();
    /** Milliseconds. */
    const highlightDelay = Math.max(0, nextAllowedHighlightTime.current - now);
    const highlightTimeout = setTimeout(() => {
      try {
        setHtml(highlighter.codeToHtml(text, { lang: language, theme }));
        nextAllowedHighlightTime.current = now + highlightThrottle;
      } catch (error) {
        console.error('Failed to highlight code', error);
      }
    }, highlightDelay);

    return () => {
      clearTimeout(highlightTimeout);
    };
  }, [highlighter, language, text, theme]);

  if (html === undefined) {
    return <PlainCode text={text} className={className} />;
  }

  return (
    <div
      className={cn(codeViewerClassName, className)}
      // oxlint-disable-next-line react/no-danger -- Shiki returns trusted HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
