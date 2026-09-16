import { cva } from 'class-variance-authority';

/**
 * Shared interaction styling for actions nested inside a hovered or selected surface.
 *
 * @public
 */
export const nestedActionVariants = cva(
  'transition-colors hover:bg-nested-action-hover hover:text-foreground data-[state=open]:bg-nested-action-hover data-[state=open]:text-foreground',
);
