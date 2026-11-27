import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

type ExternalLinkProps = {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Whether to show the arrow icon.
   * @default true
   */
  readonly withArrow?: boolean;
  /**
   * Whether to show the arrow only on hover.
   * When true, the arrow is hidden until hover. When false, the arrow is always visible.
   * @default true
   */
  readonly isArrowOnHoverOnly?: boolean;
  /**
   * Size of the arrow icon.
   * @default 'sm'
   */
  readonly arrowSize?: 'xs' | 'sm' | 'md';
};

const arrowSizeClasses = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
} as const;

/**
 * External link that opens in a new tab and can show an optional arrow indicator.
 */
export function ExternalLink({
  href,
  children,
  className,
  withArrow = true,
  isArrowOnHoverOnly = true,
  arrowSize = 'sm',
}: ExternalLinkProps): React.JSX.Element {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        'group/external-link underline decoration-muted-foreground/50 underline-offset-2 transition-colors hover:decoration-foreground',
        className,
      )}
    >
      {children}
      {withArrow ? (
        <ArrowUpRight
          className={cn(
            arrowSizeClasses[arrowSize],
            'ml-0.5 inline align-text-bottom',
            isArrowOnHoverOnly
              ? '-translate-x-1 opacity-0 transition-all group-hover/external-link:translate-x-0 group-hover/external-link:opacity-100'
              : '',
          )}
        />
      ) : undefined}
    </a>
  );
}
