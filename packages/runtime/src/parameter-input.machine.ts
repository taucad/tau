import { formatQuantity, parseInput } from '@taucad/units/input';
import type { FormattedQuantity } from '@taucad/units/input';
import { convert, createQuantity } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import type { UnitDiagnostic, UnitResult } from '@taucad/units/unit';
import { assign, enqueueActions, setup } from 'xstate';
import type { ParameterBinding } from '#parameter/manifest.js';
import type {
  ParameterSetIdentity,
  ParameterSetOutcome,
  ParameterSetRequest,
  ParameterSetTarget,
} from '#parameter-set.machine.js';

/** Serializable identity and native semantics for one editable parameter. @public */
export type ParameterInputBinding = Readonly<{
  target: ParameterSetTarget;
  group: string;
  parameterId: string;
  resource: string;
  pointer: string;
  /** Absent for an ordinary number whose semantics are unknown; `1` is explicit dimensionless. */
  nativeUnit?: string;
  representation: ParameterBinding['representation'];
  constraints: ParameterBinding['constraints'];
  quantityKind?: string;
  space?: ParameterBinding['space'];
  reference?: string;
}>;

/** Display choice owned by the client presenting the input. @public */
export type ParameterInputDisplay = Readonly<{
  /** Selected unit; absent for an ordinary number whose semantics are unknown. */
  unit?: string;
  locale: string;
  maximumFractionDigits?: number;
  /** Presentation increment in the selected display unit. */
  increment?: number;
}>;

/** Input accepted when creating the parameterInputMachine actor. @public */
export type ParameterInputMachineInput = Readonly<{
  editorInstance: string;
  binding: ParameterInputBinding;
  acknowledgedValue: number | string;
  acknowledgedRevision: ParameterSetIdentity;
  display: ParameterInputDisplay;
  pressure?: 'default' | 'continual';
}>;

/** A formatted view of the last authority-acknowledged value. @public */
export type ParameterInputAcknowledged = Readonly<{
  binding: ParameterInputBinding;
  value: number | string;
  revision: ParameterSetIdentity;
  display: ParameterInputDisplay;
  generation: number;
  projection: UnitResult<FormattedQuantity>;
}>;

/** Diagnostic retained by the input workflow. @public */
export type ParameterInputDiagnostic = Readonly<{
  code: string;
  message: string;
  span?: Readonly<{ start: number; end: number }>;
  expected?: unknown;
  actual?: unknown;
}>;

/** One raw draft with the edit context captured for its generation. @public */
export type ParameterInputDraft = Readonly<{
  raw: string;
  locale: string;
  inputUnit?: string;
  generation: number;
  binding: ParameterInputBinding;
  expected: ParameterSetIdentity;
  focused: boolean;
  dirty: boolean;
  source: 'text' | 'numeric';
  status: 'complete-valid' | 'incomplete' | 'invalid';
  resultStatus: 'success' | 'incomplete' | 'invalid' | 'unsupported' | 'indeterminate';
  nativeValue?: number;
  diagnostic?: ParameterInputDiagnostic;
  conflict?: Readonly<{
    reason: 'revision-changed' | 'binding-changed' | 'binding-removed';
    rebindable: boolean;
  }>;
}>;

type ParameterInputPendingSubmission = Readonly<{
  request: ParameterSetRequest;
  target: ParameterSetTarget;
  binding: ParameterInputBinding;
  locale: string;
  nativeValue: number;
}>;

/** Correlated active and latest-pending submissions. @public */
export type ParameterInputSubmission = Readonly<{
  active: ParameterInputPendingSubmission;
  pending?: ParameterInputPendingSubmission;
  outcome?: ParameterSetOutcome;
}>;

/** Serializable state owned by parameterInputMachine. @public */
export type ParameterInputMachineContext = Readonly<{
  editorInstance: string;
  pressure: 'default' | 'continual';
  /** Last editor-lifetime generation allocated to a draft or request. */
  sequence: number;
  /** False after removal until a valid authority refresh restores a binding. */
  bindingAvailable: boolean;
  acknowledged: ParameterInputAcknowledged;
  draft?: ParameterInputDraft;
  submission?: ParameterInputSubmission;
  diagnostic?: ParameterInputDiagnostic;
}>;

/** Modifier keys captured with one keyboard or pointer intent. @public */
export type ParameterInputModifiers = Readonly<{
  shift?: boolean;
  alt?: boolean;
  control?: boolean;
  meta?: boolean;
}>;

/** Events accepted by parameterInputMachine. @public */
export type ParameterInputMachineEvent =
  | Readonly<{ type: 'focus' }>
  | Readonly<{ type: 'blur' }>
  | Readonly<{ type: 'changeRaw'; text: string }>
  | Readonly<{ type: 'pressEnter' }>
  | Readonly<{ type: 'pressEscape' }>
  | Readonly<{ type: 'step'; direction: -1 | 1; modifiers?: ParameterInputModifiers }>
  | Readonly<{ type: 'pointerChanged'; value: number; modifiers?: ParameterInputModifiers }>
  | Readonly<{ type: 'pointerReleased' }>
  | Readonly<{ type: 'pointerCancelled' }>
  | Readonly<{ type: 'changeDisplay'; display: ParameterInputDisplay }>
  | Readonly<{
      type: 'refreshAuthority';
      binding?: ParameterInputBinding;
      value: number | string;
      revision: ParameterSetIdentity;
    }>
  | Readonly<{ type: 'settleSubmission'; generation: number; outcome: ParameterSetOutcome }>
  | Readonly<{ type: 'rebind' }>
  | Readonly<{ type: 'retry' }>
  | Readonly<{ type: 'discard' }>
  | Readonly<{ type: 'attach' }>
  | Readonly<{ type: 'detach' }>
  | Readonly<{ type: 'close' }>;

/** Parameter-set intent emitted for one captured draft generation. @public */
export type ParameterInputMachineEmitted = Readonly<{
  type: 'parameterSetIntent';
  target: ParameterSetTarget;
  locale: string;
  request: ParameterSetRequest;
}>;

const invalidInputDiagnostic: ParameterInputDiagnostic = {
  code: 'METADATA_CONFLICT',
  message: 'Parameter input configuration is malformed or not serializable.',
};
const invalidEventDiagnostic: ParameterInputDiagnostic = {
  code: 'METADATA_CONFLICT',
  message: 'Parameter input event is malformed or not serializable.',
};
const fallbackTarget: ParameterSetTarget = { authority: '', root: '', entry: '' };
const fallbackIdentity: ParameterSetIdentity = {
  sourceRevision: '',
  manifestRevision: '',
  valueRevision: '',
  dependencyRevision: '',
};
const fallbackBinding: ParameterInputBinding = {
  target: fallbackTarget,
  group: '',
  parameterId: '',
  resource: '',
  pointer: '',
  representation: 'binary64',
  constraints: {},
};
const fallbackDisplay: ParameterInputDisplay = { locale: 'en' };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const validIdentity = (value: unknown): value is ParameterSetIdentity =>
  isRecord(value) &&
  hasText(value['sourceRevision']) &&
  hasText(value['manifestRevision']) &&
  hasText(value['valueRevision']) &&
  hasText(value['dependencyRevision']);

