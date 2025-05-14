import * as React from 'react';
import { Angle } from '@/components/icons/angle.js';
import { cn } from '@/utils/ui.js';
import { Input } from '@/components/ui/input.js';
import { isCountParameter, isAngleParameter } from '@/routes/builds_.$id/chat-parameters-constants.js';

type MeasurementDescriptor = 'length' | 'angle' | 'count';

/**
 * Determine the descriptor type based on parameter name
 * @param name - Parameter name to analyze
 * @returns The appropriate descriptor for the parameter
 */
function getDescriptor(name?: string): MeasurementDescriptor {
  if (!name) return 'length';

  if (isCountParameter(name)) {
    return 'count';
  }

  if (isAngleParameter(name)) {
    return 'angle';
  }

  return 'length';
}

const baseIndicatorClass = 'flex h-6 w-6 items-center justify-center border bg-muted text-muted-foreground select-none';

type ChatParametersInputNumberProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  readonly unit?: string;
  readonly name?: string;
};

export function ChatParametersInputNumber({
  className,
  unit = 'mm',
  value,
  name,
  ...properties
}: ChatParametersInputNumberProps): React.ReactNode {
  const descriptor = getDescriptor(name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const isCount = descriptor === 'count';
  const isAngle = descriptor === 'angle';

  const handleIndicatorClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        'group relative flex flex-row items-center rounded-md',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
      )}
    >
      {isCount ? (
        <span
          className={cn(
            baseIndicatorClass,
            'rounded-l-md border-r-0',
            'transition-[color,box-shadow] group-focus-within:z-10 group-focus-within:border-ring',
            'cursor-text',
          )}
          onClick={handleIndicatorClick}
        >
          <span className="font-mono text-sm">×</span>
        </span>
      ) : null}
      <Input
        ref={inputRef}
        type="number"
        value={value}
        className={cn(
          isCount ? 'rounded-l-none border-l-0' : '',
          isCount ? '' : 'rounded-r-none border-r-0',
          'focus-visible:ring-0',
          className,
        )}
        {...properties}
      />
      {!isCount && (
        <span
          className={cn(baseIndicatorClass, 'rounded-r-md border-l-0', 'group-focus-within:border-ring', 'cursor-text')}
          onClick={handleIndicatorClick}
        >
          {isAngle ? <Angle className="size-4" /> : <span className="font-mono text-xs">{unit}</span>}
        </span>
      )}
    </div>
  );
}
