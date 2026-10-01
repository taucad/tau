import type React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { useFeature } from '#flags/use-feature.js';

/**
 * Diagnostic disclosure for chat notices, available only in Tau Debug.
 *
 * @param properties - Diagnostic content kept out of ordinary recovery notices.
 * @returns The collapsed disclosure, or nothing when Tau Debug is off.
 */
export function ChatErrorDetails({ children }: { readonly children: React.ReactNode }): React.ReactNode {
  const isDebug = useFeature('tauDebug');
  if (!isDebug) {
    return null;
  }

  return (
    <Collapsible>
      <div className='flex justify-end'>
        <CollapsibleTrigger asChild>
          <Button variant='outline' size='xs' className='group/details'>
            Debug details
            <ChevronDown
              aria-hidden
              className='size-3 text-muted-foreground transition-transform group-data-[state=open]/details:rotate-180 motion-reduce:transition-none'
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className='max-h-60 overflow-auto text-xs text-muted-foreground'>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