const validTarget = (value: unknown): value is ParameterSetTarget =>
  isRecord(value) &&
  hasText(value['authority']) &&
  hasText(value['root']) &&
  hasText(value['entry']) &&
  (value['checkout'] === undefined || hasText(value['checkout']));

const validDisplay = (value: unknown): value is ParameterInputDisplay =>
  isRecord(value) &&
  (value['unit'] === undefined || hasText(value['unit'])) &&
  hasText(value['locale']) &&
  (value['maximumFractionDigits'] === undefined ||
    (Number.isSafeInteger(value['maximumFractionDigits']) && Number(value['maximumFractionDigits']) >= 0)) &&
  (value['increment'] === undefined ||
    (typeof value['increment'] === 'number' && Number.isFinite(value['increment']) && value['increment'] > 0));

const validBinding = (value: unknown): value is ParameterInputBinding =>
  isRecord(value) &&
  validTarget(value['target']) &&
  hasText(value['group']) &&
  hasText(value['parameterId']) &&
  hasText(value['resource']) &&
  hasText(value['pointer']) &&
  (value['nativeUnit'] === undefined || hasText(value['nativeUnit'])) &&
  isRecord(value['constraints']) &&
  (value['representation'] === 'binary64' ||
    value['representation'] === 'safe-integer' ||
    value['representation'] === 'decimal');

const validAcknowledgedValue = (binding: ParameterInputBinding, value: unknown): value is number | string =>
  binding.representation === 'decimal'
    ? hasText(value)
    : typeof value === 'number' &&
      Number.isFinite(value) &&
      (binding.representation !== 'safe-integer' || Number.isSafeInteger(value));

const serializable = (value: unknown, ancestors = new Set<unknown>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object') {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.every((item) => serializable(item, ancestors))
    : Object.values(value).every((item) => serializable(item, ancestors));
  ancestors.delete(value);
  return result;
};

const validInput = (value: unknown): value is ParameterInputMachineInput => {
  if (!isRecord(value) || !validBinding(value['binding'])) {
    return false;
  }
  return (
    hasText(value['editorInstance']) &&
    validAcknowledgedValue(value['binding'], value['acknowledgedValue']) &&
    validIdentity(value['acknowledgedRevision']) &&
    validDisplay(value['display']) &&
    (value['pressure'] === undefined || value['pressure'] === 'default' || value['pressure'] === 'continual') &&
    serializable(value)
  );
};

const validModifiers = (value: unknown): value is ParameterInputModifiers =>
  isRecord(value) &&
  ['shift', 'alt', 'control', 'meta'].every((key) => value[key] === undefined || typeof value[key] === 'boolean');

const hasOnlyKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const validOutcome = (value: unknown): value is ParameterSetOutcome => {
  if (!isRecord(value) || !hasText(value['requestId'])) {
    return false;
  }
  if (value['status'] === 'committed') {
    return (
      validIdentity(value['revision']) &&
      (value['write'] === 'applied' ||
        value['write'] === 'authority-no-op' ||
        value['write'] === 'durable-no-op' ||
        value['write'] === 'reconciled')
    );
  }
  if (value['status'] === 'cancelled-before-apply') {
    return true;
  }
  return (
    (value['status'] === 'rejected' ||
      value['status'] === 'known-not-applied-failure' ||
      value['status'] === 'indeterminate') &&
    hasText(value['code']) &&
    hasText(value['message'])
  );
};

const validEvent = (value: unknown): value is ParameterInputMachineEvent => {
  if (!isRecord(value) || typeof value['type'] !== 'string' || !serializable(value)) {
    return false;
  }
  switch (value['type']) {
    case 'focus':
    case 'blur':
    case 'pressEnter':
    case 'pressEscape':
    case 'pointerReleased':
    case 'pointerCancelled':
    case 'rebind':
    case 'retry':
    case 'discard':
    case 'attach':
    case 'detach':
    case 'close': {
      return hasOnlyKeys(value, ['type']);
    }
    case 'changeRaw': {
      return hasOnlyKeys(value, ['type', 'text']) && typeof value['text'] === 'string';
    }
    case 'step': {
      return (
        hasOnlyKeys(value, ['type', 'direction', 'modifiers']) &&
        (value['direction'] === -1 || value['direction'] === 1) &&
        (value['modifiers'] === undefined || validModifiers(value['modifiers']))
      );
    }
    case 'pointerChanged': {
      return (
        hasOnlyKeys(value, ['type', 'value', 'modifiers']) &&
        typeof value['value'] === 'number' &&
        Number.isFinite(value['value']) &&
        (value['modifiers'] === undefined || validModifiers(value['modifiers']))
      );
    }
    case 'changeDisplay': {
      return hasOnlyKeys(value, ['type', 'display']) && validDisplay(value['display']);
    }
    case 'refreshAuthority': {
      const bindingValue = value['binding'];
      return (
        hasOnlyKeys(value, ['type', 'binding', 'value', 'revision']) &&
        (bindingValue === undefined
          ? typeof value['value'] === 'string' ||
            (typeof value['value'] === 'number' && Number.isFinite(value['value']))
          : validBinding(bindingValue) && validAcknowledgedValue(bindingValue, value['value'])) &&
        validIdentity(value['revision'])
      );
    }
    case 'settleSubmission': {
      return (
        hasOnlyKeys(value, ['type', 'generation', 'outcome']) &&
        Number.isSafeInteger(value['generation']) &&
        Number(value['generation']) >= 0 &&
        validOutcome(value['outcome'])
      );
    }
    default: {
      return false;
    }
  }
};

const createNativeQuantity = (binding: ParameterInputBinding, value: number | string): UnitResult<Quantity> => {
  const metadata = {
    unit: binding.nativeUnit ?? '1',
    space: binding.space ?? 'linear',
    ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
    ...(binding.reference === undefined ? {} : { reference: binding.reference }),
  };
  return binding.representation === 'decimal'
    ? createQuantity({ ...metadata, value: String(value), representation: 'decimal' })
    : createQuantity({ ...metadata, value: Number(value), representation: binding.representation });
};

