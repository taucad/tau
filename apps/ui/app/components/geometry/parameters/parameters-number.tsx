import * as React from 'react';
import { useSelector } from '@xstate/react';
import type { ParameterInputAcknowledged, ParameterInputBinding } from '@taucad/parameters/input-machine';
import { validateParameterInputValue } from '@taucad/parameters/input-machine';
import type { ParameterFieldProjection } from '@taucad/parameters';
import { convert, createQuantity } from '@taucad/units/quantity';
import { formatQuantity, parseInput } from '@taucad/units/input';
import { ParametersNumberField } from '#components/geometry/parameters/parameters-number-field.js';
import type { ParameterCommit } from '#components/geometry/parameters/rjsf-context.js';

const defaultRangeForZero = 100;

const automaticStep = (value: number): number =>
  value === 0 ? 0.01 : Math.min(1, Math.max(10 ** Math.floor(Math.log10(Math.abs(value))), 1e-6));

const automaticExtent = (value: number): number => {
  if (value === 0) {
    return defaultRangeForZero;
  }
  const magnitude = Math.abs(value);
  return magnitude > Number.MAX_VALUE / 2 ? Number.MAX_VALUE : magnitude * 2;
};

const displayValue = (value: number, binding: ParameterInputBinding, displayUnit?: string): number => {
  if (!binding.nativeUnit || !displayUnit || binding.nativeUnit === displayUnit) {
    return value;
  }
  const quantity = createQuantity({
    value,
    representation: 'binary64',
    unit: binding.nativeUnit,
    space: binding.space ?? 'linear',
    ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
    ...(binding.space !== 'point' || binding.reference === undefined ? {} : { reference: binding.reference }),
  });
  const converted = quantity.status === 'success' ? convert({ quantity: quantity.value, to: displayUnit }) : quantity;
  return converted.status === 'success' && typeof converted.value.value === 'number' ? converted.value.value : value;
};

const displayStep = (value: number, binding: ParameterInputBinding, displayUnit?: string): number =>
  displayValue(
    value,
    binding.space === 'point'
      ? { ...binding, quantityKind: undefined, reference: undefined, space: 'difference' }
      : binding,
    displayUnit,
  );

const numericProjection = (projection: ParameterInputAcknowledged['projection']): string | undefined =>
  projection.status === 'success' ? projection.value.parts.map(({ value }) => value).join('') : undefined;

const formatDisplayValue = (value: number, binding: ParameterInputBinding, displayUnit?: string): string => {
  const quantity = createQuantity({
    value,
    representation: 'binary64',
    unit: displayUnit ?? binding.nativeUnit ?? '1',
    space: binding.space ?? 'linear',
    ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
    ...(binding.space !== 'point' || binding.reference === undefined ? {} : { reference: binding.reference }),
  });
  const formatted =
    quantity.status === 'success'
      ? formatQuantity({ quantity: quantity.value, locale: globalThis.navigator.language })
      : quantity;
  return formatted.status === 'success' ? formatted.value.parts.map(({ value: part }) => part).join('') : String(value);
};

type ParametersNumberProps = {
  readonly value: number;
  readonly defaultValue: number;
  readonly fieldProjection: ParameterFieldProjection;
  readonly edit: Readonly<{ kind: 'transient' }> | Readonly<{ kind: 'authoritative'; commit: ParameterCommit }>;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly id?: string;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- Mirrors the native input prop.
  readonly autoFocus?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- Mirrors the native input prop.
  readonly readOnly?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- Mirrors the native input prop.
  readonly disabled?: boolean;
  readonly enableContinualOnChange?: boolean;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
};

type AuthoritativeParametersNumberProps = Omit<ParametersNumberProps, 'edit'> & {
  readonly edit: Readonly<{ kind: 'authoritative'; commit: ParameterCommit }>;
};

const inputBinding = (properties: Pick<ParametersNumberProps, 'fieldProjection' | 'id'>): ParameterInputBinding => {
  const { fieldProjection, id } = properties;
  return {
    target: { authority: 'ui-local-input', root: '/', entry: fieldProjection.parameterId ?? id ?? 'value' },
    group: 'local',
    parameterId: fieldProjection.parameterId ?? id ?? 'value',
    resource: fieldProjection.schema?.resource ?? 'urn:taucad:ui:local-parameter',
    pointer: fieldProjection.instancePointer,
    ...(fieldProjection.nativeUnit === undefined ? {} : { nativeUnit: fieldProjection.nativeUnit }),
    representation: fieldProjection.representation ?? 'binary64',
    constraints: fieldProjection.constraints ?? {},
    ...(fieldProjection.quantityKind === undefined ? {} : { quantityKind: fieldProjection.quantityKind }),
    ...(fieldProjection.space === undefined ? {} : { space: fieldProjection.space }),
    ...(fieldProjection.reference === undefined ? {} : { reference: fieldProjection.reference }),
  };
};

