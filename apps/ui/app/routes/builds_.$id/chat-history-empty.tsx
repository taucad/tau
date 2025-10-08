import { MessageSquare, Lightbulb } from 'lucide-react';
import { EmptyItems } from '#components/ui/empty-items.js';

export function ChatHistoryEmpty({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <EmptyItems className={className}>
      <div className="mb-3 rounded-full bg-muted/50 p-2">
        <MessageSquare className="size-6 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="mb-1 text-base font-medium">No messages yet</h3>
      <p className="mb-4 text-sm text-muted-foreground">Start a conversation by typing a message below</p>

      <div className="mt-4 w-full space-y-3 pt-4 text-left">
        <div className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <div className="mr-4 flex-1 space-y-1">
            <p className="text-xs font-medium text-foreground">Tips for best results:</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-1.5">
                <span className="text-primary">•</span>
                <span>
                  <strong className="font-medium text-foreground">Be specific</strong> - Include dimensions, materials,
                  and intended use (e.g., &quot;3D printable&quot;, &quot;engineering part&quot;)
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary">•</span>
                <span>
                  <strong className="font-medium text-foreground">Use parameters</strong> - Request parametric designs
                  with descriptive variable names for easy customization
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary">•</span>
                <span>
                  <strong className="font-medium text-foreground">Break it down</strong> - For complex models, describe
                  components and how they connect
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary">•</span>
                <span>
                  <strong className="font-medium text-foreground">Specify constraints</strong> - Mention tolerances,
                  clearances, or manufacturing requirements
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </EmptyItems>
  );
}
