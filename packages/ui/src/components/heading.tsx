import type * as React from 'react';
import { headingVariants } from '#components/heading.variants.js';
import type { HeadingVariant } from '#components/heading.variants.js';
import { cn } from '#utils/cn.js';

/**
 * Properties of `Heading`.
 *
 * @public
 */
export type HeadingProps = React.ComponentProps<'h1'> & {
  /**
   * The outline level, which picks the element (`h1` to `h6`): one below the heading that owns the
   * region, with one `h1` per page. Never chosen for its size.
   */
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  /** The role, which picks the look. Never chosen to repair the outline. */
  readonly variant: HeadingVariant;
};

/**
 * Render a heading whose outline level and look are chosen separately. No APG pattern applies:
 * it is a native heading element with no keyboard contract.
 *
 * Both `level` and `variant` are required, so each call states where the heading sits in the
 * document and what it is for. `className` is for layout and colour; the variant owns size,
 * weight, line height and tracking.
 *
 * @param properties - The level, the variant and standard heading properties.
 * @returns The heading element.
 * @public
 *
 * @example <caption>Title a pane group one level below its pane heading</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Heading } from '@taucad/ui/components/heading';
 *
 * export const example = createElement(Heading, { level: 3, variant: 'label' }, 'Materials');
 * ```
 *
 * @example <caption>Keep the page's h1 while giving it a compact look</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Heading } from '@taucad/ui/components/heading';
 *
 * export const example = createElement(Heading, { level: 1, variant: 'label', className: 'truncate' }, 'Bracket');
 * ```
 */
export function Heading({ level, variant, className, ...properties }: HeadingProps): React.JSX.Element {
  const Tag = `h${level}` as const;
  return (
    <Tag
      data-slot='heading'
      data-variant={variant}
      className={cn(headingVariants({ variant }), className)}
      {...properties}
    />
  );
}
