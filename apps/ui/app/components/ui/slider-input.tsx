import * as React from 'react';
import { clamp } from '#utils/number.utils.js';
import { cn } from '@taucad/ui/utils/cn';

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
  readonly editingValue?: string;
  /** Start of the scrub track and the arrow-key range. */
  readonly min: number;
  /** End of the scrub track and the arrow-key range. */
  readonly max: number;
  /** False when `min` only starts a scrub window: the field then announces no minimum, and Home moves the caret. */
  readonly hasMinimum?: boolean;
  /** False when `max` only ends a scrub window: the field then announces no maximum, and End moves the caret. */
  readonly hasMaximum?: boolean;
  readonly step: number;
  readonly stepBase?: number;
  readonly leadingContent?: React.ReactNode;
  readonly trailingAdornment?: React.ReactNode;
  readonly dataSlot?: string;
  readonly inputId?: string;
  readonly shouldAutoFocus?: boolean;
  readonly isReadOnly?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop
  readonly disabled?: boolean;
  readonly 'aria-label': string;
  readonly 'aria-describedby'?: string;
  /** The value as read aloud, with its unit when it has one. Defaults to `displayValue`. */
  readonly 'aria-valuetext'?: string;
  readonly onScrubChange?: (value: number) => void;
  readonly onScrubCommit?: (value: number) => void;
  readonly onScrubCancel?: () => void;
  readonly onInputChange?: (text: string) => void;
  readonly onInputCommit?: (value: number) => void;
  readonly onInputEnter?: () => void;
  readonly onInputEscape?: () => void;
  readonly onStep?: (direction: -1 | 1, modifiers: { shift: boolean }) => void;
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

const getDecimalCount = (value: number): number => {
  const [coefficient, exponentText] = String(value).toLowerCase().split('e');
  const fractionDigits = coefficient?.split('.')[1]?.length ?? 0;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  return Math.max(0, fractionDigits - exponent);
};

const roundValue = (value: number, decimalCount: number): number => {
  if (decimalCount > 15) {
    return Number(value.toPrecision(15));
  }
  const rounder = 10 ** decimalCount;
  return Math.round(value * rounder) / rounder;
};

/** The limit an unmodified Home or End sets; with a modifier the key keeps editing the text (Shift+End selects). */
const getKeyLimit = (
  event: React.KeyboardEvent,
  lowerLimit: number | undefined,
  upperLimit: number | undefined,
): number | undefined => {
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }
  if (event.key === 'Home') {
    return lowerLimit;
  }
  return event.key === 'End' ? upperLimit : undefined;
};

export const snapToStep = (value: number, step: number, min = 0): number => {
  if (step <= 0) {
    return value;
  }
  const decimalCount = Math.max(getDecimalCount(step), getDecimalCount(min));
  const snapped = Math.round((value - min) / step) * step + min;
  return roundValue(snapped, decimalCount);
};

/**
 * The shared Blender-style numeric field: drag it to scrub the value, or click or Tab into it to type one.
 *
 * Its text field implements the WAI-ARIA APG spin button pattern (https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/):
 * `role="spinbutton"` with `aria-valuenow`, `aria-valuetext`, and `aria-valuemin`/`aria-valuemax` for each end of
 * `min`–`max` that is a real limit (`hasMinimum`, `hasMaximum`).
 *
 * Keyboard contract while the field has focus. Keys it handles do not reach ancestors.
 * - ArrowUp/ArrowDown: step by `step` within `min`–`max` and commit, or call `onStep` when given.
 * - Home/End: set the minimum/maximum and commit, only without modifiers and only when that end is a real limit.
 *   Otherwise they edit the text as usual, so Shift+End still selects to the end.
 * - Enter: commit the typed value and leave the field.
 * - Escape: restore the value from before editing and leave the field.
 * - Other keys edit the text.
 */