const projectAcknowledged = ({
  binding,
  value,
  revision,
  display,
  generation,
}: Readonly<{
  binding: ParameterInputBinding;
  value: number | string;
  revision: ParameterSetIdentity;
  display: ParameterInputDisplay;
  generation: number;
}>): ParameterInputAcknowledged => {
  const quantity = createNativeQuantity(binding, value);
  const projection =
    quantity.status === 'success'
      ? formatQuantity({
          quantity: quantity.value,
          unit: display.unit ?? binding.nativeUnit ?? '1',
          locale: display.locale,
          ...(display.maximumFractionDigits === undefined
            ? {}
            : { maximumFractionDigits: display.maximumFractionDigits }),
        })
      : quantity;
  return { binding, value, revision, display, generation, projection };
};

const initialContext = (input: ParameterInputMachineInput): ParameterInputMachineContext => {
  if (!validInput(input)) {
    return {
      editorInstance: '',
      pressure: 'default',
      sequence: 0,
      bindingAvailable: false,
      acknowledged: projectAcknowledged({
        binding: fallbackBinding,
        value: 0,
        revision: fallbackIdentity,
        display: fallbackDisplay,
        generation: 0,
      }),
      diagnostic: invalidInputDiagnostic,
    };
  }
  return {
    editorInstance: input.editorInstance,
    pressure: input.pressure ?? 'default',
    sequence: 0,
    bindingAvailable: true,
    acknowledged: projectAcknowledged({
      binding: input.binding,
      value: input.acknowledgedValue,
      revision: input.acknowledgedRevision,
      display: input.display,
      generation: 0,
    }),
  };
};

type DraftCapture = Omit<
  ParameterInputDraft,
  'status' | 'resultStatus' | 'nativeValue' | 'diagnostic' | 'dirty' | 'conflict'
>;

const diagnosticDraft = (
  capture: DraftCapture,
  resultStatus: 'incomplete' | 'invalid' | 'unsupported' | 'indeterminate',
  diagnostic: UnitDiagnostic,
): ParameterInputDraft => ({
  ...capture,
  dirty: true,
  status: resultStatus === 'incomplete' ? 'incomplete' : 'invalid',
  resultStatus,
  diagnostic,
});

const evaluateDraft = (acknowledged: ParameterInputAcknowledged, capture: DraftCapture): ParameterInputDraft => {
  if (capture.binding.representation === 'decimal') {
    return diagnosticDraft(capture, 'unsupported', {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Decimal input requires a decimal execution engine.',
    });
  }
  if (capture.binding.nativeUnit === undefined) {
    const explicitUnit = parseInput({ text: capture.raw, locale: capture.locale });
    if (explicitUnit.status === 'success') {
      return diagnosticDraft(capture, 'invalid', {
        code: 'SEMANTICS_UNRESOLVED',
        message: 'A unit suffix requires declared parameter semantics.',
      });
    }
  }
  const parsed = parseInput({
    text: capture.raw,
    locale: capture.locale,
    inputUnit: capture.inputUnit ?? '1',
    expectedUnit: capture.binding.nativeUnit ?? '1',
    ...(capture.binding.quantityKind === undefined ? {} : { kind: capture.binding.quantityKind }),
    space: capture.binding.space ?? 'linear',
    ...(capture.binding.reference === undefined ? {} : { reference: capture.binding.reference }),
  });
  if (parsed.status !== 'success') {
    return diagnosticDraft(capture, parsed.status, parsed.diagnostic);
  }
  const native = convert({ quantity: parsed.value.quantity, to: capture.binding.nativeUnit ?? '1' });
  if (native.status !== 'success') {
    return diagnosticDraft(capture, native.status, native.diagnostic);
  }
  if (typeof native.value.value !== 'number') {
    return diagnosticDraft(capture, 'unsupported', {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'The parsed quantity is not executable as finite binary64.',
    });
  }
  if (capture.binding.representation === 'safe-integer' && !Number.isSafeInteger(native.value.value)) {
    return diagnosticDraft(capture, 'unsupported', {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Input does not preserve a safe integer in the native unit.',
    });
  }
  const acknowledgedNative = createNativeQuantity(acknowledged.binding, acknowledged.value);
  const acknowledgedInput =
    acknowledgedNative.status === 'success'
      ? convert({ quantity: acknowledgedNative.value, to: parsed.value.consumedUnit })
      : acknowledgedNative;
  const isAcknowledgedValue =
    sameBindingStructure(capture.binding, acknowledged.binding) &&
    ((acknowledgedInput.status === 'success' &&
      typeof acknowledgedInput.value.value === 'number' &&
      typeof parsed.value.quantity.value === 'number' &&
      Object.is(acknowledgedInput.value.value, parsed.value.quantity.value)) ||
      (capture.locale === acknowledged.display.locale &&
        capture.inputUnit === acknowledged.display.unit &&
        capture.raw.trim() === numericProjection(acknowledged).trim()));
  return {
    ...capture,
    inputUnit: capture.binding.nativeUnit === undefined ? undefined : parsed.value.consumedUnit,
    dirty: !isAcknowledgedValue,
    status: 'complete-valid',
    resultStatus: 'success',
    nativeValue:
      isAcknowledgedValue && typeof acknowledged.value === 'number' ? acknowledged.value : native.value.value,
  };
};

const numericProjection = (acknowledged: ParameterInputAcknowledged): string =>
  acknowledged.projection.status === 'success'
    ? acknowledged.projection.value.parts.map(({ value }) => value).join('')
    : String(acknowledged.value);

const nextGeneration = (context: ParameterInputMachineContext): number => context.sequence + 1;

const freshDraft = (context: ParameterInputMachineContext, raw: string, focused: boolean): ParameterInputDraft =>
  evaluateDraft(context.acknowledged, {
    raw,
    locale: context.acknowledged.display.locale,
    inputUnit: context.acknowledged.display.unit,
    generation: nextGeneration(context),
    binding: context.acknowledged.binding,
    expected: context.acknowledged.revision,
    focused,
    source: 'text',
  });

const revisedDraft = (context: ParameterInputMachineContext, raw: string): ParameterInputDraft => {
  const current = context.draft;
  return current
    ? evaluateDraft(context.acknowledged, {
        raw,
        locale: current.locale,
        inputUnit: current.inputUnit,
        generation: nextGeneration(context),
        binding: current.binding,
        expected: current.expected,
        focused: current.focused,
        source: 'text',
      })
    : freshDraft(context, raw, true);
};

const sameTarget = (left: ParameterSetTarget, right: ParameterSetTarget): boolean =>
  left.authority === right.authority &&
  left.root === right.root &&
  left.checkout === right.checkout &&
  left.entry === right.entry;

const sameIdentity = (left: ParameterSetIdentity, right: ParameterSetIdentity): boolean =>
  left.sourceRevision === right.sourceRevision &&
  left.manifestRevision === right.manifestRevision &&
  left.valueRevision === right.valueRevision &&
  left.dependencyRevision === right.dependencyRevision;

