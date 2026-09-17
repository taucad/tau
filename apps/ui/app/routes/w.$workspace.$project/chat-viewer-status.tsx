import { useSelector } from '@xstate/react';
import { Loader } from '#components/ui/loader.js';
import { useProject } from '#hooks/use-project.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { cn } from '@taucad/ui/utils/cn';
import { ZooUpgradeBanner } from '#cloud/zoo-upgrade-banner.js';
import { selectCadFailureIssues, selectCadLoadingPhase } from '#machines/cad.machine.js';

export function ChatViewerStatus({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
  const { projectRef } = useProject();
  const cadRef = useCad();
  const loadingState = useCadSelector(selectCadLoadingPhase, undefined);
  const projectState = useSelector(projectRef, (state) => state.value);
  const failureIssues = useCadSelector(selectCadFailureIssues, undefined);
  const failureMessage = failureIssues?.find((issue) => issue.severity === 'error')?.message;

  // Don't show loading states if the project failed to load (e.g., not found)
  if (projectState === 'error') {
    return null;
  }

  if (loadingState) {
    return (
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
    );
  }

  return (
    <ZooUpgradeBanner
      message={failureMessage}
      onRetry={() => {
        cadRef?.send({ type: 'filesystemBindingChanged' });
      }}
    />
  );
}
