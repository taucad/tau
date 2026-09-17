// Pure data, validation and draft rules for parameterInputMachine; the machine owns every transition.
import { formatQuantity, parseInput } from '@taucad/units/input';
import type { FormattedQuantity } from '@taucad/units/input';
import { convert, createQuantity } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import type { UnitDiagnostic, UnitResult } from '@taucad/units/unit';
import type { ParameterBinding } from '#manifest.js';
import type { ParameterSetIdentity, ParameterSetOutcome, ParameterSetRequest, ParameterSetTarget } from '#types.js';

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
  /**
   * Random token for this actor's lifetime. Generations restart with every actor, and records keep
   * the last request ID as an idempotency receipt, so request IDs carry it to stay unique.
   */
  session: string;
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
  | Readonly<{
      type: 'step';
      direction: -1 | 1;
      modifiers?: ParameterInputModifiers;
    }>
  | Readonly<{
      type: 'pointerChanged';
      value: number;
      modifiers?: ParameterInputModifiers;
    }>
  | Readonly<{ type: 'pointerReleased' }>
  | Readonly<{ type: 'pointerCancelled' }>
  | Readonly<{ type: 'changeDisplay'; display: ParameterInputDisplay }>
  | Readonly<{
      type: 'refreshAuthority';
      binding?: ParameterInputBinding;
      value: number | string;
      revision: ParameterSetIdentity;
    }>
  | Readonly<{
      type: 'settleSubmission';
      generation: number;
      outcome: ParameterSetOutcome;
    }>
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

export const invalidInputDiagnostic: ParameterInputDiagnostic = {
  code: 'METADATA_CONFLICT',
  message: 'Parameter input configuration is malformed or not serializable.',
};
export const invalidEventDiagnostic: ParameterInputDiagnostic = {
  code: 'METADATA_CONFLICT',
  message: 'Parameter input event is malformed or not serializable.',
};
const fallbackTarget: ParameterSetTarget = {
  authority: '',
  root: '',
  entry: '',
};
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

type EventRecord = Readonly<Record<string, unknown>>;
const bareEvent = (value: EventRecord): boolean => hasOnlyKeys(value, ['type']);
const optionalModifiers = (value: EventRecord): boolean =>
  value['modifiers'] === undefined || validModifiers(value['modifiers']);
const validRefreshValue = (value: EventRecord): boolean => {
  const bindingValue = value['binding'];
  return bindingValue === undefined
    ? typeof value['value'] === 'string' || (typeof value['value'] === 'number' && Number.isFinite(value['value']))
    : validBinding(bindingValue) && validAcknowledgedValue(bindingValue, value['value']);
};
const eventValidators: Readonly<Record<ParameterInputMachineEvent['type'], (value: EventRecord) => boolean>> = {
  focus: bareEvent,
  blur: bareEvent,
  pressEnter: bareEvent,
  pressEscape: bareEvent,
  pointerReleased: bareEvent,
  pointerCancelled: bareEvent,
  rebind: bareEvent,
  retry: bareEvent,
  discard: bareEvent,
  attach: bareEvent,
  detach: bareEvent,
  close: bareEvent,
  changeRaw: (value) => hasOnlyKeys(value, ['type', 'text']) && typeof value['text'] === 'string',
  step: (value) =>
    hasOnlyKeys(value, ['type', 'direction', 'modifiers']) &&
    (value['direction'] === -1 || value['direction'] === 1) &&
    optionalModifiers(value),
  pointerChanged: (value) =>
    hasOnlyKeys(value, ['type', 'value', 'modifiers']) &&
    typeof value['value'] === 'number' &&
    Number.isFinite(value['value']) &&
    optionalModifiers(value),
  changeDisplay: (value) => hasOnlyKeys(value, ['type', 'display']) && validDisplay(value['display']),
  refreshAuthority: (value) =>
    hasOnlyKeys(value, ['type', 'binding', 'value', 'revision']) &&
    validRefreshValue(value) &&
    validIdentity(value['revision']),
  settleSubmission: (value) =>
    hasOnlyKeys(value, ['type', 'generation', 'outcome']) &&
    Number.isSafeInteger(value['generation']) &&
    Number(value['generation']) >= 0 &&
    validOutcome(value['outcome']),
};

