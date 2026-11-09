import { Check, CircleDashed, X } from 'lucide-react';

type RequirementIndicatorProps = {
  readonly passedCount: number;
  readonly failedCount: number;
  /** Requirements neither passed nor decided false: inconclusive, unsupported or not run. */
  readonly undecidedCount?: number;
};

export function RequirementIndicator({
  passedCount,
  failedCount,
  undecidedCount = 0,
}: RequirementIndicatorProps): React.JSX.Element {
  return (
    <span className='flex items-center gap-1 font-mono text-xs'>
      {passedCount > 0 && (
        <span className='flex items-center text-success'>
          <Check aria-hidden className='size-3' />
          {passedCount}
          <span className='sr-only'> passed</span>
        </span>
      )}
      {failedCount > 0 && (
        <span className='flex items-center text-feature'>
          <X aria-hidden className='size-3' />
          {failedCount}
          <span className='sr-only'> failed</span>
        </span>
      )}
      {undecidedCount > 0 && (
        <span className='flex items-center text-warning'>
          <CircleDashed aria-hidden className='size-3' />
          {undecidedCount}
          <span className='sr-only'> not decided</span>
        </span>
      )}
    </span>
  );
}
