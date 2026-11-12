import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';

/**
 * The heading scale: one look per role, each carrying size, line height, weight and tracking together.
 *
 * A variant names what the heading is for, never how deep it sits in the outline:
 *
 * - `display`: the one hero line of a start surface.
 * - `page`: the title of a page.
 * - `section`: a section of a page.
 * - `title`: a dialog, a gate screen or a standalone card.
 * - `item`: the name of an object in a card, row or drawer.
 * - `label`: a group or pane heading inside dense UI.
 * - `overline`: a quiet label over a short group.
 *
 * Title slots that render their own element (a dialog or card title) compose these classes;
 * everything else renders `Heading`.
 *
 * @public
 * @example <caption>Give a title slot the dialog-title look</caption>
 * ```typescript
 * import { headingVariants } from '@taucad/ui/components/heading.variants';
 *
 * export const titleClassName = headingVariants({ variant: 'title' });
 * ```
 */
export const headingVariants = cva('', {
  variants: {
    variant: {
      display: 'text-3xl font-medium tracking-tight md:text-5xl',
      page: 'text-4xl leading-[1.1] font-medium tracking-tight',
      section: 'text-2xl font-semibold tracking-tight',
      title: 'text-lg font-semibold',
      item: 'text-base font-semibold',
      label: 'text-sm font-medium',
      overline: 'text-xs font-medium',
    },
  },
});

/**
 * The role a heading plays, which decides its look.
 *
 * @public
 */
export type HeadingVariant = NonNullable<VariantProps<typeof headingVariants>['variant']>;
