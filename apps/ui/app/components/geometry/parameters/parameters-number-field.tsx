import * as React from 'react';
import { Hash } from 'lucide-react';
import { Angle } from '#components/icons/angle.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import type { MeasurementDescriptor } from '#constants/project-parameters.js';

const dragThresholdPx = 3;

type ParametersNumberFieldProps = {
  readonly value: number;
  readonly formattedValue?: string;
  readonly isApproximation?: boolean;
  readonly unit?: string;
  readonly descriptor: MeasurementDescriptor;
  readonly rangeMin: number;
  readonly rangeMax: number;
  readonly step: number;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop
  readonly disabled?: boolean;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly onSliderChange: (value: number) => void;
  readonly onSliderRelease: (value: number) => void;
  readonly onValueChange: (value: number) => void;
  readonly onTextChange: (text: string) => void;
};

function UnitIndicator({
  descriptor,
  unit,
  isApproximation,
}: {
  readonly descriptor: MeasurementDescriptor;
  readonly unit: string;
  readonly isApproximation: boolean;
}): React.ReactNode {
  if (!unit) {
    return null;
  }

  const isAngle = descriptor === 'angle';
  const isUnitless = descriptor === 'unitless';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'pointer-events-none absolute right-0 flex h-[var(--param-field-h,1.5rem)] w-6 select-none items-center justify-center text-muted-foreground/60 text-[11px]',
            isApproximation && 'pointer-events-auto',
          )}
        >
          {isAngle && unit !== 'deg' ? (
            <Angle className='size-3.5 stroke-[1.5px]' />
          ) : isUnitless ? (
            <Hash className='size-2.5' />
          ) : (
            <span
              className={cn(
                'inline-flex flex-col items-center justify-center font-mono text-[10px]',
                unit.length <= 2 ? 'tracking-wide' : unit.length <= 3 ? 'tracking-normal' : 'tracking-tight',
              )}
            >
              {isApproximation ? (
                <span className='-mb-0.5 text-[0.6rem] leading-none text-muted-foreground/60'>&asymp;</span>
              ) : null}
              <span className={cn(isApproximation && 'leading-none')}>{unit}</span>
            </span>
          )}
        </span>
      </TooltipTrigger>
      {isApproximation ? <TooltipContent>Rounded to 4 significant figures</TooltipContent> : null}
    </Tooltip>
  );
}

function capturePointer(element: Element, pointerId: number): void {
  if ('setPointerCapture' in element) {
    element.setPointerCapture(pointerId);
  }
}

function releasePointer(element: Element, pointerId: number): void {
  if ('releasePointerCapture' in element) {
    element.releasePointerCapture(pointerId);
  }
}

function getDecimalCount(value: number): number {
  return (String(value).split('.')[1] ?? '').length;
}

function roundValue(value: number, decimalCount: number): number {
  const rounder = 10 ** decimalCount;
  return Math.round(value * rounder) / rounder;
}

export function snapToStep(v: number, step: number, min = 0): number {
  if (step <= 0) {
    return v;
  }
  const decimalCount = Math.max(getDecimalCount(step), getDecimalCount(min));
  const snapped = Math.round((v - min) / step) * step + min;
  return roundValue(snapped, decimalCount);
}