const sameBindingIdentity = (left: ParameterInputBinding, right: ParameterInputBinding): boolean =>
  sameTarget(left.target, right.target) &&
  left.group === right.group &&
  left.parameterId === right.parameterId &&
  left.resource === right.resource &&
  left.pointer === right.pointer;

const sameBindingStructure = (left: ParameterInputBinding, right: ParameterInputBinding): boolean =>
  sameBindingIdentity(left, right) &&
  left.nativeUnit === right.nativeUnit &&
  left.representation === right.representation &&
  left.quantityKind === right.quantityKind &&
  left.space === right.space &&
  left.reference === right.reference;

const hasSettlementBarrier = (context: ParameterInputMachineContext): boolean =>
  context.submission !== undefined &&
  (context.submission.outcome === undefined || context.submission.outcome.status === 'indeterminate');

const requestFingerprint = (
  target: ParameterSetTarget,
  request: Pick<ParameterSetRequest, 'draftGeneration' | 'expected' | 'pressure' | 'operation'>,
  locale: string,
): string =>
  JSON.stringify({
    target,
    draftGeneration: request.draftGeneration,
    expected: request.expected,
    pressure: request.pressure,
    operation: request.operation,
    locale,
  });

const submissionCandidateFor = (
  context: ParameterInputMachineContext,
  draft: ParameterInputDraft,
  pressure: 'transient' | 'final',
): ParameterInputPendingSubmission | undefined => {
  if (
    !context.bindingAvailable ||
    draft.status !== 'complete-valid' ||
    !draft.dirty ||
    draft.nativeValue === undefined ||
    draft.conflict
  ) {
    return undefined;
  }
  const operation: ParameterSetRequest['operation'] =
    draft.binding.nativeUnit === undefined || draft.source === 'numeric'
      ? {
          kind: 'native-value',
          group: draft.binding.group,
          parameterId: draft.binding.parameterId,
          resource: draft.binding.resource,
          pointer: draft.binding.pointer,
          value: draft.nativeValue,
        }
      : {
          kind: 'unit-value',
          group: draft.binding.group,
          parameterId: draft.binding.parameterId,
          resource: draft.binding.resource,
          pointer: draft.binding.pointer,
          inputUnit: draft.inputUnit ?? draft.binding.nativeUnit,
          value: draft.raw,
        };
  const requestWithoutFingerprint: Omit<ParameterSetRequest, 'fingerprint'> = {
    requestId: `${context.editorInstance}:${draft.generation}`,
    draftGeneration: draft.generation,
    expected: draft.expected,
    pressure,
    operation,
  };
  const request: ParameterSetRequest = {
    ...requestWithoutFingerprint,
    fingerprint: requestFingerprint(draft.binding.target, requestWithoutFingerprint, draft.locale),
  };
  return {
    request,
    target: draft.binding.target,
    binding: draft.binding,
    locale: draft.locale,
    nativeValue: draft.nativeValue,
  };
};

const submissionFor = (
  context: ParameterInputMachineContext,
  draft: ParameterInputDraft,
  pressure: 'transient' | 'final',
): ParameterInputPendingSubmission | undefined =>
  hasSettlementBarrier(context) ? undefined : submissionCandidateFor(context, draft, pressure);

const pendingSubmissionFor = (
  context: ParameterInputMachineContext,
  draft: ParameterInputDraft,
  pressure: 'transient' | 'final',
): ParameterInputPendingSubmission | undefined => {
  const activeValue = context.submission?.active.nativeValue;
  const pendingDraft =
    draft.nativeValue === undefined || activeValue === undefined
      ? draft
      : { ...draft, dirty: !Object.is(draft.nativeValue, activeValue) };
  return submissionCandidateFor(context, pendingDraft, pressure);
};

const emittedIntent = (active: ParameterInputPendingSubmission): ParameterInputMachineEmitted => ({
  type: 'parameterSetIntent',
  target: active.target,
  locale: active.locale,
  request: active.request,
});

const rebasedPending = (
  pending: ParameterInputPendingSubmission,
  expected: ParameterSetIdentity,
): ParameterInputPendingSubmission => {
  const requestWithoutFingerprint = { ...pending.request, expected };
  return {
    ...pending,
    request: {
      ...requestWithoutFingerprint,
      fingerprint: requestFingerprint(pending.target, requestWithoutFingerprint, pending.locale),
    },
  };
};

const pendingWithPressure = (
  pending: ParameterInputPendingSubmission,
  pressure: 'transient' | 'final',
): ParameterInputPendingSubmission => {
  const requestWithoutFingerprint = { ...pending.request, pressure };
  return {
    ...pending,
    request: {
      ...requestWithoutFingerprint,
      fingerprint: requestFingerprint(pending.target, requestWithoutFingerprint, pending.locale),
    },
  };
};

const changedAuthority = (
  context: ParameterInputMachineContext,
  event: Extract<ParameterInputMachineEvent, { type: 'refreshAuthority' }>,
): ParameterInputAcknowledged | undefined =>
  event.binding
    ? projectAcknowledged({
        binding: event.binding,
        value: event.value,
        revision: event.revision,
        display: context.acknowledged.display,
        generation: context.acknowledged.generation,
      })
    : undefined;

const conflictDraft = (
  context: ParameterInputMachineContext,
  event: Extract<ParameterInputMachineEvent, { type: 'refreshAuthority' }>,
): ParameterInputDraft | undefined => {
  const { draft } = context;
  if (!draft) {
    return undefined;
  }
  const sameIdentity = event.binding && sameBindingIdentity(draft.binding, event.binding);
  const sameStructure = event.binding && sameBindingStructure(draft.binding, event.binding);
  return {
    ...draft,
    conflict: {
      reason: event.binding ? (sameStructure ? 'revision-changed' : 'binding-changed') : 'binding-removed',
      rebindable: Boolean(sameIdentity && sameStructure),
    },
  };
};

const pointerDraft = (
  context: ParameterInputMachineContext,
  event: Extract<ParameterInputMachineEvent, { type: 'pointerChanged' }>,
): ParameterInputDraft => numericDraft(context, event.value);

