import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { cn } from '#utils/ui.utils.js';

type GraphicsPanelProps = {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly className?: string;
};

export function GraphicsPanel({ title, children, className }: GraphicsPanelProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className={cn('pointer-events-auto overflow-hidden rounded-md border bg-sidebar', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent className='border-b'>
          <div className='p-2'>{children}</div>
        </CollapsibleContent>
        <CollapsibleTrigger className='group/collapsible flex h-8 w-full items-center justify-between px-2 py-1.5 transition-colors hover:bg-accent'>
          <span className='text-xs font-medium'>{title}</span>
          <ChevronRight className='size-3.5 text-muted-foreground transition-transform duration-200 ease-in-out group-data-[state=open]/collapsible:-rotate-90' />
        </CollapsibleTrigger>
      </Collapsible>
    </div>
  );
}
