import * as React from 'react';
import { Hash } from 'lucide-react';
import { Angle } from '#components/icons/angle.js';
import { SliderInput } from '#components/ui/slider-input.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import type { MeasurementDescriptor } from '#constants/project-parameters.js';

type ParametersNumberFieldProperties = {
  readonly value: number;
  readonly formattedValue?: string;
  readonly isApproximation?: boolean;
  readonly unit?: string;
  readonly descriptor: MeasurementDescriptor;
  readonly rangeMin: number;
  readonly rangeMax: number;
  readonly step: number;
  readonly id?: string;
  readonly autoFocus?: boolean;
  readonly readOnly?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop
  readonly disabled?: boolean;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly onSliderChange: (value: number) => void;
  readonly onSliderRelease: (value: number) => void;
  readonly onValueChange: (value: number) => void;
  readonly onTextChange: (text: string) => void;
  readonly onFocusChange: (isFocused: boolean) => void;
};

const UnitIndicator = ({
  descriptor,
  unit,
  isApproximation,
}: {
  readonly descriptor: MeasurementDescriptor;
  readonly unit: string;
  readonly isApproximation: boolean;
}): React.ReactNode => {
  if (!unit) {
    return null;
  }

  const isAngle = descriptor === 'angle';
  const isUnitless = descriptor === 'unitless';

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
};

const CountIndicator = (): React.JSX.Element => (
  <span
    aria-hidden='true'
    className='pointer-events-none flex h-[var(--param-field-h,1.5rem)] w-6 items-center justify-center text-[11px] text-muted-foreground/60 select-none'
  >
    <span className='font-mono text-xs'>&times;</span>
  </span>
);

export const ParametersNumberField = ({
  value,
  formattedValue,
  isApproximation = false,
  unit = 'mm',
  descriptor,
  rangeMin,
  rangeMax,
  step,
  id,
  autoFocus,
  readOnly,
  disabled,
  className,
  'aria-label': ariaLabel,
  onSliderChange,
  onSliderRelease,
  onValueChange,
  onTextChange,
  onFocusChange,
}: ParametersNumberFieldProperties): React.JSX.Element => {
  const trailingAdornment =
    descriptor === 'count' ? (
      <CountIndicator />
    ) : (
      <UnitIndicator descriptor={descriptor} unit={unit} isApproximation={isApproximation} />
    );

  return (
    <SliderInput
      value={value}
      displayValue={formattedValue}
      min={rangeMin}
      max={rangeMax}
      step={step}
      inputId={id}
      shouldAutoFocus={autoFocus}
      isReadOnly={readOnly}
      trailingAdornment={trailingAdornment}
      disabled={disabled}
      className={cn(
        'h-[var(--param-field-h,1.5rem)] w-full rounded-[var(--param-field-radius,var(--radius-md))] border border-transparent bg-muted px-2 text-right text-[var(--param-field-color,var(--color-muted-foreground))] text-sm',
        'transition-colors hover:text-[var(--param-field-color-focus,var(--color-foreground))] focus-within:bg-background focus-within:text-[var(--param-field-color-focus,var(--color-foreground))]',
        disabled && 'opacity-50',
        className,
      )}
      aria-label={ariaLabel ?? 'Parameter value'}
      onScrubChange={onSliderChange}
      onScrubCommit={onSliderRelease}
      onInputCommit={onValueChange}
      onInputChange={onTextChange}
      onFocusChange={onFocusChange}
    />
  );
};
