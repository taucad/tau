import { cva } from 'class-variance-authority';

/**
 * Shared interaction styling for actions nested inside a hovered or selected surface.
 *
 * `dark:hover:` is restated so a `Button variant='ghost'` host cannot win the
 * hover back: ghost's own `dark:hover:bg-accent/80` is emitted after
 * `hover:bg-nested-action-hover` at equal specificity, and only a class in the
 * same variant stack replaces it under `cn`.
 *
 * @public
 */
export const nestedActionVariants = cva(
  'transition-colors hover:bg-nested-action-hover hover:text-foreground dark:hover:bg-nested-action-hover data-[state=open]:bg-nested-action-hover data-[state=open]:text-foreground',
);
