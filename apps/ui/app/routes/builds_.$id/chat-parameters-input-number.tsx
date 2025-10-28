import * as React from 'react';
import { Hash } from 'lucide-react';
import { Angle } from '#components/icons/angle.js';
import { cn } from '#utils/ui.utils.js';
import { Input } from '#components/ui/input.js';
import { isCountParameter, isAngleParameter, isUnitlessParameter } from '#constants/build-parameters.js';

type MeasurementDescriptor = 'length' | 'angle' | 'count' | 'unitless';

/**
 * Determine the descriptor type based on parameter name
 * @param name - Parameter name to analyze
 * @returns The appropriate descriptor for the parameter
 */
function getDescriptor(name?: string): MeasurementDescriptor {
  if (!name) {
    return 'length';
  }

  if (isCountParameter(name)) {
    return 'count';
  }

  if (isAngleParameter(name)) {
    return 'angle';
  }

  if (isUnitlessParameter(name)) {
    return 'unitless';
  }

  return 'length';
}

const baseIndicatorClass = 'flex h-7 w-7 items-center justify-center border bg-muted text-muted-foreground select-none';

type ChatParametersInputNumberProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  readonly unit?: string;
  readonly name: string;
};

export function ChatParametersInputNumber({
  className,
  unit = 'mm',
  value,
  name,
  ...properties
}: ChatParametersInputNumberProps): React.ReactNode {
  const descriptor = getDescriptor(name);

  const isCount = descriptor === 'count';
  const isAngle = descriptor === 'angle';
  const isUnitless = descriptor === 'unitless';

  return (
    <div
      className={cn(
        'group/input relative flex flex-row items-center rounded-md',
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        'has-disabled:cursor-not-allowed',
      )}
    >
      {isCount ? (
        <span
          className={cn(
            baseIndicatorClass,
            'absolute left-0',
            'rounded-l-md border-r-0',
            'group-focus-within/input:border-ring',
            'pointer-events-none cursor-text',
          )}
        >
          <span className="font-mono text-sm">×</span>
        </span>
      ) : null}
      <Input
        autoComplete="off"
        type="number"
        value={value}
        className={cn(isCount ? 'pl-8' : 'pr-8', 'focus-visible:ring-0', className)}
        {...properties}
      />
      {!isCount && (
        <span
          className={cn(
            baseIndicatorClass,
            'absolute right-0 rounded-r-md border-l-0',
            'group-focus-within/input:border-ring',
            'pointer-events-none cursor-text',
          )}
        >
          {isAngle ? (
            <Angle className="size-4 stroke-[1.5px]" />
          ) : isUnitless ? (
            <Hash className="size-3" />
          ) : (
            <span className="font-mono text-xs tracking-wide">{unit}</span>
          )}
        </span>
      )}
    </div>
  );
}
