import * as React from 'react';
import type { ParameterFieldProjection } from '@taucad/parameters';
import { convert, createQuantity } from '@taucad/units/quantity';
import { formatQuantity, parseInput } from '@taucad/units/input';
import { ParametersNumberField } from '#components/geometry/parameters/parameters-number-field.js';
import { validateParameterInputValue } from '#components/geometry/parameters/parameter-field.js';
import type { ParameterFieldBinding } from '#components/geometry/parameters/parameter-field.js';
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

const displayValue = (value: number, binding: ParameterFieldBinding, displayUnit?: string): number => {
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

const displayStep = (value: number, binding: ParameterFieldBinding, displayUnit?: string): number =>
  displayValue(
    value,
    binding.space === 'point'
      ? { ...binding, quantityKind: undefined, reference: undefined, space: 'difference' }
      : binding,
    displayUnit,
  );

const formatDisplayValue = (value: number, binding: ParameterFieldBinding, displayUnit?: string): string => {
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

const fieldBinding = (fieldProjection: ParameterFieldProjection): ParameterFieldBinding => ({
  ...(fieldProjection.nativeUnit === undefined ? {} : { nativeUnit: fieldProjection.nativeUnit }),
  representation: fieldProjection.representation ?? 'binary64',
  constraints: fieldProjection.constraints ?? {},
  ...(fieldProjection.quantityKind === undefined ? {} : { quantityKind: fieldProjection.quantityKind }),
  ...(fieldProjection.space === undefined ? {} : { space: fieldProjection.space }),
  ...(fieldProjection.reference === undefined ? {} : { reference: fieldProjection.reference }),
});

/** The authority value this row last showed, which a commit proves it was still editing. */
type EditBase = Readonly<{ value: number; binding: ParameterFieldBinding }>;

export function ParametersNumber({
  value,
  defaultValue,
  fieldProjection,
  edit,
  onChange,
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
}: ParametersNumberProps): React.JSX.Element {
  const binding = React.useMemo(() => fieldBinding(fieldProjection), [fieldProjection]);
  const { displayUnit, instancePointer } = fieldProjection;
  const authorityValue = typeof value === 'number' ? value : defaultValue;
  const commit = edit.kind === 'authoritative' ? edit.commit : undefined;

  /* The draft is the only local state: `text` is exactly what was typed, `base` is the authority
   * value the edit started from. A retained draft is seeded back on mount so collapsing a group
   * never discards an in-progress edit. */
  const [draftText, setDraftText] = React.useState(() => commit?.draft(instancePointer)?.text ?? '');
  const [draftValue, setDraftValue] = React.useState(() => displayValue(authorityValue, binding, displayUnit));
  const [inputDiagnostic, setInputDiagnostic] = React.useState<string>();
  const [base, setBase] = React.useState<EditBase>(() => ({ value: authorityValue, binding }));

  const isDirty = draftText !== '';
  /* An authority value that arrived while this row was being edited: the draft is kept, and the row
   * says the field moved underneath it rather than silently overwriting either side. */
  const hasConflict = isDirty && !Object.is(authorityValue, base.value);

  React.useEffect(() => {
    if (draftText !== '') {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- An authority change replaces the shown value of a clean row.
    setDraftValue(displayValue(authorityValue, binding, displayUnit));
    // oxlint-disable-next-line react/set-state-in-effect -- A clean row always edits from the current value.
    setBase({ value: authorityValue, binding });
  }, [authorityValue, binding, displayUnit, draftText]);

  /* The blur handler runs inside the same event as Enter, whose state update has not landed yet, so
   * every writer of `draftText` mirrors it here; the ref is what keeps a committed draft from being
   * committed a second time. */
  const draftRef = React.useRef(draftText);
  const retainDraft = (text: string, valid: boolean): void => {
    draftRef.current = text;
    setDraftText(text);
    commit?.setDraft(instancePointer, text === '' ? undefined : { text, valid });
  };

  // Drafts can be discarded from outside the row (the unsaved-drafts dialog), so a mounted row
  // follows the retained draft rather than owning the only copy of it.
  React.useEffect(
    () =>
      commit?.subscribeDrafts(() => {
        if (commit.draft(instancePointer) === undefined) {
          draftRef.current = '';
          setDraftText('');
        }
      }),
    [commit, instancePointer],
  );

  /* One in-flight transient commit per animation frame per field: a drag keeps the newest value and
   * drops the frames in between, and the pointer release always sends the final one. */
  const frameRef = React.useRef<number>(undefined);
  const cancelFrame = (): void => {
    if (frameRef.current !== undefined) {
      globalThis.cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
  };
  React.useEffect(() => cancelFrame, []);

  const toNative = (next: number): number => {
    if (displayUnit === undefined || binding.nativeUnit === undefined || displayUnit === binding.nativeUnit) {
      return next;
    }
    return displayValue(next, { ...binding, nativeUnit: displayUnit }, binding.nativeUnit);
  };

  const send = (native: number, pressure: 'transient' | 'final'): void => {
    if (commit === undefined) {
      onChange(native);
      return;
    }
    // The sidecar write is what re-renders the model, so an authoritative row reports no value here.
    // It does report a refusal: a transient value is superseded by design, and so is a final one a
    // newer edit displaced before it was applied, but anything else the authority refused must not
    // look entered.
    const settle = async (): Promise<void> => {
      try {
        const outcome = await commit.commit({
          pointer: instancePointer,
          value: native,
          pressure,
          base: {
            pointer: instancePointer,
            value: base.value,
            binding: {
              representation: base.binding.representation,
              ...(base.binding.nativeUnit === undefined ? {} : { unit: base.binding.nativeUnit }),
              ...(base.binding.quantityKind === undefined ? {} : { quantityKind: base.binding.quantityKind }),
              ...(base.binding.space === undefined ? {} : { space: base.binding.space }),
              ...(base.binding.reference === undefined ? {} : { reference: base.binding.reference }),
            },
          },
        });
        if (
          pressure === 'final' &&
          outcome !== undefined &&
          outcome.status !== 'committed' &&
          outcome.status !== 'cancelled-before-apply'
        ) {
          setInputDiagnostic('message' in outcome ? outcome.message : 'The parameter could not be saved.');
        }
      } catch (error) {
        setInputDiagnostic(error instanceof Error ? error.message : 'The parameter could not be saved.');
      }
    };
    // async-iife: bootstrap -- an input handler cannot return the authority's settlement.
    void settle();
  };

  /** Enter a value from the slider or the stepper; text entry goes through {@link commitText}. */
  const commitValue = (next: number): void => {
    cancelFrame();
    const native = toNative(next);
    const diagnostic = validateParameterInputValue(binding, native);
    if (diagnostic !== undefined) {
      setDraftValue(displayValue(authorityValue, binding, displayUnit));
      setInputDiagnostic(diagnostic.message);
      return;
    }
    setInputDiagnostic(undefined);
    retainDraft('', true);
    setDraftValue(next);
    if (!Object.is(native, base.value)) {
      send(native, 'final');
      setBase({ value: native, binding });
    }
  };

  const commitText = (): void => {
    const parsed = parseInput({
      text: draftRef.current,
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
    if (native.status !== 'success' || typeof native.value.value !== 'number') {
      return;
    }
    const diagnostic = validateParameterInputValue(binding, native.value.value);
    if (diagnostic !== undefined) {
      setInputDiagnostic(diagnostic.message);
      return;
    }
    setInputDiagnostic(undefined);
    retainDraft('', true);
    setDraftValue(displayValue(native.value.value, binding, displayUnit));
    if (
      !Object.is(native.value.value, base.value) &&
      Math.abs(native.value.value - base.value) >
        Number.EPSILON * Math.max(1, Math.abs(native.value.value), Math.abs(base.value)) * 8
    ) {
      send(native.value.value, 'final');
      setBase({ value: native.value.value, binding });
    }
  };

  const revert = (): void => {
    cancelFrame();
    setDraftValue(displayValue(authorityValue, binding, displayUnit));
    setBase({ value: authorityValue, binding });
    retainDraft('', true);
    setInputDiagnostic(undefined);
  };

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

  const committedDisplayValue = displayValue(authorityValue, binding, displayUnit);
  // Rounding follows what the row shows, so a drag reports its own value rather than the last commit.
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
      editingValue={draftText || undefined}
      unit={fieldProjection.adornment}
      isApproximation={isApproximation}
      diagnostic={
        fieldProjection.diagnostic?.message ??
        inputDiagnostic ??
        (hasConflict
          ? `This field changed to ${formatDisplayValue(committedDisplayValue, binding, displayUnit)} elsewhere. Enter to overwrite it, Escape to keep it.`
          : undefined)
      }
      rangeMin={rangeMin}
      rangeMax={rangeMax}
      step={currentStep}
      id={id}
      shouldAutoFocus={autoFocus}
      isReadOnly={readOnly}
      disabled={disabled === true || fieldProjection.status === 'unsupported'}
      className={className}
      aria-label={ariaLabel}
      onSliderChange={(next) => {
        setDraftValue(next);
        if (!enableContinualOnChange || frameRef.current !== undefined) {
          return;
        }
        frameRef.current = globalThis.requestAnimationFrame(() => {
          frameRef.current = undefined;
          const native = toNative(next);
          if (validateParameterInputValue(binding, native) === undefined && !Object.is(native, base.value)) {
            send(native, 'transient');
          }
        });
      }}
      onSliderRelease={commitValue}
      onSliderCancel={revert}
      onValueChange={commitValue}
      onTextChange={(text) => {
        retainDraft(
          text,
          text === '' ||
            parseInput({
              text,
              locale: globalThis.navigator.language,
              inputUnit: displayUnit ?? '1',
              expectedUnit: binding.nativeUnit ?? '1',
              ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
              space: binding.space ?? 'linear',
              ...(binding.reference === undefined ? {} : { reference: binding.reference }),
            }).status === 'success',
        );
      }}
      onEnter={commitText}
      onEscape={revert}
      onFocusChange={(isFocused) => {
        if (isFocused) {
          onFocus?.();
        } else {
          onBlur?.();
          if (draftRef.current !== '') {
            commitText();
          }
        }
      }}
    />
  );
}
