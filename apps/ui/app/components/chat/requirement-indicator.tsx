import { Check, X } from 'lucide-react';

type RequirementIndicatorProps = {
  readonly passedCount: number;
  readonly failedCount: number;
};

export function RequirementIndicator({ passedCount, failedCount }: RequirementIndicatorProps): React.JSX.Element {
  return (
    <span className='flex items-center gap-1 font-mono text-xs'>
      {passedCount > 0 && (
        <span className='flex items-center text-success'>
          <Check className='size-3' />
          {passedCount}
        </span>
      )}
      {failedCount > 0 && (
        <span className='flex items-center text-feature'>
          <X className='size-3' />
          {failedCount}
        </span>
      )}
    </span>
  );
}
