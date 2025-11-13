import type { ReactNode } from 'react';
import { cn } from '#utils/ui.utils.js';

type HighlightTextProperties = {
  readonly text: string;
  readonly searchTerm?: string;
  readonly className?: string;
};

/**
 * Highlights search terms within text by wrapping matches in mark elements
 */
export function HighlightText({ text, searchTerm, className }: HighlightTextProperties): ReactNode {
  if (!searchTerm || !text) {
    return text;
  }

  // Escape special regex characters in the search term
  const escapedSearchTerm = searchTerm.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark
            // eslint-disable-next-line react/no-array-index-key -- permitted for this use case as we are not rendering the same text multiple times
            key={`highlight-${text}-${searchTerm}-${index}`}
            data-slot="highlight"
            aria-label={`Highlighted: ${part}`}
            className={cn('bg-transparent font-bold text-primary', className)}
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
