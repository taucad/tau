import { useState } from 'react';
import { ChevronRight, LoaderCircle, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Button } from '@taucad/ui/components/button';

type ChatActivityGroupProps = {
  readonly summary: string;
  readonly children: React.ReactNode;
  readonly icon?: LucideIcon;
  readonly isActive?: boolean;
  /** A row inside is still running; a collapsed header shows that instead of its family icon. */
  readonly hasActiveRows?: boolean;
};

/** One semantic summary over a flat, chronological group of tool rows. */
export function ChatActivityGroup({
  summary,
  children,
  icon: Icon = Wrench,
  isActive = false,
  hasActiveRows = false,
}: ChatActivityGroupProps): React.JSX.Element {
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined);
  const isOpen = userOpen ?? isActive;
  /* Expanded, the running row's own card spins; collapsed, the header is the only surface (R7). */
  const isBusy = hasActiveRows && !isOpen;

  return (
    <Collapsible open={isOpen} onOpenChange={setUserOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          aria-busy={isBusy || undefined}
          className='group/chat-tool-trigger -ml-2 flex w-full min-w-0 items-center justify-start gap-1.5 overflow-hidden font-normal text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent'
        >
          {isBusy ? (
            <LoaderCircle
              aria-hidden='true'
              data-slot='activity-group-spinner'
              className='size-3 shrink-0 animate-spin motion-reduce:animate-none'
            />
          ) : (
            <Icon aria-hidden='true' className='size-3 shrink-0' />
          )}
          <span className='min-w-0 truncate'>{summary}</span>
          <ChevronRight
            aria-hidden='true'
            className='size-3 shrink-0 opacity-0 transition-[opacity,transform] duration-200 group-hover/chat-tool-trigger:opacity-100 group-focus-visible/chat-tool-trigger:opacity-100 group-data-[state=open]/chat-tool-trigger:rotate-90'
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role='region'
          aria-label={`${summary} details`}
          className='flex max-h-80 scroll-shadows-y flex-col overflow-y-auto overscroll-contain'
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