export const validEvent = (value: unknown): value is ParameterInputMachineEvent =>
  isRecord(value) &&
  typeof value['type'] === 'string' &&
  Object.hasOwn(eventValidators, value['type']) &&
  serializable(value) &&
  eventValidators[value['type'] as ParameterInputMachineEvent['type']](value);

const createNativeQuantity = (binding: ParameterInputBinding, value: number | string): UnitResult<Quantity> => {
  const metadata = {
    unit: binding.nativeUnit ?? '1',
    space: binding.space ?? 'linear',
    ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
    ...(binding.reference === undefined ? {} : { reference: binding.reference }),
  };
  return binding.representation === 'decimal'
    ? createQuantity({
        ...metadata,
        value: String(value),
        representation: 'decimal',
      })
    : createQuantity({
        ...metadata,
        value: Number(value),
        representation: binding.representation,
      });
};

export const projectAcknowledged = ({
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

const sessionToken = (): string =>
  [...globalThis.crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const initialContext = (input: ParameterInputMachineInput): ParameterInputMachineContext => {
  if (!validInput(input)) {
    return {
      editorInstance: '',
      session: sessionToken(),
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
    session: sessionToken(),
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

/**
 * Validate one executable native value against the admitted binding constraints.
 * @param binding - The admitted editor binding.
 * @param value - The native value to check.
 * @returns The first violated constraint, or `undefined` when the value is admissible.
 * @public
 */
export const validateParameterInputValue = (
  binding: ParameterInputBinding,
  value: number,
): UnitDiagnostic | undefined => {
  if (binding.representation === 'decimal') {
    return {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Decimal input requires a decimal execution engine.',
    };
  }
  if (!Number.isFinite(value)) {
    return { code: 'REPRESENTATION_UNSUPPORTED', message: 'Parameter values must be finite.' };
  }
  if (binding.representation === 'safe-integer' && !Number.isSafeInteger(value)) {
    return {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Input does not preserve a safe integer in the native unit.',
    };
  }
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } = binding.constraints;
  if (typeof minimum === 'number' && value < minimum) {
    return { code: 'METADATA_CONFLICT', message: `Value must be at least ${String(minimum)}.` };
  }
  if (typeof maximum === 'number' && value > maximum) {
    return { code: 'METADATA_CONFLICT', message: `Value must be at most ${String(maximum)}.` };
  }
  if (typeof exclusiveMinimum === 'number' && value <= exclusiveMinimum) {
    return { code: 'METADATA_CONFLICT', message: `Value must be greater than ${String(exclusiveMinimum)}.` };
  }
  if (typeof exclusiveMaximum === 'number' && value >= exclusiveMaximum) {
    return { code: 'METADATA_CONFLICT', message: `Value must be less than ${String(exclusiveMaximum)}.` };
  }
  if (typeof multipleOf === 'number' && multipleOf > 0) {
    const quotient = value / multipleOf;
    if (Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8) {
      return { code: 'METADATA_CONFLICT', message: `Value must be a multiple of ${String(multipleOf)}.` };
    }
  }
  if (Object.hasOwn(binding.constraints, 'const') && !Object.is(value, binding.constraints['const'])) {
    return { code: 'METADATA_CONFLICT', message: 'Value does not match the required constant.' };
  }
  if (
    Array.isArray(binding.constraints['enum']) &&
    !binding.constraints['enum'].some((candidate) => Object.is(candidate, value))
  ) {
    return { code: 'METADATA_CONFLICT', message: 'Value is not one of the admitted choices.' };
  }
  return undefined;
};

const hasUnitSuffix = (capture: DraftCapture): boolean =>
  parseInput({ text: capture.raw, locale: capture.locale }).status === 'success';

const matchesAcknowledged = (
  acknowledged: ParameterInputAcknowledged,
  capture: DraftCapture,
  parsed: Readonly<{ quantity: Quantity; consumedUnit: string }>,
): boolean => {
  if (!sameBindingStructure(capture.binding, acknowledged.binding)) {
    return false;
  }
  const acknowledgedNative = createNativeQuantity(acknowledged.binding, acknowledged.value);
  const acknowledgedInput =
    acknowledgedNative.status === 'success'
      ? convert({ quantity: acknowledgedNative.value, to: parsed.consumedUnit })
      : acknowledgedNative;
  const sameQuantity =
    acknowledgedInput.status === 'success' &&
    typeof acknowledgedInput.value.value === 'number' &&
    typeof parsed.quantity.value === 'number' &&
    sameBinary64Value(acknowledgedInput.value.value, parsed.quantity.value);
  return (
    sameQuantity ||
    (capture.locale === acknowledged.display.locale &&
      capture.inputUnit === acknowledged.display.unit &&
      capture.raw.trim() === numericProjection(acknowledged).trim())
  );
};

export const evaluateDraft = (acknowledged: ParameterInputAcknowledged, capture: DraftCapture): ParameterInputDraft => {
  if (capture.binding.representation === 'decimal') {
    return diagnosticDraft(capture, 'unsupported', {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Decimal input requires a decimal execution engine.',
    });
  }
  if (capture.binding.nativeUnit === undefined && hasUnitSuffix(capture)) {
    return diagnosticDraft(capture, 'invalid', {
      code: 'SEMANTICS_UNRESOLVED',
      message: 'A unit suffix requires declared parameter semantics.',
    });
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
  const native = convert({
    quantity: parsed.value.quantity,
    to: capture.binding.nativeUnit ?? '1',
  });
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
  const isAcknowledgedValue = matchesAcknowledged(acknowledged, capture, parsed.value);
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

export const numericProjection = (acknowledged: ParameterInputAcknowledged): string =>
  acknowledged.projection.status === 'success'
    ? acknowledged.projection.value.parts.map(({ value }) => value).join('')
    : String(acknowledged.value);

const sameBinary64Value = (left: number, right: number): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === 0 || right === 0) {
    return false;
  }
  return Math.abs(left - right) <= Number.EPSILON * Math.max(Math.abs(left), Math.abs(right)) * 8;
};

export const nextGeneration = (context: ParameterInputMachineContext): number => context.sequence + 1;

export const freshDraft = (context: ParameterInputMachineContext, raw: string, focused: boolean): ParameterInputDraft =>
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

export const revisedDraft = (context: ParameterInputMachineContext, raw: string): ParameterInputDraft => {
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

export const hasSettlementBarrier = (context: ParameterInputMachineContext): boolean =>
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
  // Field-scoped freshness: the authority can accept this draft even when another field has moved
  // the record's value revision underneath it.
  const base: ParameterSetRequest['base'] = {
    pointer: draft.binding.pointer,
    value: context.acknowledged.value,
    binding: {
      ...(draft.binding.nativeUnit === undefined ? {} : { unit: draft.binding.nativeUnit }),
      ...(draft.binding.quantityKind === undefined ? {} : { quantityKind: draft.binding.quantityKind }),
      ...(draft.binding.space === undefined ? {} : { space: draft.binding.space }),
      ...(draft.binding.reference === undefined ? {} : { reference: draft.binding.reference }),
      representation: draft.binding.representation,
    },
  };
  const requestWithoutFingerprint: Omit<ParameterSetRequest, 'fingerprint'> = {
    requestId: `${context.editorInstance}:${context.session}:${draft.generation}`,
    draftGeneration: draft.generation,
    expected: draft.expected,
    base,
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

export const submissionFor = (
  context: ParameterInputMachineContext,
  draft: ParameterInputDraft,
  pressure: 'transient' | 'final',
): ParameterInputPendingSubmission | undefined =>
  hasSettlementBarrier(context) ? undefined : submissionCandidateFor(context, draft, pressure);

export const pendingSubmissionFor = (
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

export const emittedIntent = (active: ParameterInputPendingSubmission): ParameterInputMachineEmitted => ({
  type: 'parameterSetIntent',
  target: active.target,
  locale: active.locale,
  request: active.request,
});

export const rebasedPending = (
  pending: ParameterInputPendingSubmission,
  acknowledged: ParameterInputAcknowledged,
): ParameterInputPendingSubmission => {
  const { base } = pending.request;
  const requestWithoutFingerprint = {
    ...pending.request,
    expected: acknowledged.revision,
    ...(base === undefined ? {} : { base: { ...base, value: acknowledged.value } }),
  };
  return {
    ...pending,
    request: {
      ...requestWithoutFingerprint,
      fingerprint: requestFingerprint(pending.target, requestWithoutFingerprint, pending.locale),
    },
  };
};

export const pendingWithPressure = (
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

export const changedAuthority = (
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

export const conflictDraft = (
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

type NumericConversion =
  | Readonly<{ value: number }>
  | Readonly<{ status: 'incomplete' | 'invalid' | 'unsupported' | 'indeterminate'; diagnostic: UnitDiagnostic }>;

const numericResult = (result: UnitResult<Quantity>, message: string): NumericConversion => {
  if (result.status !== 'success') {
    return { status: result.status, diagnostic: result.diagnostic };
  }
  return typeof result.value.value === 'number'
    ? { value: result.value.value }
    : { status: 'unsupported', diagnostic: { code: 'REPRESENTATION_UNSUPPORTED', message } };
};

const displayQuantityOf = (binding: ParameterInputBinding, value: number, unit: string): UnitResult<Quantity> =>
  createQuantity({
    value,
    unit,
    representation: 'binary64',
    space: binding.space ?? 'linear',
    ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
    ...(binding.reference === undefined ? {} : { reference: binding.reference }),
  });

const displayToNative = (
  binding: ParameterInputBinding,
  displayValue: number,
  inputUnit: string | undefined,
): NumericConversion => {
  if (binding.nativeUnit === undefined) {
    return { value: displayValue };
  }
  const quantity = displayQuantityOf(binding, displayValue, inputUnit ?? binding.nativeUnit);
  return numericResult(
    quantity.status === 'success' ? convert({ quantity: quantity.value, to: binding.nativeUnit }) : quantity,
    'Numeric input is not executable.',
  );
};

const nativeToDisplay = (binding: ParameterInputBinding, native: number, displayUnit: string): NumericConversion => {
  const quantity = createNativeQuantity(binding, native);
  return numericResult(
    quantity.status === 'success' ? convert({ quantity: quantity.value, to: displayUnit }) : quantity,
    'Stepped value is not executable.',
  );
};

const formattedDisplay = (
  { binding, display }: Pick<ParameterInputAcknowledged, 'binding' | 'display'>,
  inputUnit: string | undefined,
  displayValue: number,
): string => {
  const quantity = displayQuantityOf(binding, displayValue, inputUnit ?? '1');
  const formatted =
    quantity.status === 'success'
      ? formatQuantity({
          quantity: quantity.value,
          unit: inputUnit ?? '1',
          locale: display.locale,
          ...(display.maximumFractionDigits === undefined
            ? {}
            : { maximumFractionDigits: display.maximumFractionDigits }),
        })
      : quantity;
  return formatted.status === 'success'
    ? formatted.value.parts.map(({ value }) => value).join('')
    : String(displayValue);
};

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
  const native =
    nativeOverride === undefined ? displayToNative(binding, displayValue, inputUnit) : { value: nativeOverride };
  if (!('value' in native)) {
    return diagnosticDraft(capture, native.status, native.diagnostic);
  }
  if (binding.representation === 'safe-integer' && !Number.isSafeInteger(native.value)) {
    return diagnosticDraft(capture, 'unsupported', {
      code: 'REPRESENTATION_UNSUPPORTED',
      message: 'Numeric input does not preserve a safe integer in the native unit.',
    });
  }
  return {
    ...capture,
    raw: formattedDisplay(context.acknowledged, inputUnit, displayValue),
    dirty: typeof acknowledgedValue !== 'number' || !Object.is(native.value, acknowledgedValue),
    status: 'complete-valid',
    resultStatus: 'success',
    nativeValue: native.value,
  };
};

export const pointerDraft = (
  context: ParameterInputMachineContext,
  event: Extract<ParameterInputMachineEvent, { type: 'pointerChanged' }>,
): ParameterInputDraft => numericDraft(context, event.value);

const clampToBounds = (constraints: ParameterInputBinding['constraints'], value: number): number => {
  const { minimum, maximum } = constraints;
  const lower = typeof minimum === 'number' && Number.isFinite(minimum) ? minimum : Number.NEGATIVE_INFINITY;
  const upper = typeof maximum === 'number' && Number.isFinite(maximum) ? maximum : Number.POSITIVE_INFINITY;
  return Math.min(upper, Math.max(lower, value));
};

export const stepDraft = (
  context: ParameterInputMachineContext,
  event: Extract<ParameterInputMachineEvent, { type: 'step' }>,
): ParameterInputDraft => {
  const { binding, display } = context.acknowledged;
  const base = context.draft?.nativeValue ?? context.acknowledged.value;
  const capture: DraftCapture = {
    raw: String(base),
    locale: display.locale,
    inputUnit: display.unit,
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
  const displayUnit = display.unit ?? binding.nativeUnit ?? '1';
  const displayBase = nativeToDisplay(binding, base, displayUnit);
  if (!('value' in displayBase)) {
    return diagnosticDraft(capture, 'unsupported', displayBase.diagnostic);
  }
  const increment = display.increment ?? 1;
  const candidateDraft = numericDraft(
    context,
    displayBase.value + event.direction * increment * (event.modifiers?.shift ? 5 : 1),
  );
  if (candidateDraft.nativeValue === undefined) {
    return candidateDraft;
  }
  const constrained = clampToBounds(binding.constraints, candidateDraft.nativeValue);
  if (Object.is(constrained, candidateDraft.nativeValue)) {
    return candidateDraft;
  }
  const displayConstrained = nativeToDisplay(binding, constrained, displayUnit);
  if (!('value' in displayConstrained)) {
    return diagnosticDraft(capture, 'unsupported', displayConstrained.diagnostic);
  }
  return numericDraft(context, displayConstrained.value, constrained);
};

export const correlated = (
  context: ParameterInputMachineContext,
  event: ParameterInputMachineEvent,
): event is Extract<ParameterInputMachineEvent, { type: 'settleSubmission' }> =>
  event.type === 'settleSubmission' &&
  context.submission?.active.request.draftGeneration === event.generation &&
  context.submission.active.request.requestId === event.outcome.requestId;

/**
 * Whether the acknowledged authority is still the one the active request was drafted against. The
 * check is field-scoped like the planner's rebase: an adopted revision with the same value matches.
 * @param context - The input workflow state.
 * @returns True when a committed settlement may advance the acknowledged value.
 */
export const authorityMatchesActive = (context: ParameterInputMachineContext): boolean => {
  const active = context.submission?.active;
  return (
    active !== undefined &&
    context.bindingAvailable &&
    sameBindingStructure(context.acknowledged.binding, active.binding) &&
    (sameIdentity(context.acknowledged.revision, active.request.expected) ||
      (active.request.base !== undefined && Object.is(context.acknowledged.value, active.request.base.value)))
  );
};

/**
 * An authority refresh that leaves this field's value and effective binding unchanged. Only the
 * revision may differ (another field, the source or the manifest moved); a draft is never stale for it.
 * @param context - The input workflow state.
 * @param event - The authority refresh.
 * @returns True when only the revision changed.
 */
export const sameAuthorityValue = (
  context: ParameterInputMachineContext,
  event: Extract<ParameterInputMachineEvent, { type: 'refreshAuthority' }>,
): boolean =>
  context.bindingAvailable &&
  event.binding !== undefined &&
  sameBindingStructure(event.binding, context.acknowledged.binding) &&
  JSON.stringify(event.binding.constraints) === JSON.stringify(context.acknowledged.binding.constraints) &&
  Object.is(event.value, context.acknowledged.value);

export const observesActiveSubmission = (
  context: ParameterInputMachineContext,
  event: ParameterInputMachineEvent,
): boolean => {
  const active = context.submission?.active;
  return (
    event.type === 'refreshAuthority' &&
    event.binding !== undefined &&
    typeof event.value === 'number' &&
    active !== undefined &&
    sameBindingStructure(event.binding, active.binding) &&
    sameBinary64Value(event.value, active.nativeValue)
  );
};

export const acknowledgedFromOutcome = (
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
