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
  readonly sourceUnit?: string;
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
type EditBase = Readonly<{ value: number; binding: ParameterFieldBinding; authorityValue: number }>;

export function ParametersNumber({
  value,
  defaultValue,
  fieldProjection,
  sourceUnit,
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
  const { instancePointer } = fieldProjection;
  const displayUnit = binding.representation === 'safe-integer' ? binding.nativeUnit : fieldProjection.displayUnit;
  const authorityValue = typeof value === 'number' ? value : defaultValue;
  const commit = edit.kind === 'authoritative' ? edit.commit : undefined;

  /* The draft is the only local state: `text` is exactly what was typed, `base` is the authority
   * value the edit started from. A retained draft is seeded back on mount so collapsing a group
   * never discards an in-progress edit. */
  const [draftText, setDraftText] = React.useState(() => commit?.draft(instancePointer)?.text ?? '');
  const [localValue, setLocalValue] = React.useState<Readonly<{ value: number; authorityValue: number }>>();
  const [inputDiagnostic, setInputDiagnostic] = React.useState<string>();
  const [base, setBase] = React.useState<EditBase>(() => ({ value: authorityValue, binding, authorityValue }));

  const isDirty = draftText !== '';
  const currentBase: EditBase = { value: authorityValue, binding, authorityValue };
  const editBase = isDirty || Object.is(base.authorityValue, authorityValue) ? base : currentBase;
  const draftValue =
    localValue !== undefined && Object.is(localValue.authorityValue, authorityValue)
      ? localValue.value
      : displayValue(authorityValue, binding, displayUnit);
  /* An authority value that arrived while this row was being edited: the draft is kept, and the row
   * says the field moved underneath it rather than silently overwriting either side. */
  const hasConflict = isDirty && !Object.is(authorityValue, base.value);
  const authorityRef = React.useRef(currentBase);
  React.useEffect(() => {
    authorityRef.current = { value: authorityValue, binding, authorityValue };
  }, [authorityValue, binding]);

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

  const toNative = (next: number): number => {
    if (displayUnit === undefined || binding.nativeUnit === undefined || displayUnit === binding.nativeUnit) {
      return binding.representation === 'safe-integer' ? Math.round(next) : next;
    }
    const value = displayValue(next, { ...binding, nativeUnit: displayUnit }, binding.nativeUnit);
    return binding.representation === 'safe-integer' ? Math.round(value) : value;
  };

  const send = (
    native: number,
    pressure: 'transient' | 'final',
    options: Readonly<{ base: EditBase; retainedText?: string }>,
  ): Promise<boolean> | undefined => {
    const { base: submittedBase, retainedText } = options;
    if (commit === undefined) {
      onChange(native);
      return undefined;
    }
    // The sidecar write is what re-renders the model, so an authoritative row reports no value here.
    // It does report a refusal: a transient value is superseded by design, and so is a final one a
    // newer edit displaced before it was applied, but anything else the authority refused must not
    // look entered.
    const settle = async (): Promise<boolean> => {
      try {
        const outcome = await commit.commit({
          pointer: instancePointer,
          value: native,
          pressure,
          base: {
            pointer: instancePointer,
            value: submittedBase.value,
            binding: {
              representation: submittedBase.binding.representation,
              ...(submittedBase.binding.nativeUnit === undefined ? {} : { unit: submittedBase.binding.nativeUnit }),
              ...(submittedBase.binding.quantityKind === undefined
                ? {}
                : { quantityKind: submittedBase.binding.quantityKind }),
              ...(submittedBase.binding.space === undefined ? {} : { space: submittedBase.binding.space }),
              ...(submittedBase.binding.reference === undefined ? {} : { reference: submittedBase.binding.reference }),
            },
          },
        });
        if (pressure === 'final' && outcome !== undefined) {
          if (outcome.status === 'committed' || outcome.status === 'cancelled-before-apply') {
            setLocalValue(undefined);
            return true;
          }
          const authority = authorityRef.current;
          setLocalValue(undefined);
          setBase(authority);
          if (retainedText !== undefined) {
            draftRef.current = '';
            setDraftText('');
            commit.setDraft(instancePointer, { text: retainedText, valid: true });
          }
          setInputDiagnostic('message' in outcome ? outcome.message : 'The parameter could not be saved.');
        }
      } catch (error) {
        setInputDiagnostic(error instanceof Error ? error.message : 'The parameter could not be saved.');
      }
      return false;
    };
    return settle();
  };

  /** Enter a value from the slider or the stepper; text entry goes through {@link commitText}. */
  const commitValue = (next: number): Promise<boolean> | undefined => {
    const native = toNative(next);
    const diagnostic = validateParameterInputValue(binding, native);
    if (diagnostic !== undefined) {
      setLocalValue(undefined);
      setInputDiagnostic(diagnostic.message);
      return undefined;
    }
    setInputDiagnostic(undefined);
    retainDraft('', true);
    setLocalValue({ value: displayValue(native, binding, displayUnit), authorityValue });
    if (!Object.is(native, editBase.value)) {
      const final = send(native, 'final', { base: editBase });
      setBase({ value: native, binding, authorityValue });
      return final;
    }
    return undefined;
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
    const retainedText = draftRef.current;
    const submittedBase = hasConflict ? currentBase : editBase;
    setInputDiagnostic(undefined);
    retainDraft('', true);
    setLocalValue({ value: displayValue(native.value.value, binding, displayUnit), authorityValue });
    if (
      !Object.is(native.value.value, submittedBase.value) &&
      Math.abs(native.value.value - submittedBase.value) >
        Number.EPSILON * Math.max(1, Math.abs(native.value.value), Math.abs(submittedBase.value)) * 8
    ) {
      void send(native.value.value, 'final', { base: submittedBase, retainedText });
      setBase({ value: native.value.value, binding, authorityValue });
    }
  };

  const revert = (): void => {
    setLocalValue(undefined);
    setBase(currentBase);
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
  const projectedStep =
    step === undefined ? automaticStep(displayDefault) : Math.abs(displayStep(step, binding, displayUnit));
  const currentStep =
    binding.representation === 'safe-integer' ? Math.max(1, Math.round(projectedStep)) : projectedStep;

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
      unit={binding.representation === 'safe-integer' ? binding.nativeUnit : fieldProjection.adornment}
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
        const native = toNative(next);
        setLocalValue({ value: displayValue(native, binding, displayUnit), authorityValue });
        if (validateParameterInputValue(binding, native) !== undefined) {
          return;
        }
        /* The scrub lane owns coalescing. A source-unit claim travels as the row's unit-bearing
         * display text; every other drag value remains a native number. */
        if (commit?.scrub !== undefined) {
          commit.scrub({
            pointer: instancePointer,
            value: sourceUnit === undefined ? native : `${String(Number(next.toPrecision(12)))} ${sourceUnit}`,
          });
        } else if (commit === undefined && enableContinualOnChange) {
          onChange(native);
        }
      }}
      onSliderRelease={(next) => {
        const final = commitValue(next);
        if (final === undefined) {
          void commit?.endScrub?.();
        } else {
          void commit?.endScrub?.(final);
        }
      }}
      onSliderCancel={() => {
        void commit?.endScrub?.();
        revert();
      }}
      onValueChange={(next) => {
        void commitValue(next);
      }}
      onTextChange={(text) => {
        if (draftRef.current === '' && text !== '') {
          setBase(currentBase);
        }
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
