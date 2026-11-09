import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { disclosureMotion } from '@taucad/ui/components/actions';

/** Presentation shared by the desktop transcript and mobile compositions; the host owns revision evidence. */
export function ChatRevisionSummary({
  label,
  status,
  action,
  children,
}: {
  readonly label: string;
  readonly status: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      role='group'
      aria-label='Turn revision'
      className='mx-2 -mt-3 rounded-b-lg border border-t-0 bg-muted/40 pt-3'
    >
      <div className='flex items-start'>
        <CollapsibleTrigger asChild>
          <button
            type='button'
            aria-label={`${label} · revision details`}
            className='group/revision flex min-w-0 flex-1 cursor-action items-start gap-2 rounded-b-lg px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:focus-outline'
          >
            {status}
            <ChevronDown
              aria-hidden
              className='mt-px size-3.5 shrink-0 transition-transform group-data-[state=open]/revision:rotate-180 motion-reduce:transition-none'
            />
          </button>
        </CollapsibleTrigger>
        {action}
      </div>
      <CollapsibleContent className={disclosureMotion}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
