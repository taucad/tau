import type { LucideIcon } from 'lucide-react';
import { Button } from '#components/ui/button.js';

/**
 * Shared watermark (empty-state) layout for Dockview panels.
 *
 * Uses container queries (`@container/watermark` / `@xs/watermark`) so the
 * layout adapts when the pane is narrow (e.g. after splitting).
 */

type DockviewWatermarkProps = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
  readonly onClose?: () => void;
};

export function DockviewWatermark({
  icon: Icon,
  title,
  description,
  children,
  onClose,
}: DockviewWatermarkProps): React.JSX.Element {
  return (
    <div className='@container/watermark [container-type:size] flex h-full flex-col items-center justify-center gap-2 p-2 text-muted-foreground @xs/watermark:gap-4'>
      <Icon className='size-8 stroke-1 @xs/watermark:size-12' />
      <div className='flex flex-col items-center gap-1 text-center'>
        <p className='text-xs font-medium @xs/watermark:text-sm'>{title}</p>
        <p className='hidden text-center text-xs @xs/watermark:block'>{description}</p>
      </div>
      {children}
      {onClose ? (
        <Button variant='link' size='sm' className='h-7 gap-0.5 text-xs text-muted-foreground' onClick={onClose}>
          <span>Close pane</span>
        </Button>
      ) : undefined}
    </div>
  );
}
