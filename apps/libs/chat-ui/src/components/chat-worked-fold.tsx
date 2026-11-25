import { ChevronRight, ListCollapse } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { activityChevronClassName } from '#components/chat-activity-group.js';

type ChatWorkedFoldProps = {
  /** Every tool family the narrative ran, as an activity summary reads it ("Read files, ran commands"). */
  readonly summary: string;
  /** The working narrative: commentary and activity lines, in order. */
  readonly children: React.ReactNode;
};

/**
 * An older turn's working narrative, folded to one line once the next request is sent.
 *
 * The line rests closed and only the reader opens it, like every transcript disclosure. Opened, the narrative reads
 * as it did live, under a hairline that marks where it ends and the answer begins.
 *
 * @param properties - The fold's summary and the narrative it holds.
 * @returns The fold's line and, once opened, the narrative.
 */
export function ChatWorkedFold({ summary, children }: ChatWorkedFoldProps): React.JSX.Element {
  const detail = summary === '' ? '' : ` · ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
  return (
    <Collapsible data-slot='worked-fold'>
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='group/chat-tool-trigger -ml-2 flex w-full min-w-0 items-center justify-start gap-1.5 overflow-hidden font-normal text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent pointer-coarse:min-h-8'
        >
          <ListCollapse aria-hidden='true' className='size-3 shrink-0' />
          <span className='min-w-0 truncate'>
            <span className='font-medium'>Worked</span>
            {detail}
          </span>
          <ChevronRight
            aria-hidden='true'
            className={cn(activityChevronClassName, 'group-data-[state=open]/chat-tool-trigger:rotate-90')}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role='region'
          aria-label='Working narrative'
          data-slot='worked-narrative'
          className='mt-0.5 mb-1.5 ml-1.5 flex min-w-0 flex-col gap-2 border-l pl-3'
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
