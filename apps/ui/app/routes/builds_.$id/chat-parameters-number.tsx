import * as React from 'react';
import { useSelector, useActorRef } from '@xstate/react';
import { Slider } from '#components/ui/slider.js';
import { ChatParametersInputNumber } from '#routes/builds_.$id/chat-parameters-input-number.js';
import { useBuild } from '#hooks/use-build.js';
import { parameterMachine } from '#machines/parameter.machine.js';
import type { MeasurementDescriptor } from '#constants/build-parameters.js';
import { cn } from '#utils/ui.utils.js';

type ChatParametersNumberProps = {
  readonly value: number;
  readonly defaultValue: number;
  readonly descriptor: MeasurementDescriptor;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  // eslint-disable-next-line react/boolean-prop-naming -- disabled is standard HTML/React prop
  readonly disabled?: boolean;
  readonly enableCommitOnChange?: boolean;
  readonly className?: string;
};

export function ChatParametersNumber({
  value,
  defaultValue,
  descriptor,
  onChange,
  min,
  max,
  step,
  disabled,
  enableCommitOnChange = true,
  ...properties
}: ChatParametersNumberProps): React.JSX.Element {
  const { graphicsRef } = useBuild();

  // Get initial unit factor and unit string from graphics machine
  const initialGridUnitFactor = useSelector(graphicsRef, (state) => state.context.gridUnitFactor);
  const initialGridUnit = useSelector(graphicsRef, (state) => state.context.gridUnit);

  // Create ref for input element (for focus and arrow key listeners)
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Create parameter machine instance
  const parameterRef = useActorRef(parameterMachine, {
    input: {
      initialValue: value,
      defaultValue,
      descriptor,
      enableCommitOnChange,
      graphicsRef,
      initialUnitFactor: initialGridUnitFactor,
      initialUnit: initialGridUnit,
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
  // Unit changes are now handled internally by the machine via subscription
  React.useEffect(() => {
    parameterRef.send({ type: 'externalValueChanged', value });
  }, [value, parameterRef]);

  // Derive all state from machines
  const localValue = useSelector(parameterRef, (state) => state.context.localValue);
  const formattedValue = useSelector(parameterRef, (state) => state.context.formattedValue);
  const isApproximation = useSelector(parameterRef, (state) => state.context.isApproximation);
  const sliderMin = useSelector(parameterRef, (state) => state.context.sliderMin);
  const sliderMax = useSelector(parameterRef, (state) => state.context.sliderMax);
  const effectiveStep = useSelector(parameterRef, (state) => state.context.effectiveStep);

  const gridUnit = useSelector(graphicsRef, (state) => state.context.gridUnit);
  const gridUnitFactor = useSelector(graphicsRef, (state) => state.context.gridUnitFactor);

  // Only apply unit conversion for length measurements
  const isLength = descriptor === 'length';
  const unitFactor = isLength ? gridUnitFactor : 1;
  const displayUnit = isLength ? gridUnit : 'mm';

  return (
    <div className="flex w-full flex-row items-center gap-2">
      <Slider
        variant="inset"
        value={[localValue]}
        min={sliderMin}
        max={sliderMax}
        step={effectiveStep}
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
      <ChatParametersInputNumber
        ref={inputRef}
        value={localValue}
        formattedValue={formattedValue}
        isApproximation={isApproximation}
        unit={displayUnit}
        unitFactor={unitFactor}
        step={effectiveStep}
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