const StandaloneParametersNumber = ({
  value,
  defaultValue,
  fieldProjection,
  onChange,
  min,
  max,
  step,
  id,
  autoFocus,
  readOnly,
  disabled,
  className,
  'aria-label': ariaLabel,
  onFocus,
  onBlur,
}: Omit<ParametersNumberProps, 'edit'>): React.JSX.Element => {
  const binding = React.useMemo(() => inputBinding({ fieldProjection, id }), [fieldProjection, id]);
  const { displayUnit } = fieldProjection;
  const toNative = (next: number): number => {
    if (displayUnit === undefined || binding.nativeUnit === undefined || displayUnit === binding.nativeUnit) {
      return next;
    }
    return displayValue(next, { ...binding, nativeUnit: displayUnit }, binding.nativeUnit);
  };
  const [draftValue, setDraftValue] = React.useState(() => displayValue(value, binding, displayUnit));
  const [rawText, setRawText] = React.useState('');
  const [inputDiagnostic, setInputDiagnostic] = React.useState<string>();
  const lastCommittedNativeRef = React.useRef(value);
  React.useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- External authority changes replace the acknowledged field value.
    setDraftValue(displayValue(value, binding, displayUnit));
    lastCommittedNativeRef.current = value;
  }, [binding, displayUnit, value]);
  const displayDefault = displayValue(defaultValue, binding, displayUnit);
  const rangeMin =
    min === undefined
      ? displayDefault > 0
        ? 0
        : -automaticExtent(displayDefault)
      : displayValue(min, binding, displayUnit);
  const rangeMax =
    max === undefined
      ? displayDefault < 0
        ? 0
        : automaticExtent(displayDefault)
      : displayValue(max, binding, displayUnit);
  const currentStep =
    step === undefined ? automaticStep(displayDefault) : Math.abs(displayStep(step, binding, displayUnit));
  const commit = (next: number): void => {
    const native = toNative(next);
    const diagnostic = validateParameterInputValue(binding, native);
    if (diagnostic !== undefined) {
      setDraftValue(displayValue(value, binding, displayUnit));
      setInputDiagnostic(diagnostic.message);
      return;
    }
    setInputDiagnostic(undefined);
    setRawText('');
    setDraftValue(next);
    if (!Object.is(native, lastCommittedNativeRef.current)) {
      lastCommittedNativeRef.current = native;
      onChange(native);
    }
  };
  const commitText = (): void => {
    const parsed = parseInput({
      text: rawText,
      locale: globalThis.navigator.language,
      inputUnit: displayUnit ?? '1',
      expectedUnit: binding.nativeUnit ?? '1',
      ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
      space: binding.space ?? 'linear',
      ...(binding.reference === undefined ? {} : { reference: binding.reference }),
    });
    if (parsed.status !== 'success') {
      setInputDiagnostic(parsed.diagnostic.message);
      return;
    }
    const native = convert({ quantity: parsed.value.quantity, to: binding.nativeUnit ?? '1' });
    if (native.status === 'success' && typeof native.value.value === 'number') {
      const diagnostic = validateParameterInputValue(binding, native.value.value);
      if (diagnostic !== undefined) {
        setInputDiagnostic(diagnostic.message);
        return;
      }
      setInputDiagnostic(undefined);
      setRawText('');
      setDraftValue(displayValue(native.value.value, binding, displayUnit));
      if (
        !Object.is(native.value.value, value) &&
        Math.abs(native.value.value - value) >
          Number.EPSILON * Math.max(1, Math.abs(native.value.value), Math.abs(value)) * 8
      ) {
        onChange(native.value.value);
      }
    }
  };
  const roundedDisplayValue = Number(draftValue.toPrecision(4));
  const isApproximation =
    binding.nativeUnit !== undefined &&
    displayUnit !== undefined &&
    binding.nativeUnit !== displayUnit &&
    Math.abs(roundedDisplayValue - draftValue) > Number.EPSILON * Math.max(1, Math.abs(draftValue)) * 8;
  const formattedValue = formatDisplayValue(
    isApproximation ? roundedDisplayValue : Number(draftValue.toPrecision(12)),
    binding,
    displayUnit,
  );
  return (
    <ParametersNumberField
      value={draftValue}
      formattedValue={formattedValue}
      editingValue={rawText || undefined}
      unit={fieldProjection.adornment}
      isApproximation={isApproximation}
      diagnostic={fieldProjection.diagnostic?.message ?? inputDiagnostic}
      rangeMin={rangeMin}
      rangeMax={rangeMax}
      step={currentStep}
      id={id}
      shouldAutoFocus={autoFocus}
      isReadOnly={readOnly}
      disabled={disabled === true || fieldProjection.status === 'unsupported'}
      className={className}
      aria-label={ariaLabel}
      onSliderChange={setDraftValue}
      onSliderRelease={commit}
      onSliderCancel={() => {
        setDraftValue(displayValue(value, binding, displayUnit));
        setRawText('');
        setInputDiagnostic(undefined);
      }}
      onValueChange={commit}
      onTextChange={setRawText}
      onEnter={commitText}
      onEscape={() => {
        setDraftValue(displayValue(value, binding, displayUnit));
        setRawText('');
        setInputDiagnostic(undefined);
      }}
      onFocusChange={(isFocused) => {
        if (isFocused) {
          onFocus?.();
        } else {
          onBlur?.();
        }
      }}
    />
  );
};

