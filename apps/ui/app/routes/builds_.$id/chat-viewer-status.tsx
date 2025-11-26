import { useSelector } from '@xstate/react';
import { HammerAnimation } from '#components/hammer-animation.js';
import { useBuild } from '#hooks/use-build.js';
import { cn } from '#utils/ui.utils.js';

export function ChatViewerStatus({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
  const { cadRef: cadActor } = useBuild();
  const state = useSelector(cadActor, (state) => state.value);

  return ['buffering', 'rendering', 'booting', 'initializing'].includes(state) ? (
    <div
      {...props}
      className={cn(
        'm-auto flex items-center gap-2 rounded-md border bg-background/70 p-1 backdrop-blur-sm md:px-2',
        className,
      )}
    >
      <HammerAnimation className="size-4 animate-spin text-primary ease-in-out md:size-6" />
      <span className="font-mono text-sm text-muted-foreground capitalize">{state}...</span>
    </div>
  ) : null;
}
