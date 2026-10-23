import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@taucad/ui/components/sidebar';

export type UpdateControlAction = {
  readonly label: string;
  readonly variant: 'default' | 'outline';
  readonly busy?: boolean;
  readonly onClick: () => void;
};

/**
 * Sidebar row and popover shared by every "a newer Tau is available" surface.
 * Desktop and browser differ only in copy and the action they wire in, so both
 * read as the same control in the same place.
 */
export function UpdateControl({
  title,
  version,
  detail,
  icon: Icon,
  isFailed = false,
  releasePage,
  action,
  isOpen,
  onOpenChange,
  shouldFocusOnOpen = true,
}: {
  readonly title: string;
  readonly version?: string;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly isFailed?: boolean;
  readonly releasePage?: string;
  readonly action?: UpdateControlAction;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** `false` when the popover opens on its own, so it never takes focus from the editor. */
  readonly shouldFocusOnOpen?: boolean;
}): React.JSX.Element {
  return (
    <SidebarMenu className='p-1'>
      <SidebarMenuItem>
        <Popover open={isOpen} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <SidebarMenuButton className='data-[state=open]:bg-sidebar-accent' aria-label={title}>
              <Icon className={isFailed ? 'text-destructive' : 'text-muted-foreground'} />
              <span>{title}</span>
              <ChevronRight className='ml-auto text-muted-foreground' />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            side='top'
            align='start'
            sideOffset={4}
            collisionPadding={8}
            className='w-64 max-w-[calc(100vw-1rem)] p-3'
            aria-label='Tau update'
            onOpenAutoFocus={
              shouldFocusOnOpen
                ? undefined
                : (event) => {
                    event.preventDefault();
                  }
            }
          >
            <div className='flex items-center justify-between gap-2'>
              <h2 className='text-sm leading-5 font-medium'>{title}</h2>
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label='Close update details'
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                <X />
              </Button>
            </div>
            {version ? <p className='text-xs leading-4 text-muted-foreground'>{version}</p> : undefined}
            <p className='mt-2 text-xs leading-4 text-muted-foreground'>{detail}</p>
            <div className='mt-3 flex items-center justify-between gap-2'>
              {releasePage ? (
                <Button asChild variant='ghost' size='xs' className='-ml-2'>
                  <a href={releasePage} target='_blank' rel='noopener noreferrer'>
                    What’s new
                    <ArrowUpRight className='size-3' />
                  </a>
                </Button>
              ) : (
                <span />
              )}
              {action ? (
                <Button size='xs' variant={action.variant} disabled={action.busy} onClick={action.onClick}>
                  {action.busy ? <LoaderCircle className='size-3 spin-glyph' /> : undefined}
                  {action.busy ? 'Please wait…' : action.label}
                </Button>
              ) : undefined}
            </div>
          </PopoverContent>
        </Popover>
        <span className='sr-only' role='status' aria-live='polite'>
          {title}
        </span>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
