/**
 * A Revisions pane region: the card and bordered heading row the Details,
 * Export and Console panes share (L3-F17), on the 14 px heading step.
 */
import { Heading } from '@taucad/ui/components/heading';
import type { ReactNode } from 'react';
import { cn } from '@taucad/ui/utils/cn';

/**
 * One region of the Revisions pane.
 *
 * @param props - The heading's id and title, an optional heading action, and the body.
 * @returns The region.
 */
export function RevisionRegion({
  id,
  title,
  action,
  children,
  className,
  bodyClassName,
  isLandmark = true,
  isBusy = false,
}: {
  /** The heading's id, which names the region for assistive technology and for tests. */
  readonly id: string;
  readonly title: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
  /**
   * Whether the card is a region landmark. A card titled like the pane its host already names (History in the History
   * pane) is a named group instead, so the page never holds two landmarks of one name (WCAG 1.3.1, axe landmark-unique).
   */
  readonly isLandmark?: boolean;
  /** Whether the region's content is still loading: the card carries `aria-busy` for the whole wait. */
  readonly isBusy?: boolean;
}): React.JSX.Element {
  const Container = isLandmark ? 'section' : 'div';
  return (
    <Container
      role={isLandmark ? undefined : 'group'}
      aria-labelledby={id}
      aria-busy={isBusy ? true : undefined}
      className={cn('rounded-xl border border-border bg-card', className)}
    >
      <div className='flex min-h-8 items-center justify-between gap-2 border-b px-3 py-1'>
        <Heading level={3} variant='label' id={id} className='min-w-0 truncate text-foreground'>
          {title}
        </Heading>
        {action}
      </div>
      <div className={bodyClassName ?? 'p-1.5'}>{children}</div>
    </Container>
  );
}
