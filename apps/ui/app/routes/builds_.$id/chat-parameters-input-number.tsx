import * as React from 'react';
import { Hash } from 'lucide-react';
import { Angle } from '#components/icons/angle.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import { Input } from '#components/ui/input.js';
import type { MeasurementDescriptor } from '#constants/build-parameters.js';

const baseIndicatorClass = 'flex h-7 w-7 items-center justify-center border bg-muted text-muted-foreground select-none';

type ChatParametersInputNumberProps = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  readonly unit?: string;
  readonly descriptor: MeasurementDescriptor;
  /**
   * The numeric value in the current unit
   */
  readonly value: number;
  /**
   * Optional formatted string value to display (takes precedence over value)
   * Used when displaying converted values with specific formatting
   */
  readonly formattedValue?: string;
  /**
   * Whether the displayed value is an approximation (shows ≈ indicator)
   */
  readonly isApproximation?: boolean;
  /**
   * Step value for keyboard increments (arrow up/down)
   */
  readonly step?: number;
  /**
   * Unit conversion factor (for parsing unit suffixes in input)
   */
  readonly unitFactor?: number;
  /**
   * Callback when value changes (receives value in current unit)
   */
  readonly onValueChange?: (value: number) => void;
  /**
   * Callback when text input changes (receives raw text for parsing by machine)
   */
  readonly onTextChange?: (text: string) => void;
};

export const ChatParametersInputNumber = React.forwardRef<HTMLInputElement, ChatParametersInputNumberProps>(
  (
    {
      className,
      unit = 'mm',
      value,
      formattedValue,
      isApproximation = false,
      step,
      unitFactor = 1,
      descriptor,
      onValueChange,
      onTextChange,
      ...properties
    },
    ref,
  ): React.ReactNode => {
    const isCount = descriptor === 'count';
    const isAngle = descriptor === 'angle';
    const isUnitless = descriptor === 'unitless';

    // Use formatted value if provided, otherwise convert number to string
    const displayValue = formattedValue ?? String(value);

    // Local UI state so empty strings and partial numbers
    // (i.e. starting with a negative sign or decimal point) don't immediately
    // propagate to the parent component.
    const [text, setText] = React.useState<string>(() => displayValue);
    const [isFocused, setIsFocused] = React.useState<boolean>(false);
    const [hasUserEdit, setHasUserEdit] = React.useState<boolean>(false);

    // Sync UI when external value changes, but avoid clobbering while user is typing
    React.useEffect(() => {
      if (!isFocused || !hasUserEdit) {
        setText(displayValue);
        if (!isFocused) {
          setHasUserEdit(false);
        }
      }
    }, [displayValue, isFocused, hasUserEdit]);

    function commitIfValid(current: string, source: 'change' | 'blur' = 'change'): void {
      if (current === '') {
        return; // Do not propagate empty values
      }

      // Simple number parsing for immediate feedback
      const parsed = Number(current);
      if (Number.isFinite(parsed)) {
        // On blur, only emit if the numeric value actually changed
        if (source === 'blur' && Math.abs(parsed - value) < 1e-10) {
          return;
        }

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
          ref={ref}
          autoComplete="off"
          type="text"
          inputMode="decimal"
          value={text}
          step={step}
          className={cn(isCount ? 'pl-8' : 'pr-7', 'focus-visible:ring-0', className)}
          {...properties}
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
            if (text === '') {
              setText(displayValue);
              setHasUserEdit(false);
              return;
            }

            // Only commit on blur if user actually edited the text
            if (hasUserEdit) {
              commitIfValid(text, 'blur');
            }

            setHasUserEdit(false);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            setHasUserEdit(true);
            if (next === '') {
              return; // Do not propagate empty values
            }

            // Send to machine for parsing and conversion (happens live)
            onTextChange?.(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Just blur - conversion already happened during onChange
              event.currentTarget.blur();
            }
          }}
        />
        {!isCount && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  baseIndicatorClass,
                  'absolute right-0 rounded-r-md border-l-0',
                  'group-focus-within/input:border-ring',
                  'pointer-events-none cursor-text',
                  isApproximation && 'pointer-events-auto',
                )}
              >
                {isAngle ? (
                  <Angle className="size-4 stroke-[1.5px]" />
                ) : isUnitless ? (
                  <Hash className="size-3" />
                ) : (
                  <span className="inline-flex flex-col items-center justify-center font-mono text-xs tracking-wide">
                    {isApproximation ? (
                      <span className="-mb-0.5 text-[0.7rem] leading-none text-muted-foreground/60">≈</span>
                    ) : null}
                    <span className={cn(isApproximation && 'leading-none')}>{unit}</span>
                  </span>
                )}
              </span>
            </TooltipTrigger>
            {isApproximation ? <TooltipContent>Rounded to 4 significant figures</TooltipContent> : null}
          </Tooltip>
        )}
      </div>
    );
  },
);
