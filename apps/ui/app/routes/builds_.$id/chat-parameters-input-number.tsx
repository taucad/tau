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

type ChatParametersInputNumberProps = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  readonly unit?: string;
  readonly name: string;
  readonly value: number;
  readonly onValueChange?: (value: number) => void;
};

export function ChatParametersInputNumber({
  className,
  unit = 'mm',
  value,
  name,
  onValueChange,
  ...properties
}: ChatParametersInputNumberProps): React.ReactNode {
  const descriptor = getDescriptor(name);

  const isCount = descriptor === 'count';
  const isAngle = descriptor === 'angle';
  const isUnitless = descriptor === 'unitless';

  // Local UI state so empty strings and partial numbers
  // (i.e. starting with a negative sign or decimal point) don't immediately
  // propagate to the parent component.
  const [text, setText] = React.useState<string>(() => String(value));
  const [isFocused, setIsFocused] = React.useState<boolean>(false);

  // Sync UI when external value changes, but avoid clobbering while user is typing
  React.useEffect(() => {
    if (!isFocused) {
      setText(String(value));
    }
  }, [value, isFocused]);

  function commitIfValid(current: string): void {
    if (current === '') {
      return; // Do not propagate empty values
    }

    const parsed = Number(current);
    if (Number.isFinite(parsed)) {
      onValueChange?.(parsed);
    }
  }

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
        inputMode="decimal"
        value={text}
        className={cn(isCount ? 'pl-8' : 'pr-8', 'focus-visible:ring-0', className)}
        {...properties}
        onFocus={() => {
          setIsFocused(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          if (text === '') {
            setText(String(value));
            return;
          }

          commitIfValid(text);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next === '') {
            return; // Do not propagate empty values
          }

          commitIfValid(next);
        }}
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
