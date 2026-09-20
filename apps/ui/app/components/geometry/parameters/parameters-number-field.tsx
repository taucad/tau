import * as React from 'react';
import { SliderInput } from '#components/ui/slider-input.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';

type ParametersNumberFieldProperties = {
  readonly value: number;
  readonly formattedValue?: string;
  readonly editingValue?: string;
  readonly isApproximation?: boolean;
  readonly diagnostic?: string;
  readonly unit?: string;
  readonly rangeMin: number;
  readonly rangeMax: number;
  readonly step: number;
  readonly id?: string;
  readonly shouldAutoFocus?: boolean;
  readonly isReadOnly?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop
  readonly disabled?: boolean;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly onSliderChange: (value: number) => void;
  readonly onSliderRelease: (value: number) => void;
  readonly onSliderCancel?: () => void;
  readonly onValueChange: (value: number) => void;
  readonly onTextChange: (text: string) => void;
  readonly onEnter?: () => void;
  readonly onEscape?: () => void;
  readonly onFocusChange: (isFocused: boolean) => void;
};

const UnitIndicator = ({
  unit,
  isApproximation,
}: {
  readonly unit: string;
  readonly isApproximation: boolean;
}): React.ReactNode => {
  if (!unit) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={isApproximation ? 'Rounded to 4 significant figures' : undefined}
          aria-hidden={isApproximation ? undefined : true}
          className={cn(
            'flex h-[var(--param-field-h,1.5rem)] w-6 items-center justify-center text-[11px] text-muted-foreground/60 select-none',
            !isApproximation && 'pointer-events-none',
          )}
        >
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
        </span>
      </TooltipTrigger>
      {isApproximation ? <TooltipContent>Rounded to 4 significant figures</TooltipContent> : null}
    </Tooltip>
  );
};

export const ParametersNumberField = ({
  value,
  formattedValue,
  editingValue,
  isApproximation = false,
  diagnostic,
  unit,
  rangeMin,
  rangeMax,
  step,
  id,
  shouldAutoFocus,
  isReadOnly,
  disabled,
  className,
  'aria-label': ariaLabel,
  onSliderChange,
  onSliderRelease,
  onSliderCancel,
  onValueChange,
  onTextChange,
  onEnter,
  onEscape,
  onFocusChange,
}: ParametersNumberFieldProperties): React.JSX.Element => {
  const descriptionId = React.useId();
  const trailingAdornment = unit ? <UnitIndicator unit={unit} isApproximation={isApproximation} /> : undefined;

  return (
    <>
      <SliderInput
        value={value}
        displayValue={formattedValue}
        editingValue={editingValue}
        min={rangeMin}
        max={rangeMax}
        step={step}
        stepBase={0}
        inputId={id}
        shouldAutoFocus={shouldAutoFocus}
        isReadOnly={isReadOnly}
        trailingAdornment={trailingAdornment}
        disabled={disabled}
        className={cn(
          'h-[var(--param-field-h,1.5rem)] w-full rounded-[var(--param-field-radius,var(--radius-md))] border border-transparent bg-muted text-right text-[var(--param-field-color,var(--color-muted-foreground))] text-sm',
          'transition-colors hover:text-[var(--param-field-color-focus,var(--color-foreground))] focus-within:bg-background focus-within:text-[var(--param-field-color-focus,var(--color-foreground))]',
          trailingAdornment ? 'pl-2' : 'px-2',
          disabled && 'opacity-50',
          className,
        )}
        aria-label={ariaLabel ?? 'Parameter value'}
        aria-describedby={diagnostic ? descriptionId : undefined}
        onScrubChange={onSliderChange}
        onScrubCommit={onSliderRelease}
        onScrubCancel={onSliderCancel}
        onInputCommit={onValueChange}
        onInputChange={onTextChange}
        onInputEnter={onEnter}
        onInputEscape={onEscape}
        onFocusChange={onFocusChange}
      />
      {diagnostic ? (
        <span id={descriptionId} className='text-xs text-muted-foreground'>
          {diagnostic}
        </span>
      ) : null}
    </>
  );
};
