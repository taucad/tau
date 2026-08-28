import { Link as LinkIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { StreamdownProps } from 'streamdown';
import { cn } from '#utils/ui.utils.js';
import { extractTextFromChildren } from '#utils/react.utils.js';

/**
 * Converts heading text to a URL-friendly slug for anchor links.
 * - Preserves dots between numbers (e.g., "9.2.1")
 * - Removes dots adjacent to hyphens (e.g., "3. Title" → "3-title")
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replaceAll(/[^\s\w.-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll('.-', '-')
    .replaceAll('-.', '-')
    .replaceAll(/--+/g, '-');
}

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * Factory function to create a linked header component.
 * The component renders a heading with an anchor link that appears on hover.
 */
export function createHeaderAnchor(
  Tag: HeadingTag,
  headingClassName: string,
): (props: ComponentProps<HeadingTag>) => React.JSX.Element {
  function LinkedHeader({ children, className, ...rest }: ComponentProps<HeadingTag>): React.JSX.Element {
    const text = extractTextFromChildren(children);
    const id = slugify(text);

    return (
      <Tag id={id} className={cn('group scroll-mt-(--header-height)', headingClassName, className)} {...rest}>
        {children}
        <a
          href={`#${id}`}
          aria-label='Link to this section'
          className='ml-1 inline-flex items-center justify-center rounded p-1 transition-opacity group-hover:opacity-100 hover:bg-muted-foreground/10 focus:opacity-100 focus-visible:bg-muted-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:opacity-0'
          tabIndex={-1}
        >
          <LinkIcon className='inline size-3 text-muted-foreground md:size-4' aria-hidden='true' />
        </a>
      </Tag>
    );
  }

  return LinkedHeader;
}

/**
 * Markdown header components with anchor links.
 * Each header gets an auto-generated ID based on its text content,
 * and displays a link icon on hover for easy sharing.
 */
export const markdownHeaderAnchorComponents = {
  h1: createHeaderAnchor('h1', 'text-3xl font-bold'),
  h2: createHeaderAnchor('h2', 'text-2xl font-semibold'),
  h3: createHeaderAnchor('h3', 'text-xl font-semibold'),
  h4: createHeaderAnchor('h4', 'text-lg font-semibold'),
  h5: createHeaderAnchor('h5', 'text-base font-semibold'),
  h6: createHeaderAnchor('h6', 'text-sm font-medium'),
} as const satisfies StreamdownProps['components'];