const numericDraft = (
  context: ParameterInputMachineContext,
  displayValue: number,
  nativeOverride?: number,
): ParameterInputDraft => {
  const { binding, display, revision, value: acknowledgedValue } = context.acknowledged;
  const inputUnit = display.unit ?? binding.nativeUnit;
  const capture: DraftCapture = {
    raw: String(displayValue),
    locale: display.locale,
    inputUnit,
    generation: nextGeneration(context),
    binding,
    expected: revision,
    focused: true,
    source: 'numeric',
  };
  if (!Number.isFinite(displayValue) || binding.representation === 'decimal') {
    return diagnosticDraft(capture, 'unsupported', {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Numeric input requires an executable finite representation.',
    });
  }
  let nativeValue = nativeOverride;
  if (nativeValue === undefined) {
    if (binding.nativeUnit === undefined) {
      nativeValue = displayValue;
    } else {
      const displayQuantity = createQuantity({
        value: displayValue,
        unit: inputUnit ?? binding.nativeUnit,
        representation: 'binary64',
        space: binding.space ?? 'linear',
        ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
        ...(binding.reference === undefined ? {} : { reference: binding.reference }),
      });
      const native =
        displayQuantity.status === 'success'
          ? convert({ quantity: displayQuantity.value, to: binding.nativeUnit })
          : displayQuantity;
      if (native.status !== 'success' || typeof native.value.value !== 'number') {
        const diagnostic: UnitDiagnostic =
          native.status === 'success'
            ? { code: 'REPRESENTATION_UNSUPPORTED', message: 'Numeric input is not executable.' }
            : native.diagnostic;
        return diagnosticDraft(capture, native.status === 'success' ? 'unsupported' : native.status, diagnostic);
      }
      nativeValue = native.value.value;
    }
  }
  if (binding.representation === 'safe-integer' && !Number.isSafeInteger(nativeValue)) {
    return diagnosticDraft(capture, 'unsupported', {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Numeric input does not preserve a safe integer in the native unit.',
    });
  }
  const displayQuantity = createQuantity({
    value: displayValue,
    unit: inputUnit ?? '1',
    representation: 'binary64',
    space: binding.space ?? 'linear',
    ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
    ...(binding.reference === undefined ? {} : { reference: binding.reference }),
  });
  const formatted =
    displayQuantity.status === 'success'
      ? formatQuantity({
          quantity: displayQuantity.value,
          unit: inputUnit ?? '1',
          locale: display.locale,
          ...(display.maximumFractionDigits === undefined
            ? {}
            : { maximumFractionDigits: display.maximumFractionDigits }),
        })
      : displayQuantity;
  const raw =
    formatted.status === 'success' ? formatted.value.parts.map(({ value }) => value).join('') : String(displayValue);
  return {
    ...capture,
    raw,
    dirty: typeof acknowledgedValue !== 'number' || !Object.is(nativeValue, acknowledgedValue),
    status: 'complete-valid',
    resultStatus: 'success',
    nativeValue,
  };
};

const stepDraft = (
  context: ParameterInputMachineContext,
  event: Extract<ParameterInputMachineEvent, { type: 'step' }>,
): ParameterInputDraft => {
  const { binding } = context.acknowledged;
  const base = context.draft?.nativeValue ?? context.acknowledged.value;
  const capture: DraftCapture = {
    raw: String(base),
    locale: context.acknowledged.display.locale,
    inputUnit: context.acknowledged.display.unit,
    generation: nextGeneration(context),
    binding,
    expected: context.acknowledged.revision,
    focused: true,
    source: 'numeric',
  };
  if (typeof base !== 'number') {
    return diagnosticDraft(capture, 'unsupported', {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Decimal values cannot be stepped without an execution engine.',
    });
  }
  const nativeBase = createNativeQuantity(binding, base);
  const displayBase =
    nativeBase.status === 'success'
      ? convert({ quantity: nativeBase.value, to: context.acknowledged.display.unit ?? binding.nativeUnit ?? '1' })
      : nativeBase;
  if (displayBase.status !== 'success' || typeof displayBase.value.value !== 'number') {
    const diagnostic: UnitDiagnostic =
      displayBase.status === 'success'
        ? { code: 'REPRESENTATION_UNSUPPORTED', message: 'Stepped value is not executable.' }
        : displayBase.diagnostic;
    return diagnosticDraft(capture, 'unsupported', diagnostic);
  }
  const increment = context.acknowledged.display.increment ?? 1;
  const candidateDisplay = displayBase.value.value + event.direction * increment * (event.modifiers?.shift ? 5 : 1);
  const candidateDraft = numericDraft(context, candidateDisplay);
  if (candidateDraft.nativeValue === undefined) {
    return candidateDraft;
  }
  const { minimum, maximum } = binding.constraints;
  const constrained = Math.min(
    typeof maximum === 'number' && Number.isFinite(maximum) ? maximum : Number.POSITIVE_INFINITY,
    Math.max(
      typeof minimum === 'number' && Number.isFinite(minimum) ? minimum : Number.NEGATIVE_INFINITY,
      candidateDraft.nativeValue,
    ),
  );
  if (Object.is(constrained, candidateDraft.nativeValue)) {
    return candidateDraft;
  }
  const native = createNativeQuantity(binding, constrained);
  const display =
    native.status === 'success'
      ? convert({ quantity: native.value, to: context.acknowledged.display.unit ?? binding.nativeUnit ?? '1' })
      : native;
  if (display.status !== 'success' || typeof display.value.value !== 'number') {
    const diagnostic: UnitDiagnostic =
      display.status === 'success'
        ? { code: 'REPRESENTATION_UNSUPPORTED', message: 'Stepped value is not executable.' }
        : display.diagnostic;
    return diagnosticDraft(capture, 'unsupported', diagnostic);
  }
  return numericDraft(context, display.value.value, constrained);
};

const correlated = (
  context: ParameterInputMachineContext,
  event: ParameterInputMachineEvent,
): event is Extract<ParameterInputMachineEvent, { type: 'settleSubmission' }> =>
  event.type === 'settleSubmission' &&
  context.submission?.active.request.draftGeneration === event.generation &&
  context.submission.active.request.requestId === event.outcome.requestId;

const authorityMatchesActive = (context: ParameterInputMachineContext): boolean => {
  const active = context.submission?.active;
  return (
    active !== undefined &&
    context.bindingAvailable &&
    sameIdentity(context.acknowledged.revision, active.request.expected) &&
    sameBindingStructure(context.acknowledged.binding, active.binding)
  );
};

const acknowledgedFromOutcome = (
  context: ParameterInputMachineContext,
  event: Extract<ParameterInputMachineEvent, { type: 'settleSubmission' }>,
): ParameterInputAcknowledged => {
  const active = context.submission?.active;
  const authorityStillMatches = authorityMatchesActive(context);
  return active && authorityStillMatches && event.outcome.status === 'committed'
    ? projectAcknowledged({
        binding: active.binding,
        value: active.nativeValue,
        revision: event.outcome.revision,
        display: context.acknowledged.display,
        generation: active.request.draftGeneration,
      })
    : context.acknowledged;
};

/**
 * Portable interaction owner for one parameter editor binding.
 *
 * It emits correlated parameter-set intents and advances acknowledged data only
 * after a matching committed settlement.
 *
 * @public
 */
