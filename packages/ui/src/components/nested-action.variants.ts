import { cva } from 'class-variance-authority';

/**
 * Shared interaction styling for actions nested inside a hovered or selected surface.
 *
 * No colour transition: the host surface lights in the same frame, and an action that
 * faded on its own would paint a second, lagging layer over it.
 *
 * `dark:hover:` is restated so a `Button variant='ghost'` host cannot win the
 * hover back: ghost's own `dark:hover:bg-accent/80` is emitted after
 * `hover:bg-nested-action-hover` at equal specificity, and only a class in the
 * same variant stack replaces it under `cn`.
 *
 * @public
 */
export const nestedActionVariants = cva(
  'hover:bg-nested-action-hover hover:text-foreground dark:hover:bg-nested-action-hover data-[state=open]:bg-nested-action-hover data-[state=open]:text-foreground',
);