const AuthoritativeParametersNumber = ({
  value,
  defaultValue,
  fieldProjection,
  edit,
  min,
  max,
  step,
  id,
  autoFocus,
  readOnly,
  disabled,
  enableContinualOnChange = false,
  className,
  'aria-label': ariaLabel,
  onFocus,
  onBlur,
}: AuthoritativeParametersNumberProps): React.JSX.Element => {
  const { commit: parameterCommit } = edit;
  const { editorInstance } = parameterCommit;
  const { nativeUnit, quantityKind } = fieldProjection;
  const binding = React.useMemo<ParameterInputBinding>(
    () => ({
      target: {
        authority: parameterCommit.target.authority,
        root: parameterCommit.target.root,
        ...(parameterCommit.target.checkout === undefined ? {} : { checkout: parameterCommit.target.checkout }),
        entry: parameterCommit.target.entry,
      },
      group: parameterCommit.group,
      parameterId: fieldProjection.parameterId ?? id ?? editorInstance,
      resource: fieldProjection.schema?.resource ?? 'urn:taucad:ui:parameter',
      pointer: fieldProjection.instancePointer,
      ...(nativeUnit === undefined ? {} : { nativeUnit }),
      representation: fieldProjection.representation ?? 'binary64',
      constraints: fieldProjection.constraints ?? {},
      ...(quantityKind === undefined ? {} : { quantityKind }),
      ...(fieldProjection.space === undefined ? {} : { space: fieldProjection.space }),
      ...(fieldProjection.reference === undefined ? {} : { reference: fieldProjection.reference }),
    }),
    [editorInstance, fieldProjection, id, nativeUnit, parameterCommit.group, parameterCommit.target, quantityKind],
  );
  const authorityValue = typeof value === 'number' ? value : defaultValue;
  const { displayUnit } = fieldProjection;
  const displayDefault = displayValue(defaultValue, binding, displayUnit);
  const rangeMin =
    min === undefined
      ? displayDefault > 0
        ? 0
        : -automaticExtent(displayDefault)
      : displayValue(min, binding, displayUnit);
  const rangeMax =
    max === undefined
      ? displayDefault < 0
        ? 0
        : automaticExtent(displayDefault)
      : displayValue(max, binding, displayUnit);
  const currentStep =
    step === undefined ? automaticStep(displayDefault) : Math.abs(displayStep(step, binding, displayUnit));
  // The service owns the acknowledged value and revision; these are only the seed for a field whose
  // authority snapshot has not loaded yet.
  const retainedInput = parameterCommit.input({
    editorInstance: JSON.stringify([editorInstance, binding.pointer]),
    binding,
    acknowledgedValue: binding.representation === 'decimal' ? String(authorityValue) : authorityValue,
    display: {
      locale: globalThis.navigator.language,
      ...(displayUnit === undefined ? {} : { unit: displayUnit }),
      increment: currentStep,
    },
    pressure: enableContinualOnChange ? 'continual' : 'default',
  });
  const parameterRef = retainedInput.actor;
  React.useEffect(() => retainedInput.attach(), [retainedInput]);
  /* Select only what the row draws: every commit forwards the new revision to every row, and a
   * revision alone must not re-render rows whose value and text are unchanged. */
  const acknowledgedValue = useSelector(parameterRef, (state) => state.context.acknowledged.value);
  const acknowledgedText = useSelector(parameterRef, (state) =>
    numericProjection(state.context.acknowledged.projection),
  );
  const draft = useSelector(parameterRef, (state) => state.context.draft);
  const workflowDiagnostic = useSelector(
    parameterRef,
    (state) => state.context.draft?.diagnostic?.message ?? state.context.diagnostic?.message,
  );

  /* Only a binding change is React's to report, and only when it differs from what the actor holds:
   * value and revision refreshes are forwarded by the service from the authority actor, so this row
   * never re-sends a revision it does not own. */
  React.useEffect(() => {
    const { acknowledged } = parameterRef.getSnapshot().context;
    if (JSON.stringify(acknowledged.binding) === JSON.stringify(binding)) {
      return;
    }
    parameterRef.send({
      type: 'refreshAuthority',
      binding,
      value: acknowledged.value,
      revision: acknowledged.revision,
    });
  }, [binding, parameterRef]);

  React.useEffect(() => {
    parameterRef.send({
      type: 'changeDisplay',
      display: {
        locale: globalThis.navigator.language,
        ...(displayUnit === undefined ? {} : { unit: displayUnit }),
        increment: currentStep,
      },
    });
  }, [currentStep, displayUnit, parameterRef]);

  const committedDisplayValue =
    typeof acknowledgedValue === 'number' ? displayValue(acknowledgedValue, binding, displayUnit) : value;
  const localValue =
    typeof draft?.nativeValue === 'number'
      ? displayValue(draft.nativeValue, binding, displayUnit)
      : committedDisplayValue;
  const roundedDisplayValue = Number(committedDisplayValue.toPrecision(4));
  const isApproximation =
    binding.nativeUnit !== undefined &&
    displayUnit !== undefined &&
    binding.nativeUnit !== displayUnit &&
    Math.abs(roundedDisplayValue - committedDisplayValue) >
      Number.EPSILON * Math.max(1, Math.abs(committedDisplayValue)) * 8;
  const formattedValue = draft?.focused ? undefined : isApproximation ? String(roundedDisplayValue) : acknowledgedText;
  const isUnsupported = fieldProjection.status === 'unsupported';

  return (
    <ParametersNumberField
      value={localValue}
      formattedValue={formattedValue}
      editingValue={draft?.raw}
      unit={fieldProjection.adornment}
      isApproximation={isApproximation}
      diagnostic={fieldProjection.diagnostic?.message ?? workflowDiagnostic}
      rangeMin={rangeMin}
      rangeMax={rangeMax}
      step={currentStep}
      id={id}
      shouldAutoFocus={autoFocus}
      isReadOnly={readOnly}
      disabled={disabled === true || isUnsupported}
      className={className}
      aria-label={ariaLabel}
      onSliderChange={(nextValue) => {
        parameterRef.send({ type: 'pointerChanged', value: nextValue });
      }}
      onSliderRelease={() => {
        parameterRef.send({ type: 'pointerReleased' });
      }}
      onSliderCancel={() => {
        parameterRef.send({ type: 'pointerCancelled' });
      }}
      onValueChange={(nextValue) => {
        parameterRef.send({ type: 'changeRaw', text: String(nextValue) });
        parameterRef.send({ type: 'pressEnter' });
      }}
      onTextChange={(text) => {
        parameterRef.send({ type: 'changeRaw', text });
      }}
      onEnter={() => {
        parameterRef.send({ type: 'pressEnter' });
      }}
      onEscape={() => {
        parameterRef.send({ type: 'pressEscape' });
      }}
      onStep={(direction, modifiers) => {
        parameterRef.send({ type: 'step', direction, modifiers });
      }}
      onFocusChange={(isFocused) => {
        parameterRef.send({ type: isFocused ? 'focus' : 'blur' });
        if (isFocused) {
          onFocus?.();
        } else {
          onBlur?.();
        }
      }}
    />
  );
};

export function ParametersNumber(properties: ParametersNumberProps): React.JSX.Element {
  return properties.edit.kind === 'transient' ? (
    <StandaloneParametersNumber {...properties} />
  ) : (
    <AuthoritativeParametersNumber {...properties} edit={properties.edit} />
  );
}