export const ParametersNumberField = React.forwardRef<HTMLInputElement, ParametersNumberFieldProps>(
  (
    {
      value,
      formattedValue,
      isApproximation = false,
      unit = 'mm',
      descriptor,
      rangeMin,
      rangeMax,
      step,
      disabled,
      className,
      'aria-label': ariaLabel,
      onSliderChange,
      onSliderRelease,
      onValueChange,
      onTextChange,
    },
    forwardedRef,
  ): React.ReactNode => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const inputElementRef = React.useRef<HTMLInputElement>(null);

    const isCount = descriptor === 'count';
    const displayValue = formattedValue ?? String(value);

    const [text, setText] = React.useState<string>(() => displayValue);
    const [isEditing, setIsEditing] = React.useState(false);
    const [hasUserEdit, setHasUserEdit] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);

    const dragRef = React.useRef({ startX: 0, startValue: 0, hasMoved: false });
    const lastScrubValueRef = React.useRef(value);
    const revertingRef = React.useRef(false);
    const preEditValueRef = React.useRef(value);

    const setInputRef = React.useCallback(
      (element: HTMLInputElement) => {
        inputElementRef.current = element;
        if (typeof forwardedRef === 'function') {
          forwardedRef(element);
        } else if (forwardedRef) {
          forwardedRef.current = element;
        }
      },
      [forwardedRef],
    );

    React.useEffect(() => {
      if (!isEditing || !hasUserEdit) {
        setText(displayValue);
        if (!isEditing) {
          setHasUserEdit(false);
        }
      }
    }, [displayValue, isEditing, hasUserEdit]);

    const range = rangeMax - rangeMin;
    const fillPercent = range > 0 ? Math.max(0, Math.min(100, ((value - rangeMin) / range) * 100)) : 0;

    // --- Pointer handlers for drag-to-scrub ---

    const handlePointerDown = React.useCallback(
      (event: React.PointerEvent) => {
        if (disabled) {
          return;
        }
        if (isEditing || event.button !== 0) {
          return;
        }

        const container = containerRef.current;
        if (!container) {
          return;
        }

        event.preventDefault();
        capturePointer(container, event.pointerId);

        dragRef.current = { startX: event.clientX, startValue: value, hasMoved: false };
        lastScrubValueRef.current = value;
      },
      [disabled, isEditing, value],
    );

    const handlePointerMove = React.useCallback(
      (event: React.PointerEvent) => {
        const state = dragRef.current;
        if (state.startX === 0) {
          return;
        }

        const deltaX = event.clientX - state.startX;

        if (!state.hasMoved && Math.abs(deltaX) > dragThresholdPx) {
          state.hasMoved = true;
          setIsDragging(true);
        }

        if (!state.hasMoved) {
          return;
        }

        const container = containerRef.current;
        if (!container || range <= 0) {
          return;
        }

        const sensitivity = range / container.offsetWidth;
        const raw = state.startValue + deltaX * sensitivity;
        const clamped = Math.max(rangeMin, Math.min(rangeMax, raw));
        const snapped = snapToStep(clamped, step, rangeMin);

        lastScrubValueRef.current = snapped;
        onSliderChange(snapped);
      },
      [range, rangeMin, rangeMax, step, onSliderChange],
    );

    const handlePointerUp = React.useCallback(
      (event: React.PointerEvent) => {
        const container = containerRef.current;
        if (container) {
          releasePointer(container, event.pointerId);
        }

        const state = dragRef.current;
        const wasDragging = state.hasMoved;

        dragRef.current = { startX: 0, startValue: 0, hasMoved: false };

        if (wasDragging) {
          setIsDragging(false);
          onSliderRelease(lastScrubValueRef.current);
          return;
        }

        // Click (no drag) — enter edit mode
        const input = inputElementRef.current;
        if (input) {
          input.focus();
          input.select();
        }
      },
      [onSliderRelease],
    );

    // --- Text input handlers ---

    const handleInputBlur = React.useCallback(() => {
      setIsEditing(false);

      if (revertingRef.current) {
        revertingRef.current = false;
        setHasUserEdit(false);
        return;
      }

      if (text === '') {
        setText(displayValue);
        setHasUserEdit(false);
        return;
      }

      if (hasUserEdit) {
        const parsed = Number(text);
        if (Number.isFinite(parsed) && Math.abs(parsed - value) >= 1e-10) {
          onValueChange(parsed);
        }
      }

      setHasUserEdit(false);
    }, [text, displayValue, hasUserEdit, value, onValueChange]);

    const handleInputChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value;
        setText(next);
        setHasUserEdit(true);
        if (next !== '') {
          onTextChange(next);
        }
      },
      [onTextChange],
    );

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          revertingRef.current = true;
          const preEdit = preEditValueRef.current;
          setText(String(preEdit));
          setHasUserEdit(false);
          onValueChange(preEdit);
          event.currentTarget.blur();
        }
      },
      [onValueChange],
    );

    return (
      <div
        ref={containerRef}
        className={cn(
          'group/number-field relative flex h-[var(--param-field-h,1.5rem)] w-full items-center overflow-hidden rounded-[var(--param-field-radius,var(--radius-md))] border border-border/50 bg-muted',
          'transition-colors',
          !disabled && !isEditing && 'cursor-col-resize hover:border-border',
          isEditing && 'border-border bg-background',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        onPointerDown={isEditing ? undefined : handlePointerDown}
        onPointerMove={isEditing ? undefined : handlePointerMove}
        onPointerUp={isEditing ? undefined : handlePointerUp}
      >
        {/* Fill bar */}
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 bg-primary transition-opacity',
            isEditing ? 'opacity-0' : isDragging ? 'opacity-60' : 'opacity-15 group-hover/number-field:opacity-40',
          )}
          style={{ width: `${fillPercent}%` }}
        />

        {/* Display text (visible when not editing) */}
        {isEditing ? null : (
          <span className='pointer-events-none absolute inset-0 flex items-center justify-end px-2 pr-6 text-sm text-[var(--param-field-color,var(--color-muted-foreground))] tabular-nums transition-colors select-none group-hover/number-field:text-[var(--param-field-color-focus,var(--color-foreground))]'>
            {displayValue}
          </span>
        )}

        {/* Count suffix indicator */}
        {isCount ? (
          <span className='pointer-events-none absolute right-0 flex h-[var(--param-field-h,1.5rem)] w-6 items-center justify-center text-[11px] text-muted-foreground/60 select-none'>
            <span className='font-mono text-xs'>&times;</span>
          </span>
        ) : null}

        {/* Input — always in DOM for machine focus/arrow-key actors */}
        <input
          ref={setInputRef}
          autoComplete='off'
          type='text'
          inputMode='decimal'
          aria-label={ariaLabel}
          value={text}
          disabled={disabled}
          className={cn(
            'h-full w-full bg-transparent px-2 pr-6 text-right text-(--param-field-color-focus,var(--color-foreground)) text-sm tabular-nums outline-none',
            isEditing ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          data-lpignore='true'
          data-form-type='other'
          onFocus={() => {
            preEditValueRef.current = value;
            setIsEditing(true);
          }}
          onBlur={handleInputBlur}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />

        <UnitIndicator descriptor={descriptor} unit={unit} isApproximation={isApproximation} />
      </div>
    );
  },
);
