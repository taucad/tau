import { useSelector } from '@xstate/react';
import { HammerAnimation } from '#components/hammer-animation.js';
import { cadActor } from '#routes/builds_.$id/cad-actor.js';
import { cn } from '#utils/ui.utils.js';

export function ChatViewerStatus({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const state = useSelector(cadActor, (state) => state.value);

  return (
    <div {...props} className={cn(className)}>
      {['buffering', 'rendering', 'booting', 'initializing'].includes(state) ? (
        <div className="m-auto flex items-center gap-2 rounded-md border bg-background/70 p-1 backdrop-blur-sm md:p-2">
          <span className="font-mono text-sm text-muted-foreground capitalize">{state}...</span>
          <HammerAnimation className="size-4 animate-spin text-primary ease-in-out md:size-6" />
        </div>
      ) : null}
    </div>
  );
}
