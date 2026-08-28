import { MessageSquare } from 'lucide-react';
import { EmptyItems } from '#components/ui/empty-items.js';
import { cn } from '#utils/ui.utils.js';

export function ChatHistoryEmpty({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <EmptyItems
      className={cn('m-auto h-auto w-full max-w-xs rounded-none border-0 bg-transparent px-3 py-6', className)}
    >
      <div className='mb-3 rounded-xl border bg-card p-2'>
        <MessageSquare className='size-5 text-muted-foreground' strokeWidth={1.5} />
      </div>
      <h3 className='mb-1 text-base font-medium text-foreground'>What would you like to build?</h3>
      <p className='text-sm leading-relaxed text-muted-foreground'>
        Describe the shape, dimensions, materials, or constraints. You can also attach a reference or mention a project
        file.
      </p>
    </EmptyItems>
  );
}