export const parameterInputMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing
    context: {} as ParameterInputMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing
    events: {} as ParameterInputMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing
    input: {} as ParameterInputMachineInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing
    emitted: {} as ParameterInputMachineEmitted,
  },
  guards: {
    invalidEvent: ({ event }) => !validEvent(event),
    hasSettlementBarrier: ({ context }) => hasSettlementBarrier(context),
    hasInitializationFailure: ({ context }) => context.diagnostic !== undefined,
    hasDirtyDraft: ({ context }) => context.draft?.dirty === true,
    hasCleanDraft: ({ context }) => context.draft?.dirty === false,
    hasCompleteDraft: ({ context }) => context.draft?.status === 'complete-valid',
    hasIncompleteDraft: ({ context }) => context.draft?.status === 'incomplete',
    hasSubmittableDraft: ({ context }) =>
      !hasSettlementBarrier(context) &&
      context.draft !== undefined &&
      submissionFor(context, context.draft, 'final') !== undefined,
    hasPendingSubmission: ({ context, event }) =>
      correlated(context, event) &&
      event.outcome.status === 'committed' &&
      context.submission?.pending !== undefined &&
      authorityMatchesActive(context),
    hasConflictedDraftAfterCommit: ({ context, event }) =>
      correlated(context, event) && event.outcome.status === 'committed' && context.draft?.conflict !== undefined,
    hasNewerDraftAfterCommit: ({ context, event }) =>
      correlated(context, event) &&
      event.outcome.status === 'committed' &&
      context.draft !== undefined &&
      context.draft.generation > event.generation,
    isCommittedOutcome: ({ context, event }) => correlated(context, event) && event.outcome.status === 'committed',
    isConflictOutcome: ({ context, event }) =>
      correlated(context, event) && event.outcome.status === 'rejected' && event.outcome.code === 'STALE_MANIFEST',
    isFailureOutcome: ({ context, event }) =>
      correlated(context, event) &&
      (event.outcome.status === 'known-not-applied-failure' ||
        event.outcome.status === 'indeterminate' ||
        event.outcome.status === 'rejected'),
    isCancelledOutcome: ({ context, event }) =>
      correlated(context, event) && event.outcome.status === 'cancelled-before-apply',
    hasNewerDraftAfterCancellation: ({ context, event }) =>
      correlated(context, event) &&
      event.outcome.status === 'cancelled-before-apply' &&
      context.draft !== undefined &&
      context.draft.generation > event.generation,
    canRetry: ({ context }) => context.submission?.outcome?.status === 'known-not-applied-failure',
    canRebind: ({ context }) => context.draft?.conflict?.rebindable === true,
    continualPressure: ({ context }) => context.pressure === 'continual',
    validPointerValue: ({ event }) => validEvent(event) && event.type === 'pointerChanged',
    submittableContinualPointer: ({ context, event }) => {
      if (
        hasSettlementBarrier(context) ||
        context.pressure !== 'continual' ||
        !validEvent(event) ||
        event.type !== 'pointerChanged'
      ) {
        return false;
      }
      const draft = pointerDraft(context, event);
      return submissionFor(context, draft, 'transient') !== undefined;
    },
    submittableStep: ({ context, event }) => {
      if (hasSettlementBarrier(context) || !validEvent(event) || event.type !== 'step') {
        return false;
      }
      const draft = stepDraft(context, event);
      return submissionFor(context, draft, 'final') !== undefined;
    },
  },
  actions: {
    recordInvalidEvent: assign({ diagnostic: invalidEventDiagnostic }),
    beginEditing: assign(({ context }) => {
      const draft = freshDraft(context, numericProjection(context.acknowledged), true);
      return {
        draft,
        sequence: draft.generation,
        submission: hasSettlementBarrier(context) ? context.submission : undefined,
        diagnostic: undefined,
      };
    }),
    updateDraft: assign(({ context, event }) => {
      const draft = event.type === 'changeRaw' ? revisedDraft(context, event.text) : context.draft;
      return { draft, sequence: draft?.generation ?? context.sequence, diagnostic: undefined };
    }),
    focusDraft: assign(({ context }) => {
      const draft = context.draft
        ? { ...context.draft, focused: true }
        : freshDraft(context, numericProjection(context.acknowledged), true);
      return { draft, sequence: draft.generation };
    }),
    blurDraft: assign(({ context }) => ({
      draft: context.draft ? { ...context.draft, focused: false } : undefined,
    })),
    discardDraft: assign(({ context }) => ({
      draft: undefined,
      submission: hasSettlementBarrier(context) ? context.submission : undefined,
      diagnostic: undefined,
    })),
    updateDisplay: assign(({ context, event }) => ({
      acknowledged:
        event.type === 'changeDisplay'
          ? projectAcknowledged({ ...context.acknowledged, display: event.display })
          : context.acknowledged,
    })),
    updateAuthority: assign(({ context, event }) => ({
      acknowledged:
        event.type === 'refreshAuthority'
          ? (changedAuthority(context, event) ?? context.acknowledged)
          : context.acknowledged,
      bindingAvailable: event.type === 'refreshAuthority' && event.binding !== undefined,
      diagnostic:
        event.type === 'refreshAuthority' && event.binding === undefined
          ? { code: 'STALE_MANIFEST', message: 'The parameter binding was removed.' }
          : undefined,
    })),
    refreshCleanDraft: assign(({ context, event }) => {
      if (event.type !== 'refreshAuthority') {
        return {};
      }
      const acknowledged = changedAuthority(context, event);
      return {
        acknowledged: acknowledged ?? context.acknowledged,
        bindingAvailable: acknowledged !== undefined,
        draft: acknowledged
          ? evaluateDraft(acknowledged, {
              raw: numericProjection(acknowledged),
              locale: acknowledged.display.locale,
              inputUnit: acknowledged.display.unit,
              generation: nextGeneration(context),
              binding: acknowledged.binding,
              expected: acknowledged.revision,
              focused: context.draft?.focused ?? false,
              source: 'text',
            })
          : context.draft,
        sequence: acknowledged ? nextGeneration(context) : context.sequence,
        diagnostic: event.binding
          ? undefined
          : { code: 'STALE_MANIFEST', message: 'The parameter binding was removed.' },
      };
    }),
    markConflict: assign(({ context, event }) => ({
      draft: event.type === 'refreshAuthority' ? conflictDraft(context, event) : context.draft,
      acknowledged:
        event.type === 'refreshAuthority'
          ? (changedAuthority(context, event) ?? context.acknowledged)
          : context.acknowledged,
      bindingAvailable: event.type === 'refreshAuthority' && event.binding !== undefined,
      diagnostic:
        event.type === 'refreshAuthority' && event.binding === undefined
          ? { code: 'STALE_MANIFEST', message: 'The parameter binding was removed.' }
          : { code: 'STALE_MANIFEST', message: 'The authoritative parameter revision changed during editing.' },
    })),
    rebindDraft: assign(({ context }) => {
      const { draft } = context;
      return draft
        ? {
            draft: evaluateDraft(context.acknowledged, {
              raw: draft.raw,
              locale: draft.locale,
              inputUnit: draft.inputUnit,
              generation: nextGeneration(context),
              binding: context.acknowledged.binding,
              expected: context.acknowledged.revision,
              focused: draft.focused,
              source: 'text',
            }),
            sequence: nextGeneration(context),
            submission: context.submission,
            diagnostic: undefined,
          }
        : {};
    }),
    beginSubmission: enqueueActions(({ context, enqueue }) => {
      const active = context.draft ? submissionFor(context, context.draft, 'final') : undefined;
      if (!active) {
        return;
      }
      enqueue.emit(emittedIntent(active));
      enqueue.assign({ submission: { active }, diagnostic: undefined });
    }),
    beginContinualSubmission: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'pointerChanged') {
        return;
      }
      const draft = pointerDraft(context, event);
      const active = submissionFor(context, draft, 'transient');
      if (!active) {
        enqueue.assign({ draft, diagnostic: draft.diagnostic });
        return;
      }
      enqueue.emit(emittedIntent(active));
      enqueue.assign({ draft, sequence: draft.generation, submission: { active }, diagnostic: undefined });
    }),
    beginPointerDraft: assign(({ context, event }) => ({
      draft: event.type === 'pointerChanged' ? pointerDraft(context, event) : context.draft,
      sequence: event.type === 'pointerChanged' ? nextGeneration(context) : context.sequence,
      diagnostic:
        event.type === 'pointerChanged' && !Number.isFinite(event.value)
          ? { code: 'NUMERIC_OVERFLOW', message: 'Pointer value must be finite.' }
          : undefined,
    })),
    queueContinualDraft: assign(({ context, event }) => {
      if (event.type !== 'pointerChanged') {
        return {};
      }
      const draft = pointerDraft(context, event);
      const pending = pendingSubmissionFor(context, draft, 'transient');
      return {
        draft,
        sequence: draft.generation,
        submission:
          context.submission && pending
            ? { ...context.submission, pending }
            : context.submission?.outcome === undefined
              ? context.submission && { active: context.submission.active }
              : { active: context.submission.active, outcome: context.submission.outcome },
        diagnostic: draft.diagnostic,
      };
    }),
    finalizePendingDraft: assign(({ context }) => {
      const pending = context.submission?.pending;
      if (pending) {
        const finalPending = pendingWithPressure(pending, 'final');
        return {
          submission: { ...context.submission, pending: finalPending },
        };
      }
      if (!context.submission || !context.draft) {
        return {};
      }
      const releaseDraft = { ...context.draft, generation: nextGeneration(context) };
      const release = pendingSubmissionFor(context, releaseDraft, 'final');
      return release
        ? {
            draft: releaseDraft,
            sequence: releaseDraft.generation,
            submission: { ...context.submission, pending: release },
          }
        : {};
    }),
    cancelPointerDraft: assign(({ context }) => {
      const active = context.submission?.active;
      return {
        draft: context.draft?.generation === active?.request.draftGeneration ? context.draft : undefined,
        submission: active ? { active } : undefined,
        diagnostic: undefined,
      };
    }),
    submitStep: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'step') {
        return;
      }
      const draft = stepDraft(context, event);
      const active = submissionFor(context, draft, 'final');
      if (!active) {
        enqueue.assign({ draft, diagnostic: draft.diagnostic });
        return;
      }
      enqueue.emit(emittedIntent(active));
      enqueue.assign({ draft, sequence: draft.generation, submission: { active }, diagnostic: undefined });
    }),
    acceptCommitted: assign(({ context, event }) =>
      event.type === 'settleSubmission'
        ? {
            acknowledged: acknowledgedFromOutcome(context, event),
            draft: undefined,
            submission: undefined,
            diagnostic: undefined,
          }
        : {},
    ),
    acceptCommittedWithDraft: assign(({ context, event }) => {
      if (event.type !== 'settleSubmission') {
        return {};
      }
      const mayReconcileDraft = authorityMatchesActive(context);
      const acknowledged = acknowledgedFromOutcome(context, event);
      const draft =
        mayReconcileDraft && context.draft
          ? evaluateDraft(acknowledged, {
              raw: context.draft.raw,
              locale: context.draft.locale,
              inputUnit: context.draft.inputUnit,
              generation: nextGeneration(context),
              binding: acknowledged.binding,
              expected: acknowledged.revision,
              focused: context.draft.focused,
              source: context.draft.source,
            })
          : context.draft;
      return {
        acknowledged,
        draft,
        sequence: draft?.generation ?? context.sequence,
        submission: undefined,
        diagnostic: draft?.diagnostic,
      };
    }),
    acceptAndSubmitPending: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'settleSubmission' || !context.submission?.pending) {
        return;
      }
      const acknowledged = acknowledgedFromOutcome(context, event);
      const pending = rebasedPending(context.submission.pending, acknowledged.revision);
      enqueue.emit(emittedIntent(pending));
      enqueue.assign({
        acknowledged,
        submission: { active: pending },
        diagnostic: undefined,
      });
    }),
    recordConflictOutcome: assign(({ context, event }) => ({
      submission:
        event.type === 'settleSubmission' && context.submission
          ? { ...context.submission, outcome: event.outcome }
          : context.submission,
      draft: context.draft
        ? { ...context.draft, conflict: { reason: 'revision-changed', rebindable: true } }
        : context.draft,
      diagnostic: { code: 'STALE_MANIFEST', message: 'The submitted parameter revision is stale.' },
    })),
    recordFailureOutcome: assign(({ context, event }) => ({
      submission:
        event.type === 'settleSubmission' && context.submission
          ? { ...context.submission, outcome: event.outcome }
          : context.submission,
      diagnostic:
        event.type === 'settleSubmission' && 'code' in event.outcome
          ? { code: event.outcome.code, message: event.outcome.message }
          : invalidInputDiagnostic,
    })),
    recordCancelledOutcome: assign(({ context, event }) => ({
      submission: undefined,
      draft:
        event.type === 'settleSubmission' && context.draft?.generation === event.generation ? undefined : context.draft,
      diagnostic: undefined,
    })),
    retrySubmission: enqueueActions(({ context, enqueue }) => {
      const active = context.submission?.active;
      if (!active) {
        return;
      }
      enqueue.emit(emittedIntent(active));
      enqueue.assign({ submission: { ...context.submission, outcome: undefined }, diagnostic: undefined });
    }),
  },
}).createMachine({
  id: 'parameter-input',
  context: ({ input }) => initialContext(input),
  initial: 'active',
  states: {
    active: {
      type: 'parallel',
      on: {
        close: [
          {
            guard: 'invalidEvent',
            target: '#parameter-input.active.interaction.failed',
            actions: 'recordInvalidEvent',
          },
          { target: 'closed' },
        ],
        settleSubmission: [
          {
            guard: 'invalidEvent',
            target: '#parameter-input.active.interaction.failed',
            actions: 'recordInvalidEvent',
          },
          { guard: 'hasPendingSubmission', actions: 'acceptAndSubmitPending' },
          {
            guard: 'hasConflictedDraftAfterCommit',
            target: '#parameter-input.active.interaction.conflicted',
            actions: 'acceptCommittedWithDraft',
          },
          {
            guard: 'hasNewerDraftAfterCommit',
            target: '#parameter-input.active.interaction.editing.classifying',
            actions: 'acceptCommittedWithDraft',
          },
          {
            guard: 'isCommittedOutcome',
            target: '#parameter-input.active.interaction.viewing',
            actions: 'acceptCommitted',
          },
          {
            guard: 'isConflictOutcome',
            target: '#parameter-input.active.interaction.conflicted',
            actions: 'recordConflictOutcome',
          },
          {
            guard: 'isFailureOutcome',
            target: '#parameter-input.active.interaction.failed',
            actions: 'recordFailureOutcome',
          },
          {
            guard: 'hasNewerDraftAfterCancellation',
            target: '#parameter-input.active.interaction.editing.classifying',
            actions: 'recordCancelledOutcome',
          },
          {
            guard: 'isCancelledOutcome',
            target: '#parameter-input.active.interaction.viewing',
            actions: 'recordCancelledOutcome',
          },
        ],
        '*': {
          guard: 'invalidEvent',
          target: '#parameter-input.active.interaction.failed',
          actions: 'recordInvalidEvent',
        },
      },
      states: {
        attachment: {
          initial: 'attached',
          states: {
            attached: {
              on: {
                detach: [
                  {
                    guard: 'invalidEvent',
                    target: '#parameter-input.active.interaction.failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'detached' },
                ],
              },
            },
            detached: {
              on: {
                attach: [
                  {
                    guard: 'invalidEvent',
                    target: '#parameter-input.active.interaction.failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'attached' },
                ],
              },
            },
          },
        },
        interaction: {
          initial: 'initializing',
          states: {
            initializing: {
              always: [{ guard: 'hasInitializationFailure', target: 'failed' }, { target: 'viewing' }],
            },
            viewing: {
              on: {
                focus: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'editing.classifying', actions: 'beginEditing' },
                ],
                changeDisplay: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'updateDisplay' },
                ],
                refreshAuthority: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  {
                    guard: ({ event }) => event.binding === undefined,
                    target: 'conflicted',
                    actions: 'updateAuthority',
                  },
                  { actions: 'updateAuthority' },
                ],
                pointerChanged: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'submittableContinualPointer', target: 'submitting', actions: 'beginContinualSubmission' },
                  { guard: 'validPointerValue', target: 'dragging', actions: 'beginPointerDraft' },
                ],
                step: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'submittableStep', target: 'submitting', actions: 'submitStep' },
                  { target: 'failed', actions: 'submitStep' },
                ],
              },
            },
            editing: {
              initial: 'classifying',
              on: {
                focus: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'focusDraft' },
                ],
                blur: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'hasCleanDraft', target: 'viewing', actions: 'discardDraft' },
                  { actions: 'blurDraft' },
                ],
                changeRaw: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: '.classifying', actions: 'updateDraft' },
                ],
                pressEscape: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                changeDisplay: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'updateDisplay' },
                ],
                refreshAuthority: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'hasDirtyDraft', target: 'conflicted', actions: 'markConflict' },
                  { target: '.classifying', actions: 'refreshCleanDraft' },
                ],
                pointerChanged: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'submittableContinualPointer', target: 'submitting', actions: 'beginContinualSubmission' },
                  { guard: 'validPointerValue', target: 'dragging', actions: 'beginPointerDraft' },
                ],
                step: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'submittableStep', target: 'submitting', actions: 'submitStep' },
                  { target: 'failed', actions: 'submitStep' },
                ],
                discard: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                detach: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'hasCleanDraft', target: 'viewing', actions: 'discardDraft' },
                ],
              },
              states: {
                classifying: {
                  always: [
                    { guard: 'hasCompleteDraft', target: 'complete-valid' },
                    { guard: 'hasIncompleteDraft', target: 'incomplete' },
                    { target: 'invalid' },
                  ],
                },
                'complete-valid': {
                  on: {
                    pressEnter: [
                      {
                        guard: 'invalidEvent',
                        target: '#parameter-input.active.interaction.failed',
                        actions: 'recordInvalidEvent',
                      },
                      { guard: 'hasSettlementBarrier' },
                      {
                        guard: 'hasSubmittableDraft',
                        target: '#parameter-input.active.interaction.submitting',
                        actions: 'beginSubmission',
                      },
                      { target: '#parameter-input.active.interaction.viewing', actions: 'discardDraft' },
                    ],
                  },
                },
                incomplete: {},
                invalid: {},
              },
            },
            dragging: {
              on: {
                pointerChanged: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'validPointerValue', actions: 'beginPointerDraft' },
                ],
                pointerReleased: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'hasSubmittableDraft', target: 'submitting', actions: 'beginSubmission' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                pointerCancelled: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                pressEscape: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                changeDisplay: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'updateDisplay' },
                ],
                refreshAuthority: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'conflicted', actions: 'markConflict' },
                ],
              },
            },
            submitting: {
              on: {
                changeRaw: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'updateDraft' },
                ],
                pointerChanged: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'continualPressure', actions: 'queueContinualDraft' },
                ],
                pointerReleased: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'finalizePendingDraft' },
                ],
                pointerCancelled: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'cancelPointerDraft' },
                ],
                pressEscape: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'cancelPointerDraft' },
                ],
                changeDisplay: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'updateDisplay' },
                ],
                refreshAuthority: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'conflicted', actions: 'markConflict' },
                ],
              },
            },
            conflicted: {
              on: {
                rebind: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { guard: 'canRebind', target: 'editing.classifying', actions: 'rebindDraft' },
                ],
                refreshAuthority: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'markConflict' },
                ],
                pressEscape: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                discard: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                changeDisplay: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'updateDisplay' },
                ],
              },
            },
            failed: {
              on: {
                retry: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { guard: 'canRetry', target: 'submitting', actions: 'retrySubmission' },
                ],
                changeRaw: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'editing.classifying', actions: 'updateDraft' },
                ],
                focus: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'editing.classifying', actions: 'beginEditing' },
                ],
                refreshAuthority: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'conflicted', actions: 'markConflict' },
                ],
                pressEscape: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                discard: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                changeDisplay: [{ guard: 'invalidEvent', actions: 'recordInvalidEvent' }, { actions: 'updateDisplay' }],
              },
            },
          },
        },
      },
    },
    closed: { type: 'final' },
  },
});
