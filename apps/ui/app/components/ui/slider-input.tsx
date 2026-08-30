import * as React from 'react';
import { clamp } from '#utils/number.utils.js';
import { cn } from '#utils/ui.utils.js';

const dragThresholdPx = 3;

type ActivePointer = {
  readonly pointerId: number;
  readonly startValue: number;
  readonly startX: number;
  hasMoved: boolean;
};

export type SliderInputProperties = Omit<
  React.ComponentPropsWithoutRef<'div'>,
  'children' | 'data-slot' | 'onChange' | 'onInput'
> & {
  readonly value: number;
  readonly displayValue?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly leadingContent?: React.ReactNode;
  readonly trailingAdornment?: React.ReactNode;
  readonly dataSlot?: string;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop
  readonly disabled?: boolean;
  readonly 'aria-label': string;
  readonly onScrubChange?: (value: number) => void;
  readonly onScrubCommit?: (value: number) => void;
  readonly onInputChange?: (text: string) => void;
  readonly onInputCommit?: (value: number) => void;
  readonly onFocusChange?: (isFocused: boolean) => void;
};

const capturePointer = (element: Element, pointerId: number): void => {
  if ('setPointerCapture' in element) {
    element.setPointerCapture(pointerId);
  }
};

const releasePointer = (element: Element, pointerId: number): void => {
  if ('hasPointerCapture' in element && !element.hasPointerCapture(pointerId)) {
    return;
  }
  if ('releasePointerCapture' in element) {
    element.releasePointerCapture(pointerId);
  }
};

const getDecimalCount = (value: number): number => (String(value).split('.')[1] ?? '').length;

const roundValue = (value: number, decimalCount: number): number => {
  const rounder = 10 ** decimalCount;
  return Math.round(value * rounder) / rounder;
};

export const snapToStep = (value: number, step: number, min = 0): number => {
  if (step <= 0) {
    return value;
  }
  const decimalCount = Math.max(getDecimalCount(step), getDecimalCount(min));
  const snapped = Math.round((value - min) / step) * step + min;
  return roundValue(snapped, decimalCount);
};

