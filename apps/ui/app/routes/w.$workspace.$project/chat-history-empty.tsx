import { MessageSquare } from 'lucide-react';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { cn } from '#utils/ui.utils.js';

export function ChatHistoryEmpty({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <PanelEmptyState
      icon={MessageSquare}
      title='What would you like to build?'
      description='Describe the shape, dimensions, materials, or constraints. You can also attach a reference or mention a project file.'
      className={cn('m-auto h-auto max-w-xs py-6 [container-type:inline-size]', className)}
    />
  );
}
