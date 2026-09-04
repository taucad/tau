import { cn } from '@taucad/ui/utils/cn';

type ChangeIndicatorProps = {
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly colorMode?: 'semantic' | 'header-hover';
};

export function ChangeIndicator({
  linesAdded,
  linesRemoved,
  colorMode = 'semantic',
}: ChangeIndicatorProps): React.JSX.Element {
  return (
    <span className='inline-flex items-center gap-1 font-mono text-xs'>
      {linesAdded > 0 && (
        <span
          className={cn(
            colorMode === 'semantic' && 'text-success',
            colorMode === 'header-hover' && 'text-inherit group-hover/file-mutation-trigger:text-success',
          )}
        >
          +{linesAdded}
        </span>
      )}
      {linesRemoved > 0 && (
        <span
          className={cn(
            colorMode === 'semantic' && 'text-destructive',
            colorMode === 'header-hover' && 'text-inherit group-hover/file-mutation-trigger:text-destructive',
          )}
        >
          -{linesRemoved}
        </span>
      )}
    </span>
  );
}