export const SliderInput = ({
  value,
  displayValue = String(value),
  editingValue,
  min,
  max,
  hasMinimum = true,
  hasMaximum = true,
  step,
  stepBase = min,
  leadingContent,
  trailingAdornment,
  dataSlot = 'slider-input',
  inputId,
  shouldAutoFocus,
  isReadOnly,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-valuetext': ariaValueText = displayValue,
  onScrubChange,
  onScrubCommit,
  onScrubCancel,
  onInputChange,
  onInputCommit,
  onInputEnter,
  onInputEscape,
  onStep,
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
  const visibleValue = editingValue ?? displayValue;
  const inputValue = isEditing ? (editingValue ?? (hasUserEdit ? text : displayValue)) : visibleValue;

  const range = max - min;
  const fillPercent = range > 0 ? clamp(((value - min) / range) * 100, 0, 100) : 0;
  const lowerLimit = hasMinimum ? min : undefined;
  const upperLimit = hasMaximum ? max : undefined;

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerDown?.(event);
      if (disabled === true || isReadOnly === true || isEditing || event.button !== 0 || event.defaultPrevented) {
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
    [disabled, isEditing, isReadOnly, onPointerDown, value],
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
      const nextValue = clamp(snapToStep(rawValue, step, stepBase), min, max);
      // Moves within one snapped step, or past a clamp, report the same value; consumers would redo their work.
      if (nextValue === lastScrubValueRef.current) {
        return;
      }
      lastScrubValueRef.current = nextValue;
      onScrubChange?.(nextValue);
    },
    [max, min, onPointerMove, onScrubChange, range, step, stepBase],
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
        if (isCancelled) {
          onScrubCancel?.();
        } else {
          onScrubCommit?.(lastScrubValueRef.current);
        }
        return;
      }

      if (!isCancelled) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    },
    [onScrubCancel, onScrubCommit],
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
    if (hasUserEdit && onInputEnter === undefined) {
      const parsedValue = Number(text);
      if (Number.isFinite(parsedValue) && Math.abs(parsedValue - value) >= 1e-10) {
        onInputCommit?.(parsedValue);
      }
    }
    setHasUserEdit(false);
  }, [displayValue, hasUserEdit, onFocusChange, onInputCommit, onInputEnter, text, value]);

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
      if (disabled === true || isReadOnly === true) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        onInputEnter?.();
        event.currentTarget.blur();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        revertingRef.current = true;
        setText(preEditDisplayValueRef.current);
        setHasUserEdit(false);
        if (onInputEscape) {
          onInputEscape();
        } else {
          onInputCommit?.(preEditValueRef.current);
        }
        event.currentTarget.blur();
        return;
      }
      const limit = getKeyLimit(event, lowerLimit, upperLimit);
      if (limit !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        setText(String(limit));
        setHasUserEdit(false);
        onInputCommit?.(limit);
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (onStep) {
        onStep(event.key === 'ArrowUp' ? 1 : -1, { shift: event.shiftKey });
        return;
      }
      const delta = event.key === 'ArrowUp' ? step : -step;
      const nextValue = clamp(snapToStep(value + delta, step, stepBase), min, max);
      setText(String(nextValue));
      setHasUserEdit(false);
      onInputCommit?.(nextValue);
    },
    [
      disabled,
      isReadOnly,
      lowerLimit,
      max,
      min,
      onInputCommit,
      onInputEnter,
      onInputEscape,
      onStep,
      step,
      stepBase,
      upperLimit,
      value,
    ],
  );

  return (
    <div
      {...rootProperties}
      data-slot={dataSlot}
      data-disabled={disabled ? true : undefined}
      className={cn(
        'group/slider-input relative flex items-center overflow-hidden',
        className,
        'ring-1 ring-border/50 ring-inset focus-within:focus-outline',
        disabled !== true && isReadOnly !== true && 'cursor-col-resize hover:ring-border',
        isReadOnly === true && disabled !== true && 'cursor-default',
        disabled === true && 'cursor-not-allowed',
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
            {visibleValue}
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          autoFocus={shouldAutoFocus}
          autoComplete='off'
          type='text'
          role='spinbutton'
          inputMode='decimal'
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-valuenow={value}
          aria-valuemin={lowerLimit}
          aria-valuemax={upperLimit}
          aria-valuetext={ariaValueText}
          value={inputValue}
          disabled={disabled}
          readOnly={isReadOnly}
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
          <span
            data-slot='slider-input-adornment'
            className='col-start-2 row-start-1 flex h-full shrink-0 items-center justify-center select-none'
          >
            {trailingAdornment}
          </span>
        ) : null}
      </span>
    </div>
  );
};
