import { useSelector } from '@xstate/react';
import { Loader } from '#components/ui/loader.js';
import { useProject } from '#hooks/use-project.js';
import { useCadSelector } from '#hooks/use-cad.js';
import { cn } from '@taucad/ui/utils/cn';

export function ChatViewerStatus({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
  const { projectRef } = useProject();
  const loadingState = useCadSelector((state) => {
    if (state.matches('connecting')) {
      return 'connecting';
    }
    if (state.matches('buffering')) {
      return 'buffering';
    }
    if (state.matches('rendering')) {
      return 'rendering';
    }
    return undefined;
  }, undefined);
  const projectState = useSelector(projectRef, (state) => state.value);

  // Don't show loading states if the project failed to load (e.g., not found)
  if (projectState === 'error') {
    return null;
  }

  return loadingState ? (
    <div
      {...props}
      className={cn(
        'm-auto flex items-center gap-2 rounded-md border bg-background/70 p-1 backdrop-blur-sm md:px-2',
        className,
      )}
    >
      <Loader className='size-4 text-primary md:size-6' />
      <span className='font-mono text-sm text-muted-foreground capitalize'>{loadingState}...</span>
    </div>
  ) : null;
}
