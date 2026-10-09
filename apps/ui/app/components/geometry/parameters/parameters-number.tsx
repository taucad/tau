import * as React from 'react';
import type { ParameterFieldProjection } from '@taucad/parameters';
import { convert, createQuantity } from '@taucad/units/quantity';
import { formatQuantity, parseInput } from '@taucad/units/input';
import { createRafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';
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

/**
 * A number entered in a field's display unit, in its native unit.
 *
 * @param fieldProjection - The field the number was entered into.
 * @param value - The number as entered.
 * @returns The number in the field's native unit.
 */
export const toNativeValue = (fieldProjection: ParameterFieldProjection, value: number): number => {
  const binding = fieldBinding(fieldProjection);
  if (binding.representation === 'safe-integer') {
    return Math.round(value);
  }
  const { displayUnit } = fieldProjection;
  if (displayUnit === undefined || binding.nativeUnit === undefined || displayUnit === binding.nativeUnit) {
    return value;
  }
  return displayValue(value, { ...binding, nativeUnit: displayUnit }, binding.nativeUnit);
};

/**
 * A native value in a field's display unit.
 *
 * @param fieldProjection - The field that shows the value.
 * @param value - The value in the field's native unit.
 * @returns The value in the field's display unit.
 */
export const toDisplayValue = (fieldProjection: ParameterFieldProjection, value: number): number => {
  const binding = fieldBinding(fieldProjection);
  return binding.representation === 'safe-integer' ? value : displayValue(value, binding, fieldProjection.displayUnit);
};

/** The authority value this row last showed, which a commit proves it was still editing. */
type EditBase = Readonly<{ value: number; binding: ParameterFieldBinding; authorityValue: number }>;

/* Memoised: the section panel re-renders on every step of the field being dragged, and its other
 * rows pass stable props, so only the dragged row re-renders. */
export const ParametersNumber = React.memo(function ParametersNumber({
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
  const [retainedDraft, setRetainedDraft] = React.useState(() => commit?.draft(instancePointer));
  const [draftText, setDraftText] = React.useState(() =>
    retainedDraft?.final === undefined ? (retainedDraft?.text ?? '') : '',
  );
  const [localValue, setLocalValue] = React.useState<Readonly<{ value: number; authorityValue: number }>>();
  const [inputDiagnostic, setInputDiagnostic] = React.useState<string>();
  const [base, setBase] = React.useState<EditBase>(() => ({ value: authorityValue, binding, authorityValue }));
  /* Final edits this row submitted that have not settled. While any is in flight, an authority move
   * is most likely this row's own earlier edit landing, so the row keeps its own base and shown value:
   * the next step then builds on the newest submitted value instead of an intermediate one the
   * authority is about to replace. */
  const [pendingFinals, setPendingFinals] = React.useState(0);
  /* A local value answers the authority it was entered against; once the authority moves, a later
   * return to that same value (a reset after a transient edit) must not bring the old entry back. */
  const [enteredAgainst, setEnteredAgainst] = React.useState(authorityValue);
  if (!Object.is(enteredAgainst, authorityValue) && pendingFinals === 0) {
    setEnteredAgainst(authorityValue);
    setLocalValue(undefined);
  }

  const isDirty = draftText !== '';
  const currentBase: EditBase = { value: authorityValue, binding, authorityValue };
  const editBase = isDirty || pendingFinals > 0 || Object.is(base.authorityValue, authorityValue) ? base : currentBase;
  const draftValue =
    localValue !== undefined && (pendingFinals > 0 || Object.is(localValue.authorityValue, authorityValue))
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
  const currentSubmission = React.useRef<Record<string, unknown> | undefined>(undefined);
  React.useEffect(
    () => () => {
      currentSubmission.current = undefined;
    },
    [],
  );
  const retainDraft = (text: string, valid: boolean): void => {
    currentSubmission.current = undefined;
    draftRef.current = text;
    setDraftText(text);
    const draft = text === '' ? undefined : { text, valid };
    setRetainedDraft(draft);
    setInputDiagnostic(undefined);
    commit?.setDraft(instancePointer, draft);
  };

  // Final settlement and external discard belong to the service, including while this row unmounts.
  React.useEffect(
    () =>
      commit?.subscribeDrafts(() => {
        const draft = commit.draft(instancePointer);
        setRetainedDraft(draft);
        if (draft === undefined || draft.final?.status === 'refused') {
          draftRef.current = '';
          setDraftText('');
        }
        if (draft?.final?.status === 'refused') {
          setLocalValue(undefined);
          setBase(authorityRef.current);
        }
      }),
    [commit, instancePointer],
  );

  /* A continual row previews a drag through `onChange`, which can arrive faster than frames: at most one
   * value per animation frame is sent, the latest. The row shows each value at once. Release sends a value
   * still waiting before its own, which it skips when the drag ends where it started; cancel and unmount
   * drop a waiting value, so nothing lands after the final one. */
  const [continualChange] = React.useState(() =>
    createRafCoalescer<() => void>((send) => {
      send();
    }),
  );
  React.useEffect(
    () => () => {
      continualChange.cancel();
    },
    [continualChange],
  );

  const toNative = (next: number): number => toNativeValue(fieldProjection, next);

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
    const submission = {};
    currentSubmission.current = submission;
    const isFinal = pressure === 'final';
    const submittedText =
      retainedText ?? formatDisplayValue(displayValue(native, binding, displayUnit), binding, displayUnit);
    if (isFinal) {
      setPendingFinals((count) => count + 1);
      globalThis.performance.mark('tau:parameter-edit', { detail: { pointer: instancePointer } });
    }
    const settle = async (): Promise<boolean> => {
      try {
        const outcome = await commit.commit({
          pointer: instancePointer,
          value: native,
          ...(isFinal
            ? {
                pressure: 'final',
                draft: {
                  text: submittedText,
                  valid: true,
                },
              }
            : { pressure: 'transient' }),
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
        if (isFinal && (outcome?.status === 'committed' || outcome?.status === 'cancelled-before-apply')) {
          return true;
        }
      } catch (error) {
        // Admission may fail before the service can create a pending draft. Only the current mounted
        // gesture may show that local refusal; admitted settlement remains owned by the service.
        if (currentSubmission.current === submission && commit.draft(instancePointer)?.final === undefined) {
          if (isFinal) {
            draftRef.current = submittedText;
            setDraftText(submittedText);
          }
          setInputDiagnostic(
            error instanceof Error || error instanceof DOMException
              ? error.message
              : 'The parameter could not be saved.',
          );
        }
      } finally {
        if (isFinal) {
          setPendingFinals((count) => count - 1);
        }
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
    const recovery = commit?.draft(instancePointer);
    const retry = draftRef.current === '' && recovery?.final?.status === 'refused';
    const text = retry ? recovery.text : draftRef.current;
    const parsed = parseInput({
      text,
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
    const retainedText = text;
    const submittedBase = retry || hasConflict ? currentBase : editBase;
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
      unit={fieldProjection.adornment}
      isApproximation={isApproximation}
      diagnostic={
        fieldProjection.diagnostic?.message ??
        inputDiagnostic ??
        (retainedDraft?.final?.status === 'refused' ? retainedDraft.final.message : undefined) ??
        (hasConflict
          ? `This field changed to ${formatDisplayValue(committedDisplayValue, binding, displayUnit)} elsewhere. Enter to overwrite it, Escape to keep it.`
          : undefined)
      }
      rangeMin={rangeMin}
      rangeMax={rangeMax}
      // Without a declared bound, that end of the range is only a scrub window.
      hasMinimum={min !== undefined}
      hasMaximum={max !== undefined}
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
          continualChange.schedule(() => {
            onChange(native);
          });
        }
      }}
      onSliderRelease={(next) => {
        continualChange.flush();
        const final = commitValue(next);
        if (final === undefined) {
          void commit?.endScrub?.();
        } else {
          void commit?.endScrub?.(final);
        }
      }}
      onSliderCancel={() => {
        continualChange.cancel();
        void commit?.endScrub?.();
        revert();
      }}
      onValueChange={(next) => {
        void commitValue(next);
      }}
      onTextChange={(text) => {
        if (draftRef.current === '' && text !== '') {
          setBase(editBase);
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
});
