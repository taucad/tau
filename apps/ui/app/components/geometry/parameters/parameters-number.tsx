import * as React from 'react';
import { useSelector, useActorRef } from '@xstate/react';
import { ParametersNumberField } from '#components/geometry/parameters/parameters-number-field.js';
import { parameterMachine } from '#machines/parameter.machine.js';
import type { MeasurementDescriptor } from '#constants/project-parameters.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';

type ParametersNumberProps = {
  readonly value: number;
  readonly defaultValue: number;
  readonly descriptor: MeasurementDescriptor;
  readonly unitOverride?: string;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly id?: string;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop
  readonly autoFocus?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop
  readonly readOnly?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
  readonly disabled?: boolean;
  /**
   * Whether to commit value changes continually on every slider movement.
   * When false (default), commits are deferred until slider release for better performance.
   * Text input always commits immediately regardless of this setting.
   */
  readonly enableContinualOnChange?: boolean;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly units: Units;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
};

export function ParametersNumber({
  value,
  defaultValue,
  descriptor,
  unitOverride,
  onChange,
  min,
  max,
  step,
  id,
  autoFocus,
  readOnly,
  disabled,
  units,
  enableContinualOnChange = false,
  className,
  'aria-label': ariaLabel,
  onFocus,
  onBlur,
}: ParametersNumberProps): React.JSX.Element {
  // Create parameter machine instance
  const parameterRef = useActorRef(parameterMachine, {
    input: {
      initialValue: value,
      defaultValue,
      descriptor,
      enableContinualOnChange,
      initialUnitFactor: units.length.factor,
      initialUnitSymbol: units.length.symbol,
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
      unitSymbol: units.length.symbol,
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
  const currentStep = useSelector(parameterRef, (state) => state.context.step);
  const displayUnit = useSelector(parameterRef, (state) => state.context.displayUnit);

  return (
    <ParametersNumberField
      value={localValue}
      formattedValue={formattedValue}
      isApproximation={isApproximation}
      unit={unitOverride ?? displayUnit}
      descriptor={descriptor}
      rangeMin={rangeMin}
      rangeMax={rangeMax}
      step={currentStep}
      id={id}
      autoFocus={autoFocus}
      readOnly={readOnly}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
      onSliderChange={(newValue) => {
        parameterRef.send({ type: 'sliderChanged', value: newValue });
      }}
      onSliderRelease={(newValue) => {
        parameterRef.send({ type: 'sliderReleased', value: newValue });
      }}
      onValueChange={(newValue) => {
        parameterRef.send({ type: 'inputChanged', value: newValue });
      }}
      onTextChange={(text) => {
        parameterRef.send({ type: 'textInputChanged', text });
      }}
      onFocusChange={(isFocused) => {
        parameterRef.send({ type: 'focusStateChanged', isFocused });
        if (isFocused) {
          onFocus?.();
        } else {
          onBlur?.();
        }
      }}
    />
  );
}