export const SliderInput = ({
  value,
  displayValue = String(value),
  min,
  max,
  step,
  leadingContent,
  trailingAdornment,
  dataSlot = 'slider-input',
  disabled,
  className,
  'aria-label': ariaLabel,
  onScrubChange,
  onScrubCommit,
  onInputChange,
  onInputCommit,
  onFocusChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...rootProperties
}: SliderInputProperties): React.JSX.Element => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activePointerRef = React.useRef<ActivePointer | undefined>(undefined);
  const lastScrubValueRef = React.useRef(value);
  const preEditValueRef = React.useRef(value);
  const preEditDisplayValueRef = React.useRef(displayValue);
  const revertingRef = React.useRef(false);
  const [text, setText] = React.useState(displayValue);
  const [isEditing, setIsEditing] = React.useState(false);
  const [hasUserEdit, setHasUserEdit] = React.useState(false);
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const inputValue = isEditing && hasUserEdit ? text : displayValue;

  const range = max - min;
  const fillPercent = range > 0 ? clamp(((value - min) / range) * 100, 0, 100) : 0;

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerDown?.(event);
      if (disabled === true || isEditing || event.button !== 0 || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      capturePointer(event.currentTarget, event.pointerId);
      activePointerRef.current = {
        pointerId: event.pointerId,
        startValue: value,
        startX: event.clientX,
        hasMoved: false,
      };
      lastScrubValueRef.current = value;
    },
    [disabled, isEditing, onPointerDown, value],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerMove?.(event);
      const activePointer = activePointerRef.current;
      if (!activePointer || activePointer.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - activePointer.startX;
      if (!activePointer.hasMoved && Math.abs(deltaX) > dragThresholdPx) {
        activePointer.hasMoved = true;
        setIsScrubbing(true);
      }
      if (!activePointer.hasMoved || range <= 0 || event.currentTarget.offsetWidth <= 0) {
        return;
      }

      const rawValue = activePointer.startValue + deltaX * (range / event.currentTarget.offsetWidth);
      const nextValue = clamp(snapToStep(rawValue, step, min), min, max);
      lastScrubValueRef.current = nextValue;
      onScrubChange?.(nextValue);
    },
    [max, min, onPointerMove, onScrubChange, range, step],
  );

  const finishPointerInteraction = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>, isCancelled: boolean) => {
      const activePointer = activePointerRef.current;
      if (!activePointer || activePointer.pointerId !== event.pointerId) {
        return;
      }

      releasePointer(event.currentTarget, event.pointerId);
      activePointerRef.current = undefined;

      if (activePointer.hasMoved) {
        setIsScrubbing(false);
        onScrubCommit?.(lastScrubValueRef.current);
        return;
      }

      if (!isCancelled) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    },
    [onScrubCommit],
  );

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerUp?.(event);
      finishPointerInteraction(event, false);
    },
    [finishPointerInteraction, onPointerUp],
  );

  const handlePointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerCancel?.(event);
      finishPointerInteraction(event, true);
    },
    [finishPointerInteraction, onPointerCancel],
  );

  const handleFocus = React.useCallback(() => {
    preEditValueRef.current = value;
    preEditDisplayValueRef.current = displayValue;
    setIsEditing(true);
    onFocusChange?.(true);
  }, [displayValue, onFocusChange, value]);

  const handleBlur = React.useCallback(() => {
    onFocusChange?.(false);
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
      const parsedValue = Number(text);
      if (Number.isFinite(parsedValue) && Math.abs(parsedValue - value) >= 1e-10) {
        onInputCommit?.(parsedValue);
      }
    }
    setHasUserEdit(false);
  }, [displayValue, hasUserEdit, onFocusChange, onInputCommit, text, value]);

  const handleInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextText = event.target.value;
      setText(nextText);
      setHasUserEdit(true);
      onInputChange?.(nextText);
    },
    [onInputChange],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.blur();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        revertingRef.current = true;
        setText(preEditDisplayValueRef.current);
        setHasUserEdit(false);
        onInputCommit?.(preEditValueRef.current);
        event.currentTarget.blur();
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === 'ArrowUp' ? step : -step;
      const nextValue = clamp(snapToStep(value + delta, step, min), min, max);
      setText(String(nextValue));
      setHasUserEdit(false);
      onInputCommit?.(nextValue);
    },
    [disabled, max, min, onInputCommit, step, value],
  );

  return (
    <div
      {...rootProperties}
      data-slot={dataSlot}
      data-disabled={disabled ? true : undefined}
      className={cn(
        'group/slider-input relative flex items-center overflow-hidden focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring',
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        data-slot='slider-input-fill'
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 bg-primary transition-opacity',
          isEditing ? 'opacity-0' : isScrubbing ? 'opacity-60' : 'opacity-15 group-hover/slider-input:opacity-40',
        )}
        style={{ width: `${fillPercent}%` }}
      />

      {leadingContent ? (
        <span
          data-slot='slider-input-leading'
          className='pointer-events-none relative z-10 flex min-w-0 items-center gap-2'
        >
          {leadingContent}
        </span>
      ) : null}

      <span
        data-slot='slider-input-value'
        className='relative z-10 ml-auto grid h-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center'
      >
        {isEditing ? null : (
          <span
            data-slot='slider-input-display'
            className='pointer-events-none col-start-1 row-start-1 text-right tabular-nums transition-colors select-none'
          >
            {displayValue}
          </span>
        )}
        <input
          ref={inputRef}
          autoComplete='off'
          type='text'
          inputMode='decimal'
          aria-label={ariaLabel}
          value={inputValue}
          disabled={disabled}
          className={cn(
            'col-start-1 row-start-1 h-full min-w-0 bg-transparent text-right tabular-nums outline-none',
            isEditing ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          data-slot='slider-input-input'
          data-lpignore='true'
          data-form-type='other'
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        {trailingAdornment ? (
          <span data-slot='slider-input-adornment' className='col-start-2 row-start-1 shrink-0 select-none'>
            {trailingAdornment}
          </span>
        ) : null}
      </span>
    </div>
  );
};
