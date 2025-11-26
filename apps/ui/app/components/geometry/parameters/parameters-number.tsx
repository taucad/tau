import * as React from 'react';
import { useSelector, useActorRef } from '@xstate/react';
import { Slider } from '#components/ui/slider.js';
import { ParametersInputNumber } from '#components/geometry/parameters/parameters-input-number.js';
import { parameterMachine } from '#machines/parameter.machine.js';
import type { MeasurementDescriptor } from '#constants/build-parameters.js';
import { cn } from '#utils/ui.utils.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';

type ParametersNumberProps = {
  readonly value: number;
  readonly defaultValue: number;
  readonly descriptor: MeasurementDescriptor;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  // eslint-disable-next-line react/boolean-prop-naming -- disabled is standard HTML/React prop
  readonly disabled?: boolean;
  /**
   * Whether to commit value changes continually on every slider movement.
   * When false (default), commits are deferred until slider release for better performance.
   * Text input always commits immediately regardless of this setting.
   */
  readonly enableContinualOnChange?: boolean;
  readonly className?: string;
  readonly units: Units;
};

export function ParametersNumber({
  value,
  defaultValue,
  descriptor,
  onChange,
  min,
  max,
  step,
  disabled,
  units,
  enableContinualOnChange = false,
  ...properties
}: ParametersNumberProps): React.JSX.Element {
  // Extract unit values from units prop
  const initialUnitFactor = units.length.factor;
  const initialSymbol = units.length.symbol;

  // Create ref for input element (for focus and arrow key listeners)
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Create parameter machine instance
  const parameterRef = useActorRef(parameterMachine, {
    input: {
      initialValue: value,
      defaultValue,
      descriptor,
      enableContinualOnChange,
      initialUnitFactor,
      initialSymbol,
      inputRef,
      min,
      max,
      step,
    },
  });

  // Subscribe to commit events and call onChange
  React.useEffect(() => {
    const subscription = parameterRef.on('valueCommit', (event) => {
      onChange(event.value);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [parameterRef, onChange]);

  // Notify machine of external value changes
  React.useEffect(() => {
    parameterRef.send({ type: 'externalValueChanged', value });
  }, [value, parameterRef]);

  // Send unit updates to parameter machine when units change
  React.useEffect(() => {
    parameterRef.send({
      type: 'unitChanged',
      unitFactor: units.length.factor,
      unit: units.length.symbol,
    });
  }, [units.length.factor, units.length.symbol, parameterRef]);

  // Send config updates to parameter machine when config props change
  React.useEffect(() => {
    parameterRef.send({
      type: 'configChanged',
      defaultValue,
      descriptor,
      min,
      max,
      step,
      enableContinualOnChange,
    });
  }, [defaultValue, descriptor, min, max, step, enableContinualOnChange, parameterRef]);

  // Derive all state from machines
  const localValue = useSelector(parameterRef, (state) => state.context.localValue);
  const formattedValue = useSelector(parameterRef, (state) => state.context.formattedValue);
  const isApproximation = useSelector(parameterRef, (state) => state.context.isApproximation);
  const rangeMin = useSelector(parameterRef, (state) => state.context.rangeMin);
  const rangeMax = useSelector(parameterRef, (state) => state.context.rangeMax);
  const baseStep = useSelector(parameterRef, (state) => state.context.baseStep);
  const currentStep = useSelector(parameterRef, (state) => state.context.step);

  // Only apply unit conversion for length measurements
  const isLength = descriptor === 'length';
  const unitFactor = isLength ? units.length.factor : 1;
  const displayUnit = isLength ? units.length.symbol : 'mm';

  return (
    <div className="flex w-full flex-row items-center gap-2">
      <Slider
        variant="inset"
        value={[localValue]}
        min={rangeMin}
        max={rangeMax}
        step={currentStep}
        disabled={disabled}
        className="[&_[data-slot=slider-track]]:h-7 md:[&_[data-slot=slider-track]]:h-4.5"
        onValueChange={([newValue]) => {
          // Send slider change event to machine (in display units)
          parameterRef.send({ type: 'sliderChanged', value: Number(newValue) });
        }}
        onValueCommit={([newValue]) => {
          // Send slider release event to machine (in display units)
          parameterRef.send({ type: 'sliderReleased', value: Number(newValue) });
        }}
      />
      <ParametersInputNumber
        ref={inputRef}
        value={localValue}
        formattedValue={formattedValue}
        isApproximation={isApproximation}
        unit={displayUnit}
        unitFactor={unitFactor}
        step={baseStep}
        descriptor={descriptor}
        disabled={disabled}
        onValueChange={(newValue) => {
          // Send input change event to machine (in display units)
          parameterRef.send({ type: 'inputChanged', value: newValue });
        }}
        onTextChange={(text) => {
          // Send text input event to machine for parsing and conversion
          parameterRef.send({ type: 'textInputChanged', text });
        }}
        {...properties}
        className={cn('h-7 w-24 bg-background', properties.className)}
      />
    </div>
  );
}
