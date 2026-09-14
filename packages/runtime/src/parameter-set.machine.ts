import type { FileParameterEntry, JSONValue } from '@taucad/types';
import { fileParameterEntrySchema } from '@taucad/types';
import { assign, fromCallback, fromPromise, setup } from 'xstate';

/** Serializable identity of one persisted parameter authority target. @public */
export type ParameterSetTarget = Readonly<{
  authority: string;
  root: string;
  checkout?: string;
  entry: string;
}>;

/** Revisions covering every semantic input to a parameter operation. @public */
export type ParameterSetIdentity = Readonly<{
  sourceRevision: string;
  manifestRevision: string;
  valueRevision: string;
  dependencyRevision: string;
}>;

/** Current durable parameter record and its checked authority identity. @public */
export type ParameterSetAuthoritySnapshot = Readonly<{
  entry: FileParameterEntry;
  identity: ParameterSetIdentity;
}>;

/** One declaration-owner capability required for a source-unit transaction. @public */
export type ParameterSourceUnitCapability = Readonly<{
  producer: string;
  sourceRevision: string;
  capability: string;
}>;

/** Supported headless parameter operation intents. @public */
export type ParameterSetOperation =
  | Readonly<{
      kind: 'native-value';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
      value: JSONValue;
    }>
  | Readonly<{
      kind: 'unit-value';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
      inputUnit: string;
      value: string;
    }>
  | Readonly<{
      kind: 'batch';
      group: string;
      edits: ReadonlyArray<
        Readonly<{
          parameterId: string;
          resource: string;
          pointer: string;
          value: JSONValue;
          inputUnit?: string;
        }>
      >;
    }>
  | Readonly<{ kind: 'reset-group'; group: string }>
  | Readonly<{ kind: 'create-group'; group: string; values?: Readonly<Record<string, JSONValue>> }>
  | Readonly<{ kind: 'delete-group'; group: string }>
  | Readonly<{ kind: 'select-group'; group: string }>
  | Readonly<{ kind: 'rename-group'; group: string; nextGroup: string }>
  | Readonly<{
      kind: 'confirm-inference';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
    }>
  | Readonly<{
      kind: 'source-unit';
      mode: 'preserve-size' | 'reinterpret';
      group: string;
      parameterId: string;
      resource: string;
      pointer: string;
      unit: string;
      producerCapability: ParameterSourceUnitCapability;
      dependencies: Readonly<Record<string, string>>;
    }>
  | Readonly<{ kind: 'display-preference'; parameterId: string; unit: string }>;

/** Correlated request accepted by the parameter-set owner. @public */
export type ParameterSetRequest = Readonly<{
  requestId: string;
  draftGeneration: number;
  fingerprint: string;
  expected: ParameterSetIdentity;
  pressure: 'transient' | 'final';
  operation: ParameterSetOperation;
}>;

/** Result returned by the named planning effect. @public */
export type ParameterSetPlanResult =
  | Readonly<{ status: 'ready'; proposed: ParameterSetAuthoritySnapshot }>
  | Readonly<{
      status: 'confirmation-required';
      proposed: ParameterSetAuthoritySnapshot;
      planFingerprint: string;
      producerCapability: ParameterSourceUnitCapability;
      dependencies: Readonly<Record<string, string>>;
    }>
  | Readonly<{ status: 'rejected'; code: string; message: string }>;

/** Result returned by the named checked-apply effect. @public */
export type ParameterSetApplyResult =
  | Readonly<{ status: 'applied' | 'unchanged'; current: ParameterSetAuthoritySnapshot }>
  | Readonly<{
      status: 'conflict';
      code: 'STALE_MANIFEST';
      current: ParameterSetAuthoritySnapshot;
      conflicts: readonly string[];
    }>;

/** Stable public settlement vocabulary for every submitted request. @public */
export type ParameterSetOutcome =
  | Readonly<{
      status: 'committed';
      requestId: string;
      revision: ParameterSetIdentity;
      write: 'applied' | 'authority-no-op' | 'durable-no-op' | 'reconciled';
    }>
  | Readonly<{ status: 'rejected'; requestId: string; code: string; message: string }>
  | Readonly<{ status: 'cancelled-before-apply'; requestId: string }>
  | Readonly<{ status: 'known-not-applied-failure'; requestId: string; code: string; message: string }>
  | Readonly<{ status: 'indeterminate'; requestId: string; code: string; message: string }>;

/** Input accepted when creating the parameterSetMachine actor. @public */
export type ParameterSetMachineInput = Readonly<{
  target: ParameterSetTarget;
  initialRequestId: string;
}>;

/** Serializable state owned by parameterSetMachine. @public */
export type ParameterSetMachineContext = Readonly<{
  target: ParameterSetTarget;
  resolutionGeneration: number;
  resolutionRequestId: string;
  watchGeneration: number;
  current?: ParameterSetAuthoritySnapshot;
  activeRequest?: ParameterSetRequest;
  pendingRequest?: ParameterSetRequest;
  proposed?: ParameterSetAuthoritySnapshot;
  plan?: Readonly<{
    fingerprint: string;
    producerCapability: ParameterSourceUnitCapability;
    dependencies: Readonly<Record<string, string>>;
  }>;
  outcome?: ParameterSetOutcome;
  settledRequestId?: string;
  operationIndeterminate: boolean;
  applyEscaped: boolean;
  activeRefreshPending: boolean;
  diagnostic?: Readonly<{ code: string; message: string; recoverable: boolean }>;
  refreshPending: boolean;
  watchDisconnected: boolean;
  closing: boolean;
  closeRequestId?: string;
  invalidDrafts: readonly string[];
}>;

/** Events accepted by parameterSetMachine. @public */
export type ParameterSetMachineEvent =
  | Readonly<{ type: 'resolve'; requestId: string }>
  | Readonly<{ type: 'watch.changed'; generation: number; requestId: string }>
  | Readonly<{ type: 'watch.error'; generation: number; code: string; message: string }>
  | Readonly<{ type: 'watch.retry'; requestId: string }>
  | Readonly<{ type: 'submit'; request: ParameterSetRequest }>
  | Readonly<{ type: 'confirm'; requestId: string; planFingerprint: string }>
  | Readonly<{ type: 'cancel'; requestId: string }>
  | Readonly<{ type: 'close'; requestId: string; invalidDrafts?: readonly string[] }>;

/** Immutable input for the named resolution effect. @public */
export type ParameterSetResolveInput = Readonly<{ target: ParameterSetTarget; requestId: string; generation: number }>;
/** Immutable input for the named operation-planning effect. @public */
export type ParameterSetPlanInput = Readonly<{
  target: ParameterSetTarget;
  request: ParameterSetRequest;
  current: ParameterSetAuthoritySnapshot;
}>;
/** Immutable input for the named checked-apply effect. @public */
export type ParameterSetApplyInput = Readonly<{
  target: ParameterSetTarget;
  request: ParameterSetRequest;
  expected: ParameterSetIdentity;
  proposed: ParameterSetAuthoritySnapshot;
  planFingerprint?: string;
}>;
/** Immutable input for the named reconciliation read effect. @public */
export type ParameterSetReconcileInput = Readonly<{
  target: ParameterSetTarget;
  request: ParameterSetRequest;
  expected: ParameterSetIdentity;
}>;
/** Immutable input for the named watch effect. @public */
export type ParameterSetObserveInput = Readonly<{ target: ParameterSetTarget; generation: number }>;
/** Immutable input for the named close-flush effect. @public */
export type ParameterSetFlushInput = Readonly<{
  target: ParameterSetTarget;
  requestId: string;
  invalidDrafts: readonly string[];
}>;

const resolveParameterSet = fromPromise<ParameterSetAuthoritySnapshot, ParameterSetResolveInput>(
  async (): Promise<ParameterSetAuthoritySnapshot> => {
    throw new Error('resolveParameterSet actor not provided');
  },
);
const planParameterOperation = fromPromise<ParameterSetPlanResult, ParameterSetPlanInput>(
  async (): Promise<ParameterSetPlanResult> => {
    throw new Error('planParameterOperation actor not provided');
  },
);
const applyParameterOperation = fromPromise<ParameterSetApplyResult, ParameterSetApplyInput>(
  async (): Promise<ParameterSetApplyResult> => {
    throw new Error('applyParameterOperation actor not provided');
  },
);
const readParameterSet = fromPromise<ParameterSetAuthoritySnapshot, ParameterSetReconcileInput>(
  async (): Promise<ParameterSetAuthoritySnapshot> => {
    throw new Error('readParameterSet actor not provided');
  },
);
const flushParameterSet = fromPromise<void, ParameterSetFlushInput>(async (): Promise<void> => {
  throw new Error('flushParameterSet actor not provided');
});
const observeParameterSet = fromCallback<ParameterSetMachineEvent, ParameterSetObserveInput>(() => {
  throw new Error('observeParameterSet actor not provided');
});

const hasText = (value: string | undefined): value is string => value !== undefined && value.trim().length > 0;

const validTarget = (target: ParameterSetTarget): boolean =>
  hasText(target.authority) &&
  hasText(target.root) &&
  hasText(target.entry) &&
  (target.checkout === undefined || hasText(target.checkout));

const projectTarget = (value: unknown): ParameterSetTarget => {
  if (!isRecord(value)) {
    return { authority: '', root: '', entry: '' };
  }
  return {
    authority: typeof value['authority'] === 'string' ? value['authority'] : '',
    root: typeof value['root'] === 'string' ? value['root'] : '',
    ...(typeof value['checkout'] === 'string' ? { checkout: value['checkout'] } : {}),
    entry: typeof value['entry'] === 'string' ? value['entry'] : '',
  };
};

const sameIdentity = (left: ParameterSetIdentity, right: ParameterSetIdentity): boolean =>
  left.sourceRevision === right.sourceRevision &&
  left.manifestRevision === right.manifestRevision &&
  left.valueRevision === right.valueRevision &&
  left.dependencyRevision === right.dependencyRevision;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isJsonValue = (value: unknown, ancestors = new Set<unknown>()): value is JSONValue => {
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
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
};

const sameJsonValue = (left: JSONValue, right: JSONValue): boolean => {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJsonValue(item, right[index]!))
    );
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && sameJsonValue(left[key] as JSONValue, right[key] as JSONValue))
  );
};

const isIdentity = (value: unknown): value is ParameterSetIdentity =>
  isRecord(value) &&
  hasText(typeof value['sourceRevision'] === 'string' ? value['sourceRevision'] : undefined) &&
  hasText(typeof value['manifestRevision'] === 'string' ? value['manifestRevision'] : undefined) &&
  hasText(typeof value['valueRevision'] === 'string' ? value['valueRevision'] : undefined) &&
  hasText(typeof value['dependencyRevision'] === 'string' ? value['dependencyRevision'] : undefined);

const projectIdentity = (value: unknown): ParameterSetIdentity | undefined => {
  if (!isIdentity(value)) {
    return undefined;
  }
  return {
    sourceRevision: value.sourceRevision,
    manifestRevision: value.manifestRevision,
    valueRevision: value.valueRevision,
    dependencyRevision: value.dependencyRevision,
  };
};

const hasOperationText = (operation: Readonly<Record<string, unknown>>, ...fields: readonly string[]): boolean =>
  fields.every((field) => hasText(typeof operation[field] === 'string' ? operation[field] : undefined));

const validBatchOperation = (operation: Readonly<Record<string, unknown>>): boolean =>
  hasOperationText(operation, 'group') &&
  Array.isArray(operation['edits']) &&
  operation['edits'].length > 0 &&
  operation['edits'].every(
    (edit) =>
      isRecord(edit) &&
      hasOperationText(edit, 'parameterId', 'resource', 'pointer') &&
      (edit['inputUnit'] === undefined || hasOperationText(edit, 'inputUnit')) &&
      isJsonValue(edit['value']),
  );

const validSourceUnitOperation = (operation: Readonly<Record<string, unknown>>): boolean => {
  const capability = sourceUnitCapability(operation['producerCapability']);
  const dependencies = stringRecord(operation['dependencies']);
  return (
    (operation['mode'] === 'preserve-size' || operation['mode'] === 'reinterpret') &&
    hasOperationText(operation, 'group', 'parameterId', 'resource', 'pointer', 'unit') &&
    capability !== undefined &&
    hasOperationText(capability, 'producer', 'sourceRevision', 'capability') &&
    dependencies !== undefined &&
    Object.keys(dependencies).length > 0 &&
    Object.entries(dependencies).every(([key, item]) => hasText(key) && hasText(item))
  );
};

const validOperation = (value: unknown): value is ParameterSetOperation => {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    return false;
  }
  switch (value['kind']) {
    case 'native-value': {
      return hasOperationText(value, 'group', 'parameterId', 'resource', 'pointer') && isJsonValue(value['value']);
    }
    case 'unit-value': {
      return (
        hasOperationText(value, 'group', 'parameterId', 'resource', 'pointer', 'inputUnit') &&
        typeof value['value'] === 'string'
      );
    }
    case 'batch': {
      return validBatchOperation(value);
    }
    case 'reset-group':
    case 'delete-group':
    case 'select-group': {
      return hasOperationText(value, 'group');
    }
    case 'create-group': {
      return (
        hasOperationText(value, 'group') &&
        (value['values'] === undefined || (isRecord(value['values']) && isJsonValue(value['values'])))
      );
    }
    case 'rename-group': {
      return hasOperationText(value, 'group', 'nextGroup');
    }
    case 'confirm-inference': {
      return hasOperationText(value, 'group', 'parameterId', 'resource', 'pointer');
    }
    case 'source-unit': {
      return validSourceUnitOperation(value);
    }
    case 'display-preference': {
      return hasOperationText(value, 'parameterId', 'unit');
    }
    default: {
      return false;
    }
  }
};

const validRequestShape = (request: unknown): request is ParameterSetRequest =>
  isJsonValue(request) &&
  isRecord(request) &&
  hasText(typeof request['requestId'] === 'string' ? request['requestId'] : undefined) &&
  hasText(typeof request['fingerprint'] === 'string' ? request['fingerprint'] : undefined) &&
  Number.isSafeInteger(request['draftGeneration']) &&
  Number(request['draftGeneration']) >= 0 &&
  isIdentity(request['expected']) &&
  (request['pressure'] === 'transient' || request['pressure'] === 'final') &&
  validOperation(request['operation']);

const sameRequestDelivery = (left: ParameterSetRequest, right: ParameterSetRequest): boolean =>
  sameJsonValue(left as unknown as JSONValue, right as unknown as JSONValue);

const projectSnapshot = (value: unknown): ParameterSetAuthoritySnapshot | undefined => {
  try {
    if (!isRecord(value) || !isJsonValue(value['entry'])) {
      return undefined;
    }
    const identity = projectIdentity(value['identity']);
    const parsed = fileParameterEntrySchema.safeParse(value['entry']);
    if (
      identity === undefined ||
      !parsed.success ||
      (parsed.data.identity !== undefined && !sameIdentity(parsed.data.identity, identity))
    ) {
      return undefined;
    }
    return { entry: structuredClone(parsed.data), identity };
  } catch {
    return undefined;
  }
};

const validSnapshot = (value: unknown): value is ParameterSetAuthoritySnapshot => projectSnapshot(value) !== undefined;

const hasDurableReceipt = (snapshot: ParameterSetAuthoritySnapshot, request: ParameterSetRequest): boolean => {
  const { lastOperation } = snapshot.entry;
  return (
    lastOperation !== undefined &&
    lastOperation.requestId === request.requestId &&
    lastOperation.fingerprint === request.fingerprint &&
    sameIdentity(lastOperation, snapshot.identity)
  );
};

const hasDurableReceiptCollision = (snapshot: ParameterSetAuthoritySnapshot, request: ParameterSetRequest): boolean => {
  const { lastOperation } = snapshot.entry;
  return (
    lastOperation !== undefined &&
    lastOperation.requestId === request.requestId &&
    lastOperation.fingerprint !== request.fingerprint &&
    sameIdentity(lastOperation, snapshot.identity)
  );
};

const validRequest = (
  request: ParameterSetRequest | undefined,
  current: ParameterSetAuthoritySnapshot | undefined,
): boolean => validRequestShape(request) && current !== undefined && sameIdentity(request.expected, current.identity);

const sameAuthoritySnapshot = (left: ParameterSetAuthoritySnapshot, right: ParameterSetAuthoritySnapshot): boolean =>
  sameIdentity(left.identity, right.identity) &&
  sameJsonValue(left.entry as unknown as JSONValue, right.entry as unknown as JSONValue);

const sameOptionalJson = (left: JSONValue | undefined, right: JSONValue | undefined): boolean =>
  left === undefined || right === undefined ? left === right : sameJsonValue(left, right);

const validCreateGroupPlan = (
  current: ParameterSetAuthoritySnapshot,
  proposed: ParameterSetAuthoritySnapshot,
  operation: Extract<ParameterSetOperation, Readonly<{ kind: 'create-group' }>>,
): boolean => {
  const { group, values } = operation;
  const currentGroups = current.entry.groups;
  const proposedGroups = proposed.entry.groups;
  const currentNames = Object.keys(currentGroups);
  return (
    !Object.hasOwn(currentGroups, group) &&
    Object.keys(proposedGroups).length === currentNames.length + 1 &&
    currentNames.every((name) =>
      sameJsonValue(currentGroups[name] as unknown as JSONValue, proposedGroups[name] as unknown as JSONValue),
    ) &&
    sameJsonValue(proposedGroups[group] as unknown as JSONValue, { values: values ?? {} } as unknown as JSONValue) &&
    proposed.entry.activeGroup === current.entry.activeGroup &&
    sameOptionalJson(current.entry.order, proposed.entry.order)
  );
};

const validDeleteGroupPlan = (
  current: ParameterSetAuthoritySnapshot,
  proposed: ParameterSetAuthoritySnapshot,
  group: string,
): boolean => {
  const currentGroups = current.entry.groups;
  const proposedGroups = proposed.entry.groups;
  const retainedNames = Object.keys(currentGroups).filter((name) => name !== group);
  return (
    Object.hasOwn(currentGroups, group) &&
    !Object.hasOwn(proposedGroups, group) &&
    Object.keys(proposedGroups).length === retainedNames.length &&
    retainedNames.every((name) =>
      sameJsonValue(currentGroups[name] as unknown as JSONValue, proposedGroups[name] as unknown as JSONValue),
    ) &&
    proposed.entry.activeGroup === current.entry.activeGroup &&
    sameOptionalJson(
      current.entry.order?.filter((name) => name !== group),
      proposed.entry.order,
    )
  );
};

const sameGroups = (
  left: FileParameterEntry['groups'],
  right: FileParameterEntry['groups'],
  excluded = new Set<string>(),
): boolean => {
  const leftNames = Object.keys(left).filter((name) => !excluded.has(name));
  const rightNames = Object.keys(right).filter((name) => !excluded.has(name));
  return (
    leftNames.length === rightNames.length &&
    leftNames.every(
      (name) =>
        Object.hasOwn(right, name) &&
        sameJsonValue(left[name] as unknown as JSONValue, right[name] as unknown as JSONValue),
    )
  );
};

const validSelectGroupPlan = (
  current: ParameterSetAuthoritySnapshot,
  proposed: ParameterSetAuthoritySnapshot,
  group: string,
): boolean =>
  proposed.entry.activeGroup === group &&
  sameGroups(current.entry.groups, proposed.entry.groups) &&
  sameOptionalJson(current.entry.order, proposed.entry.order);

const validRenameGroupPlan = (
  current: ParameterSetAuthoritySnapshot,
  proposed: ParameterSetAuthoritySnapshot,
  operation: Extract<ParameterSetOperation, Readonly<{ kind: 'rename-group' }>>,
): boolean => {
  const { group, nextGroup } = operation;
  if (group === nextGroup) {
    return (
      sameGroups(current.entry.groups, proposed.entry.groups) &&
      proposed.entry.activeGroup === current.entry.activeGroup &&
      sameOptionalJson(current.entry.order, proposed.entry.order)
    );
  }
  const expectedActive = current.entry.activeGroup === group ? nextGroup : current.entry.activeGroup;
  return (
    !Object.hasOwn(proposed.entry.groups, group) &&
    Object.hasOwn(proposed.entry.groups, nextGroup) &&
    Object.keys(proposed.entry.groups).length === Object.keys(current.entry.groups).length &&
    sameGroups(current.entry.groups, proposed.entry.groups, new Set([group, nextGroup])) &&
    sameJsonValue(
      current.entry.groups[group] as unknown as JSONValue,
      proposed.entry.groups[nextGroup] as unknown as JSONValue,
    ) &&
    proposed.entry.activeGroup === expectedActive &&
    sameOptionalJson(
      current.entry.order?.map((name) => (name === group ? nextGroup : name)),
      proposed.entry.order,
    )
  );
};

const validResetGroupPlan = (
  current: ParameterSetAuthoritySnapshot,
  proposed: ParameterSetAuthoritySnapshot,
  group: string,
): boolean =>
  Object.hasOwn(proposed.entry.groups, group) &&
  Object.keys(proposed.entry.groups).length === Object.keys(current.entry.groups).length &&
  sameGroups(current.entry.groups, proposed.entry.groups, new Set([group])) &&
  proposed.entry.activeGroup === current.entry.activeGroup &&
  sameOptionalJson(current.entry.order, proposed.entry.order);

const validGroupPlan = (
  plan: ParameterSetPlanResult,
  request: ParameterSetRequest,
  current: ParameterSetAuthoritySnapshot,
): boolean => {
  if (plan.status !== 'ready') {
    return true;
  }
  if (request.operation.kind === 'create-group') {
    return validCreateGroupPlan(current, plan.proposed, request.operation);
  }
  if (request.operation.kind === 'delete-group') {
    return validDeleteGroupPlan(current, plan.proposed, request.operation.group);
  }
  if (request.operation.kind === 'select-group') {
    return validSelectGroupPlan(current, plan.proposed, request.operation.group);
  }
  if (request.operation.kind === 'rename-group') {
    return validRenameGroupPlan(current, plan.proposed, request.operation);
  }
  if (request.operation.kind === 'reset-group') {
    return validResetGroupPlan(current, plan.proposed, request.operation.group);
  }
  return true;
};

const validPlan = (
  plan: ParameterSetPlanResult,
  request: ParameterSetRequest,
  current: ParameterSetAuthoritySnapshot,
): boolean => {
  if (plan.status === 'rejected') {
    return hasText(plan.code) && hasText(plan.message);
  }
  if (!validSnapshot(plan.proposed) || !hasDurableReceipt(plan.proposed, request)) {
    return false;
  }
  if (plan.status === 'ready') {
    return request.operation.kind !== 'source-unit' && validGroupPlan(plan, request, current);
  }
  return (
    request.operation.kind === 'source-unit' &&
    hasText(plan.planFingerprint) &&
    hasText(plan.producerCapability.producer) &&
    hasText(plan.producerCapability.sourceRevision) &&
    hasText(plan.producerCapability.capability) &&
    Object.keys(plan.dependencies).length > 0 &&
    Object.entries(plan.dependencies).every(([key, value]) => hasText(key) && hasText(value)) &&
    JSON.stringify(plan.producerCapability) === JSON.stringify(request.operation.producerCapability) &&
    JSON.stringify(plan.dependencies) === JSON.stringify(request.operation.dependencies)
  );
};

const isSemanticNoopPlan = (
  plan: ParameterSetPlanResult,
  request: ParameterSetRequest,
  current: ParameterSetAuthoritySnapshot,
): boolean =>
  plan.status === 'ready' &&
  request.operation.kind !== 'source-unit' &&
  request.operation.kind !== 'create-group' &&
  request.operation.kind !== 'delete-group' &&
  validSnapshot(plan.proposed) &&
  validGroupPlan(plan, request, current) &&
  sameAuthoritySnapshot(plan.proposed, current);

const eventRecord = (event: unknown, type: string): Readonly<Record<string, unknown>> | undefined =>
  isRecord(event) && event['type'] === type ? event : undefined;

const actorError = (event: unknown, type: string): unknown => eventRecord(event, type)?.['error'];

const submittedRequestId = (event: unknown): string => {
  const request = eventRecord(event, 'submit')?.['request'];
  if (!isRecord(request)) {
    return 'unknown';
  }
  const requestId = typeof request['requestId'] === 'string' ? request['requestId'] : undefined;
  return hasText(requestId) ? requestId : 'unknown';
};

const groupOperationRejection = (
  request: ParameterSetRequest | undefined,
  current: ParameterSetAuthoritySnapshot | undefined,
): Readonly<{ code: string; message: string }> | undefined => {
  if (request === undefined || current === undefined || !validRequest(request, current)) {
    return undefined;
  }
  const { operation } = request;
  if (operation.kind === 'create-group' && Object.hasOwn(current.entry.groups, operation.group)) {
    return { code: 'GROUP_ALREADY_EXISTS', message: `Parameter group "${operation.group}" already exists.` };
  }
  if (operation.kind === 'select-group' || operation.kind === 'reset-group') {
    return Object.hasOwn(current.entry.groups, operation.group)
      ? undefined
      : { code: 'GROUP_NOT_FOUND', message: `Parameter group "${operation.group}" does not exist.` };
  }
  if (operation.kind === 'rename-group') {
    if (!Object.hasOwn(current.entry.groups, operation.group)) {
      return { code: 'GROUP_NOT_FOUND', message: `Parameter group "${operation.group}" does not exist.` };
    }
    return operation.nextGroup !== operation.group && Object.hasOwn(current.entry.groups, operation.nextGroup)
      ? { code: 'GROUP_ALREADY_EXISTS', message: `Parameter group "${operation.nextGroup}" already exists.` }
      : undefined;
  }
  if (operation.kind !== 'delete-group') {
    return undefined;
  }
  if (!Object.hasOwn(current.entry.groups, operation.group)) {
    return { code: 'GROUP_NOT_FOUND', message: `Parameter group "${operation.group}" does not exist.` };
  }
  if (Object.keys(current.entry.groups).length === 1) {
    return { code: 'LAST_GROUP_DELETE', message: 'The last parameter group cannot be deleted.' };
  }
  return operation.group === current.entry.activeGroup
    ? { code: 'ACTIVE_GROUP_DELETE', message: 'The active parameter group cannot be deleted.' }
    : undefined;
};

const resolutionOutput = (event: unknown): ParameterSetAuthoritySnapshot | undefined => {
  const output = eventRecord(event, 'xstate.done.actor.resolve-parameter-set')?.['output'];
  return projectSnapshot(output);
};

const readbackOutput = (event: unknown): ParameterSetAuthoritySnapshot | undefined => {
  const output = eventRecord(event, 'xstate.done.actor.read-parameter-set')?.['output'];
  return projectSnapshot(output);
};

const sourceUnitCapability = (value: unknown): ParameterSourceUnitCapability | undefined => {
  if (
    !isRecord(value) ||
    typeof value['producer'] !== 'string' ||
    typeof value['sourceRevision'] !== 'string' ||
    typeof value['capability'] !== 'string'
  ) {
    return undefined;
  }
  return { producer: value['producer'], sourceRevision: value['sourceRevision'], capability: value['capability'] };
};

const stringRecord = (value: unknown): Readonly<Record<string, string>> | undefined => {
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === 'string')) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
};

const planOutput = (event: unknown): ParameterSetPlanResult | undefined => {
  const output = eventRecord(event, 'xstate.done.actor.plan-operation')?.['output'];
  if (!isRecord(output)) {
    return undefined;
  }
  if (output['status'] === 'rejected' && typeof output['code'] === 'string' && typeof output['message'] === 'string') {
    return { status: 'rejected', code: output['code'], message: output['message'] };
  }
  const proposed = projectSnapshot(output['proposed']);
  if (proposed === undefined) {
    return undefined;
  }
  if (output['status'] === 'ready') {
    return { status: 'ready', proposed };
  }
  const capability = sourceUnitCapability(output['producerCapability']);
  const dependencies = stringRecord(output['dependencies']);
  if (
    output['status'] !== 'confirmation-required' ||
    typeof output['planFingerprint'] !== 'string' ||
    capability === undefined ||
    dependencies === undefined
  ) {
    return undefined;
  }
  return {
    status: 'confirmation-required',
    proposed,
    planFingerprint: output['planFingerprint'],
    producerCapability: capability,
    dependencies,
  };
};

const applyOutput = (event: unknown): ParameterSetApplyResult | undefined => {
  const output = eventRecord(event, 'xstate.done.actor.apply-operation')?.['output'];
  if (!isRecord(output)) {
    return undefined;
  }
  const current = projectSnapshot(output['current']);
  if (current === undefined) {
    return undefined;
  }
  if (output['status'] === 'applied' || output['status'] === 'unchanged') {
    return { status: output['status'], current };
  }
  if (
    output['status'] === 'conflict' &&
    output['code'] === 'STALE_MANIFEST' &&
    Array.isArray(output['conflicts']) &&
    output['conflicts'].every((item) => typeof item === 'string')
  ) {
    return {
      status: 'conflict',
      code: 'STALE_MANIFEST',
      current,
      conflicts: [...output['conflicts']],
    };
  }
  return undefined;
};

const applicationState = (error: unknown): 'known-not-applied' | 'potentially-applied' | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  try {
    const state = 'applicationState' in error ? error.applicationState : undefined;
    return state === 'known-not-applied' || state === 'potentially-applied' ? state : undefined;
  } catch {
    return undefined;
  }
};

const diagnosticText = (value: unknown, fallback: string, maximum = 512): string => {
  try {
    const text = typeof value === 'string' ? value : String(value);
    return (text.trim().length === 0 ? fallback : text).slice(0, maximum);
  } catch {
    return fallback;
  }
};

const errorDetails = (error: unknown, fallbackCode: string): Readonly<{ code: string; message: string }> => {
  try {
    if (typeof error !== 'object' || error === null) {
      return {
        code: fallbackCode,
        message: diagnosticText(error, `${fallbackCode} failure.`),
      };
    }
    const code = 'code' in error ? diagnosticText(error.code, fallbackCode, 128) : fallbackCode;
    const message = 'message' in error ? diagnosticText(error.message, `${code} failure.`) : `${code} failure.`;
    return { code, message };
  } catch {
    return { code: fallbackCode, message: `${fallbackCode} failure.` };
  }
};

const initialContext = ({ input }: { input: ParameterSetMachineInput }): ParameterSetMachineContext => ({
  target: projectTarget(input.target),
  resolutionGeneration: 0,
  resolutionRequestId: input.initialRequestId,
  watchGeneration: 0,
  refreshPending: false,
  watchDisconnected: false,
  operationIndeterminate: false,
  applyEscaped: false,
  activeRefreshPending: false,
  closing: false,
  invalidDrafts: [],
});

/**
 * Portable owner for resolution, sequencing, checked apply, reconciliation, and close of one parameter authority target.
 *
 * External I/O is supplied through named actors. Context, inputs, operations, outcomes, and effect inputs remain
 * serializable, and every suspended effect receives an immutable operation snapshot.
 *
 * @public
 */
export const parameterSetMachine = setup({
  // oxlint-disable typescript/consistent-type-assertions -- XState setup uses phantom values to bind public types.
  types: {
    context: {} as ParameterSetMachineContext,
    events: {} as ParameterSetMachineEvent,
    input: {} as ParameterSetMachineInput,
  },
  // oxlint-enable typescript/consistent-type-assertions
  actors: {
    applyParameterOperation,
    flushParameterSet,
    observeParameterSet,
    planParameterOperation,
    readParameterSet,
    resolveParameterSet,
  },
  guards: {
    hasValidInput: ({ context }) => validTarget(context.target) && hasText(context.resolutionRequestId),
    validSubmittedRequest: ({ event }) => event.type === 'submit' && validRequestShape(event.request),
    isActiveDuplicateSubmission: ({ context, event }) =>
      event.type === 'submit' &&
      validRequestShape(event.request) &&
      context.activeRequest !== undefined &&
      sameRequestDelivery(context.activeRequest, event.request),
    isPendingDuplicateSubmission: ({ context, event }) =>
      event.type === 'submit' &&
      validRequestShape(event.request) &&
      context.pendingRequest !== undefined &&
      sameRequestDelivery(context.pendingRequest, event.request),
    isDurableReplaySubmission: ({ context, event }) =>
      event.type === 'submit' &&
      validRequestShape(event.request) &&
      context.current !== undefined &&
      hasDurableReceipt(context.current, event.request),
    hasRequestIdCollision: ({ context, event }) =>
      event.type === 'submit' &&
      validRequestShape(event.request) &&
      ((context.activeRequest?.requestId === event.request.requestId &&
        !sameRequestDelivery(context.activeRequest, event.request)) ||
        (context.pendingRequest?.requestId === event.request.requestId &&
          !sameRequestDelivery(context.pendingRequest, event.request)) ||
        (context.current !== undefined && hasDurableReceiptCollision(context.current, event.request))),
    canQueueSubmittedRequest: ({ context, event }) =>
      event.type === 'submit' && !context.closing && validRequestShape(event.request),
    hasCurrentRequest: ({ context }) => validRequest(context.activeRequest, context.current),
    hasEscapedActiveRequest: ({ context }) => context.activeRequest !== undefined && context.applyEscaped,
    hasSettledActiveRequest: ({ context }) =>
      context.activeRequest !== undefined && context.settledRequestId === context.activeRequest.requestId,
    hasPreApplyActiveRequest: ({ context }) =>
      context.activeRequest !== undefined &&
      context.settledRequestId !== context.activeRequest.requestId &&
      !context.applyEscaped &&
      !context.operationIndeterminate,
    isDisplayOnly: ({ context }) => context.activeRequest?.operation.kind === 'display-preference',
    hasDurableRequestReceipt: ({ context }) =>
      context.current !== undefined &&
      context.activeRequest !== undefined &&
      hasDurableReceipt(context.current, context.activeRequest),
    planRejected: ({ event }) => planOutput(event)?.status === 'rejected',
    planIsSemanticNoop: ({ context, event }) => {
      const plan = planOutput(event);
      return (
        !context.refreshPending &&
        plan !== undefined &&
        context.activeRequest !== undefined &&
        context.current !== undefined &&
        isSemanticNoopPlan(plan, context.activeRequest, context.current)
      );
    },
    planIsStaleSemanticNoop: ({ context, event }) => {
      const plan = planOutput(event);
      return (
        context.refreshPending &&
        plan !== undefined &&
        context.activeRequest !== undefined &&
        context.current !== undefined &&
        isSemanticNoopPlan(plan, context.activeRequest, context.current)
      );
    },
    planReady: ({ context, event }) => {
      const plan = planOutput(event);
      return (
        context.activeRequest !== undefined &&
        context.current !== undefined &&
        plan?.status === 'ready' &&
        validPlan(plan, context.activeRequest, context.current)
      );
    },
    planNeedsConfirmation: ({ context, event }) => {
      const plan = planOutput(event);
      return (
        context.activeRequest !== undefined &&
        plan?.status === 'confirmation-required' &&
        context.current !== undefined &&
        validPlan(plan, context.activeRequest, context.current)
      );
    },
    invalidGroupOperation: ({ context }) =>
      groupOperationRejection(context.activeRequest, context.current) !== undefined,
    matchingConfirmation: ({ context, event }) =>
      event.type === 'confirm' &&
      context.activeRequest?.requestId === event.requestId &&
      context.plan?.fingerprint === event.planFingerprint,
    matchingCancellation: ({ context, event }) =>
      event.type === 'cancel' && context.activeRequest?.requestId === event.requestId,
    matchingActiveRefreshCancellation: ({ context, event }) =>
      event.type === 'cancel' &&
      context.activeRefreshPending &&
      context.activeRequest?.requestId === event.requestId &&
      context.settledRequestId !== event.requestId,
    matchingPendingCancellation: ({ context, event }) =>
      event.type === 'cancel' && context.pendingRequest?.requestId === event.requestId,
    applyCommitted: ({ context, event }) => {
      const result = applyOutput(event);
      return (
        result !== undefined &&
        result.status !== 'conflict' &&
        context.activeRequest !== undefined &&
        hasDurableReceipt(result.current, context.activeRequest)
      );
    },
    applyConflict: ({ event }) => applyOutput(event)?.status === 'conflict',
    knownNotApplied: ({ event }) =>
      applicationState(actorError(event, 'xstate.error.actor.apply-operation')) === 'known-not-applied',
    reconcileCommitted: ({ context, event }) => {
      const current = readbackOutput(event);
      return (
        current !== undefined &&
        context.activeRequest !== undefined &&
        hasDurableReceipt(current, context.activeRequest)
      );
    },
    reconcileKnownNotApplied: ({ context, event }) => {
      const current = readbackOutput(event);
      return (
        current !== undefined &&
        context.activeRequest !== undefined &&
        sameIdentity(current.identity, context.activeRequest.expected)
      );
    },
    currentWatchGeneration: ({ context, event }) =>
      (event.type === 'watch.changed' || event.type === 'watch.error') && event.generation === context.watchGeneration,
    isClosing: ({ context }) => context.closing,
    isClosingWithoutIndeterminate: ({ context }) => context.closing && !context.operationIndeterminate,
    isReconnectRequested: ({ context }) => !context.watchDisconnected,
    isWatchDisconnected: ({ context }) => context.watchDisconnected,
    needsRefresh: ({ context }) => context.refreshPending,
    hasPendingRequest: ({ context }) => context.pendingRequest !== undefined,
    isClosingWithPending: ({ context }) => context.closing && context.pendingRequest !== undefined,
    hasIndeterminateOperation: ({ context }) => context.operationIndeterminate,
    needsActiveRefreshCheck: ({ context }) => context.activeRefreshPending,
    validResolutionNeedsRefresh: ({ context, event }) =>
      resolutionOutput(event) !== undefined && context.refreshPending,
  },
  actions: {
    acceptResolution: assign(({ event }) => {
      const current = resolutionOutput(event);
      if (current === undefined) {
        return {
          current: undefined,
          diagnostic: {
            code: 'INVALID_RESOLUTION',
            message: 'Resolution returned an invalid parameter record.',
            recoverable: true,
          },
        };
      }
      return { current: structuredClone(current), diagnostic: undefined };
    }),
    failResolution: assign(({ event }) => {
      const details = errorDetails(actorError(event, 'xstate.error.actor.resolve-parameter-set'), 'RESOLUTION_FAILED');
      return { diagnostic: { ...details, recoverable: true } };
    }),
    beginResolution: assign(({ context, event }) => ({
      resolutionGeneration: context.resolutionGeneration + 1,
      resolutionRequestId: event.type === 'resolve' ? event.requestId : context.resolutionRequestId,
      refreshPending: false,
    })),
    markWatchRefresh: assign(({ context, event }) => ({
      refreshPending: true,
      resolutionRequestId: event.type === 'watch.changed' ? event.requestId : context.resolutionRequestId,
    })),
    reportWatchFailure: assign(({ event }) => {
      const details =
        event.type === 'watch.error'
          ? {
              code: diagnosticText(event.code, 'WATCH_FAILED', 128),
              message: diagnosticText(event.message, 'Parameter watch failed.'),
            }
          : errorDetails(actorError(event, 'xstate.error.actor.observe-parameter-set'), 'WATCH_FAILED');
      return { watchDisconnected: true, diagnostic: { ...details, recoverable: true } };
    }),
    retryWatch: assign(({ context, event }) => ({
      watchGeneration: context.watchGeneration + 1,
      resolutionGeneration: context.resolutionGeneration + 1,
      resolutionRequestId: event.type === 'watch.retry' ? event.requestId : context.resolutionRequestId,
      diagnostic: undefined,
      refreshPending: false,
      watchDisconnected: false,
    })),
    acceptRequest: assign(({ event }) => ({
      activeRequest:
        event.type === 'submit' && validRequestShape(event.request) ? structuredClone(event.request) : undefined,
      outcome: undefined,
      settledRequestId: undefined,
      proposed: undefined,
      plan: undefined,
      operationIndeterminate: false,
      applyEscaped: false,
    })),
    queueRequest: assign(({ context, event }) => {
      if (event.type !== 'submit' || !validRequestShape(event.request) || context.closing) {
        return {};
      }
      if (context.pendingRequest?.pressure === 'final' && event.request.pressure === 'transient') {
        return {
          outcome: { status: 'cancelled-before-apply', requestId: event.request.requestId } as const,
        };
      }
      return {
        pendingRequest: structuredClone(event.request),
        ...(context.pendingRequest === undefined
          ? {}
          : {
              outcome: {
                status: 'cancelled-before-apply',
                requestId: context.pendingRequest.requestId,
              } as const,
            }),
      };
    }),
    promotePendingRequest: assign(({ context }) => ({
      activeRequest: context.pendingRequest,
      pendingRequest: undefined,
      proposed: undefined,
      plan: undefined,
      outcome: undefined,
      settledRequestId: undefined,
      operationIndeterminate: false,
      applyEscaped: false,
    })),
    beginPendingRefresh: assign(({ context }) => ({
      resolutionGeneration: context.resolutionGeneration + 1,
      refreshPending: false,
      applyEscaped: false,
    })),
    beginActiveRefresh: assign(({ context }) => ({
      resolutionGeneration: context.resolutionGeneration + 1,
      refreshPending: false,
      activeRefreshPending: true,
      proposed: undefined,
      plan: undefined,
      applyEscaped: false,
    })),
    completeActiveRefresh: assign(() => ({ activeRefreshPending: false })),
    cancelActiveRefresh: assign(({ context }) => ({
      activeRefreshPending: false,
      refreshPending: true,
      outcome: {
        status: 'cancelled-before-apply',
        requestId: context.activeRequest?.requestId ?? 'unknown',
      } as const,
    })),
    acceptReadyPlan: assign(({ event }) => {
      const plan = planOutput(event);
      return plan?.status === 'ready' ? { proposed: structuredClone(plan.proposed), plan: undefined } : {};
    }),
    acceptConfirmationPlan: assign(({ event }) => {
      const plan = planOutput(event);
      if (plan?.status !== 'confirmation-required') {
        return {};
      }
      return {
        proposed: structuredClone(plan.proposed),
        plan: {
          fingerprint: plan.planFingerprint,
          producerCapability: structuredClone(plan.producerCapability),
          dependencies: structuredClone(plan.dependencies),
        },
      };
    }),
    rejectPlan: assign(({ context, event }) => {
      const requestId = context.activeRequest?.requestId ?? 'unknown';
      const plan = planOutput(event);
      if (plan?.status !== 'rejected') {
        return {
          outcome: {
            status: 'rejected',
            requestId,
            code: 'INVALID_PLAN',
            message: 'Planning returned an invalid result.',
          } as const,
        };
      }
      return { outcome: { status: 'rejected', requestId, code: plan.code, message: plan.message } as const };
    }),
    rejectInvalidPlan: assign(({ context }) => ({
      outcome: {
        status: 'rejected',
        requestId: context.activeRequest?.requestId ?? 'unknown',
        code: 'INVALID_PLAN',
        message: 'Planning returned an invalid or uncorrelated complete-record proposal.',
      } as const,
    })),
    rejectPlanFailure: assign(({ context, event }) => {
      const details = errorDetails(actorError(event, 'xstate.error.actor.plan-operation'), 'PLAN_FAILED');
      return {
        outcome: {
          status: 'rejected',
          requestId: context.activeRequest?.requestId ?? 'unknown',
          ...details,
        } as const,
      };
    }),
    rejectInvalidRequest: assign(({ context }) => ({
      outcome: {
        status: 'rejected',
        requestId: context.activeRequest?.requestId ?? 'unknown',
        code: 'STALE_MANIFEST',
        message: 'The request does not match the current authority identity.',
      } as const,
    })),
    rejectDisplayOnly: assign(({ context }) => ({
      outcome: {
        status: 'rejected',
        requestId: context.activeRequest?.requestId ?? 'unknown',
        code: 'DISPLAY_ONLY_ACTION',
        message: 'Display preferences are not persisted parameter operations.',
      } as const,
    })),
    rejectGroupOperation: assign(({ context }) => {
      const rejection = groupOperationRejection(context.activeRequest, context.current) ?? {
        code: 'INVALID_GROUP_OPERATION',
        message: 'The group operation is invalid for the current parameter record.',
      };
      return {
        outcome: {
          status: 'rejected',
          requestId: context.activeRequest?.requestId ?? 'unknown',
          ...rejection,
        } as const,
      };
    }),
    rejectUnavailable: assign(({ context, event }) => ({
      outcome: {
        status: 'rejected',
        requestId:
          event.type === 'submit' ? submittedRequestId(event) : (context.activeRequest?.requestId ?? 'unknown'),
        code: 'WATCH_UNAVAILABLE',
        message: 'Parameter admission is paused until the authority watch is resubscribed and current state is read.',
      } as const,
    })),
    rejectMalformedSubmission: assign(({ event }) => ({
      outcome: {
        status: 'rejected',
        requestId: submittedRequestId(event),
        code: 'INVALID_REQUEST',
        message: 'The request must be a supported, finite, JSON-serializable parameter operation.',
      } as const,
    })),
    rejectRequestIdCollision: assign(({ event }) => ({
      outcome: {
        status: 'rejected',
        requestId: submittedRequestId(event),
        code: 'REQUEST_ID_COLLISION',
        message: 'The request ID is already in use by a different parameter operation.',
      } as const,
    })),
    rejectClosingSubmission: assign(({ event }) => ({
      outcome: {
        status: 'rejected',
        requestId: submittedRequestId(event),
        code: 'OWNER_CLOSING',
        message: 'The parameter authority owner is closing and cannot admit new work.',
      } as const,
    })),
    rejectIndeterminateSubmission: assign(({ event }) => ({
      outcome: {
        status: 'rejected',
        requestId: submittedRequestId(event),
        code: 'APPLY_INDETERMINATE',
        message: 'A prior operation remains indeterminate and blocks new admission.',
      } as const,
    })),
    rejectConfirmation: assign(({ context }) => ({
      outcome: {
        status: 'rejected',
        requestId: context.activeRequest?.requestId ?? 'unknown',
        code: 'PLAN_CHANGED',
        message: 'The confirmation does not match the current source-unit plan.',
      } as const,
    })),
    commitDurableNoop: assign(({ context }) => ({
      outcome: {
        status: 'committed',
        requestId: context.activeRequest!.requestId,
        revision: context.current!.identity,
        write: 'durable-no-op',
      } as const,
    })),
    settleDurableReplay: assign(({ context, event }) => ({
      outcome: {
        status: 'committed',
        requestId: submittedRequestId(event),
        revision: structuredClone(context.current!.identity),
        write: 'durable-no-op',
      } as const,
    })),
    commitAuthorityNoop: assign(({ context }) => ({
      outcome: {
        status: 'committed',
        requestId: context.activeRequest!.requestId,
        revision: structuredClone(context.current!.identity),
        write: 'authority-no-op',
      } as const,
    })),
    commitApply: assign(({ context, event }) => {
      const result = applyOutput(event);
      if (result === undefined || result.status === 'conflict') {
        return {};
      }
      return {
        current: structuredClone(result.current),
        operationIndeterminate: false,
        outcome: {
          status: 'committed',
          requestId: context.activeRequest!.requestId,
          revision: structuredClone(result.current.identity),
          write: result.status === 'unchanged' ? 'durable-no-op' : 'applied',
        } as const,
      };
    }),
    rejectConflict: assign(({ context, event }) => {
      const result = applyOutput(event);
      return {
        current: result?.status === 'conflict' ? structuredClone(result.current) : context.current,
        outcome: {
          status: 'rejected',
          requestId: context.activeRequest?.requestId ?? 'unknown',
          code: 'STALE_MANIFEST',
          message: 'The authority rejected stale parameter revisions.',
        } as const,
      };
    }),
    failKnownNotApplied: assign(({ context, event }) => {
      const details = errorDetails(actorError(event, 'xstate.error.actor.apply-operation'), 'APPLY_FAILED');
      return {
        outcome: {
          status: 'known-not-applied-failure',
          requestId: context.activeRequest?.requestId ?? 'unknown',
          ...details,
        } as const,
      };
    }),
    markPotentialApplyFailure: assign(({ event }) => {
      const details = errorDetails(actorError(event, 'xstate.error.actor.apply-operation'), 'APPLY_FAILED');
      return {
        operationIndeterminate: true,
        diagnostic: { ...details, recoverable: true },
      };
    }),
    markApplyEscaped: assign(() => ({ applyEscaped: true })),
    retireSettledOperation: assign(({ context }) => ({
      applyEscaped: false,
      settledRequestId: context.activeRequest?.requestId,
    })),
    markInvalidApplyResult: assign(() => ({
      operationIndeterminate: true,
      diagnostic: {
        code: 'INVALID_APPLY_RESULT',
        message: 'Checked apply returned an invalid authority snapshot; reconciliation is required.',
        recoverable: true,
      },
    })),
    commitReconciled: assign(({ context, event }) => {
      const current = readbackOutput(event) ?? context.current!;
      return {
        current: structuredClone(current),
        operationIndeterminate: false,
        outcome: {
          status: 'committed',
          requestId: context.activeRequest!.requestId,
          revision: structuredClone(current.identity),
          write: 'reconciled',
        } as const,
      };
    }),
    reconcileNotApplied: assign(({ context, event }) => {
      const current = readbackOutput(event) ?? context.current;
      return {
        current: current === undefined ? undefined : structuredClone(current),
        operationIndeterminate: false,
        outcome: {
          status: 'known-not-applied-failure',
          requestId: context.activeRequest?.requestId ?? 'unknown',
          code: 'APPLY_NOT_OBSERVED',
          message: 'Readback proved the operation was not applied.',
        } as const,
      };
    }),
    markIndeterminate: assign(({ context }) => ({
      operationIndeterminate: true,
      outcome: {
        status: 'indeterminate',
        requestId: context.activeRequest?.requestId ?? 'unknown',
        code: 'APPLY_INDETERMINATE',
        message: 'Readback could not prove whether the checked operation applied.',
      } as const,
    })),
    markReconcileFailure: assign(({ context, event }) => {
      const details = errorDetails(actorError(event, 'xstate.error.actor.read-parameter-set'), 'RECONCILIATION_FAILED');
      return {
        operationIndeterminate: true,
        outcome: {
          status: 'indeterminate',
          requestId: context.activeRequest?.requestId ?? 'unknown',
          ...details,
        } as const,
      };
    }),
    cancelBeforeApply: assign(({ context }) => ({
      outcome: { status: 'cancelled-before-apply', requestId: context.activeRequest?.requestId ?? 'unknown' } as const,
    })),
    cancelPendingRequest: assign(({ context }) => ({
      pendingRequest: undefined,
      outcome: {
        status: 'cancelled-before-apply',
        requestId: context.pendingRequest?.requestId ?? 'unknown',
      } as const,
    })),
    beginClose: assign(({ context, event }) => ({
      closing: true,
      closeRequestId: event.type === 'close' ? event.requestId : context.closeRequestId,
      invalidDrafts: event.type === 'close' ? [...(event.invalidDrafts ?? [])] : context.invalidDrafts,
    })),
    clearOperation: assign(() => ({
      activeRequest: undefined,
      pendingRequest: undefined,
      proposed: undefined,
      plan: undefined,
      operationIndeterminate: false,
      applyEscaped: false,
      activeRefreshPending: false,
    })),
    reportCloseFailure: assign(({ event }) => {
      const details = errorDetails(actorError(event, 'xstate.error.actor.flush-parameter-set'), 'FLUSH_FAILED');
      return { diagnostic: { ...details, recoverable: false } };
    }),
  },
}).createMachine({
  id: 'parameter-set',
  context: initialContext,
  initial: 'checkingInput',
  states: {
    checkingInput: {
      always: [{ guard: 'hasValidInput', target: 'operational' }, { target: 'invalidInput' }],
    },
    invalidInput: { type: 'final' },
    operational: {
      initial: 'resolving',
      invoke: {
        id: 'observe-parameter-set',
        src: 'observeParameterSet',
        input: ({ context }) => ({ target: structuredClone(context.target), generation: context.watchGeneration }),
        onError: [
          {
            guard: 'hasEscapedActiveRequest',
            actions: 'reportWatchFailure',
          },
          {
            guard: 'hasSettledActiveRequest',
            target: '#parameter-set.disconnecting',
            actions: 'reportWatchFailure',
          },
          {
            guard: 'hasPreApplyActiveRequest',
            target: '#parameter-set.disconnecting',
            actions: ['reportWatchFailure', 'cancelBeforeApply'],
          },
          {
            target: '#parameter-set.disconnecting',
            actions: 'reportWatchFailure',
          },
        ],
      },
      on: {
        'watch.error': [
          {
            guard: ({ context, event }) =>
              event.generation === context.watchGeneration &&
              context.activeRequest !== undefined &&
              context.settledRequestId === context.activeRequest.requestId,
            target: '#parameter-set.disconnecting',
            actions: 'reportWatchFailure',
          },
          {
            guard: ({ context, event }) =>
              event.generation === context.watchGeneration &&
              context.activeRequest !== undefined &&
              context.settledRequestId !== context.activeRequest.requestId &&
              !context.operationIndeterminate,
            target: '#parameter-set.disconnecting',
            actions: ['reportWatchFailure', 'cancelBeforeApply'],
          },
          {
            guard: 'currentWatchGeneration',
            target: '#parameter-set.disconnecting',
            actions: 'reportWatchFailure',
          },
        ],
        'watch.changed': { guard: 'currentWatchGeneration', actions: 'markWatchRefresh' },
        submit: [
          { guard: 'isActiveDuplicateSubmission' },
          { guard: 'isPendingDuplicateSubmission' },
          { guard: 'hasRequestIdCollision', actions: 'rejectRequestIdCollision' },
          { guard: 'isDurableReplaySubmission', actions: 'settleDurableReplay' },
          { guard: 'canQueueSubmittedRequest', actions: 'queueRequest' },
          { guard: 'validSubmittedRequest', actions: 'rejectClosingSubmission' },
          { actions: 'rejectMalformedSubmission' },
        ],
        cancel: { guard: 'matchingPendingCancellation', actions: 'cancelPendingRequest' },
        close: { actions: 'beginClose' },
      },
      states: {
        resolving: {
          invoke: {
            id: 'resolve-parameter-set',
            src: 'resolveParameterSet',
            input: ({ context }) => ({
              target: structuredClone(context.target),
              requestId: context.resolutionRequestId,
              generation: context.resolutionGeneration,
            }),
            onDone: [
              {
                guard: 'validResolutionNeedsRefresh',
                target: 'resolving',
                reenter: true,
                actions: ['acceptResolution', 'beginPendingRefresh'],
              },
              { guard: ({ event }) => validSnapshot(event.output), target: 'resolved', actions: 'acceptResolution' },
              { target: 'resolutionFailed', actions: 'acceptResolution' },
            ],
            onError: { target: 'resolutionFailed', actions: 'failResolution' },
          },
          on: {
            resolve: { target: 'resolving', reenter: true, actions: 'beginResolution' },
            cancel: {
              guard: 'matchingActiveRefreshCancellation',
              target: 'cancelled',
              actions: 'cancelActiveRefresh',
            },
            close: [
              {
                guard: 'needsActiveRefreshCheck',
                target: 'cancelled',
                actions: ['beginClose', 'cancelBeforeApply'],
              },
              {
                guard: 'hasPendingRequest',
                target: '#parameter-set.operational.settlingClosePending',
                actions: ['beginClose', 'cancelPendingRequest'],
              },
              { target: '#parameter-set.quiescing', actions: 'beginClose' },
            ],
          },
        },
        resolved: {
          always: [
            {
              guard: 'isClosingWithPending',
              target: 'settlingClosePending',
              actions: 'cancelPendingRequest',
            },
            { guard: 'isClosing', target: '#parameter-set.quiescing' },
            { guard: 'needsActiveRefreshCheck', target: 'checking', actions: 'completeActiveRefresh' },
            { guard: 'hasPendingRequest', target: 'checking', actions: 'promotePendingRequest' },
            { target: 'ready', actions: 'clearOperation' },
          ],
        },
        resolutionFailed: {
          on: {
            resolve: { target: 'resolving', actions: 'beginResolution' },
            cancel: {
              guard: 'matchingActiveRefreshCancellation',
              target: 'cancelled',
              actions: 'cancelActiveRefresh',
            },
            close: [
              {
                guard: 'needsActiveRefreshCheck',
                target: 'cancelled',
                actions: ['beginClose', 'cancelBeforeApply'],
              },
              {
                guard: 'hasPendingRequest',
                target: 'settlingClosePending',
                actions: ['beginClose', 'cancelPendingRequest'],
              },
              { target: '#parameter-set.quiescing', actions: 'beginClose' },
            ],
          },
        },
        ready: {
          on: {
            submit: [
              { guard: 'hasRequestIdCollision', actions: 'rejectRequestIdCollision' },
              { guard: 'validSubmittedRequest', target: 'checking', actions: 'acceptRequest' },
              { actions: 'rejectMalformedSubmission' },
            ],
            resolve: { target: 'resolving', actions: 'beginResolution' },
            'watch.changed': {
              guard: 'currentWatchGeneration',
              target: 'resolving',
              actions: ['markWatchRefresh', 'beginPendingRefresh'],
            },
            close: { target: '#parameter-set.quiescing', actions: 'beginClose' },
          },
        },
        checking: {
          always: [
            { guard: 'isDisplayOnly', target: 'rejected', actions: 'rejectDisplayOnly' },
            { guard: 'hasDurableRequestReceipt', target: 'committed', actions: 'commitDurableNoop' },
            { guard: 'invalidGroupOperation', target: 'rejected', actions: 'rejectGroupOperation' },
            { guard: 'hasCurrentRequest', target: 'planning' },
            { target: 'rejected', actions: 'rejectInvalidRequest' },
          ],
        },
        planning: {
          invoke: {
            id: 'plan-operation',
            src: 'planParameterOperation',
            input: ({ context }) => ({
              target: structuredClone(context.target),
              request: structuredClone(context.activeRequest!),
              current: structuredClone(context.current!),
            }),
            onDone: [
              {
                guard: 'planIsStaleSemanticNoop',
                target: 'resolving',
                actions: 'beginActiveRefresh',
              },
              { guard: 'planRejected', target: 'rejected', actions: 'rejectPlan' },
              { guard: 'planIsSemanticNoop', target: 'committed', actions: 'commitAuthorityNoop' },
              { guard: 'planReady', target: 'applying', actions: 'acceptReadyPlan' },
              { guard: 'planNeedsConfirmation', target: 'awaitingConfirmation', actions: 'acceptConfirmationPlan' },
              { target: 'rejected', actions: 'rejectInvalidPlan' },
            ],
            onError: { target: 'rejected', actions: 'rejectPlanFailure' },
          },
          on: {
            cancel: { guard: 'matchingCancellation', target: 'cancelled', actions: 'cancelBeforeApply' },
            close: { target: 'cancelled', actions: ['beginClose', 'cancelBeforeApply'] },
          },
        },
        awaitingConfirmation: {
          on: {
            confirm: [
              { guard: 'matchingConfirmation', target: 'applying' },
              { target: 'rejected', actions: 'rejectConfirmation' },
            ],
            cancel: { guard: 'matchingCancellation', target: 'cancelled', actions: 'cancelBeforeApply' },
            close: { target: 'cancelled', actions: ['beginClose', 'cancelBeforeApply'] },
            resolve: { target: 'rejected', actions: ['beginResolution', 'rejectConfirmation'] },
            'watch.changed': {
              guard: 'currentWatchGeneration',
              target: 'rejected',
              actions: ['markWatchRefresh', 'rejectConfirmation'],
            },
          },
        },
        applying: {
          entry: 'markApplyEscaped',
          invoke: {
            id: 'apply-operation',
            src: 'applyParameterOperation',
            input: ({ context }) => ({
              target: structuredClone(context.target),
              request: structuredClone(context.activeRequest!),
              expected: structuredClone(context.activeRequest!.expected),
              proposed: structuredClone(context.proposed!),
              ...(context.plan === undefined ? {} : { planFingerprint: context.plan.fingerprint }),
            }),
            onDone: [
              { guard: 'applyCommitted', target: 'committed', actions: 'commitApply' },
              { guard: 'applyConflict', target: 'rejected', actions: 'rejectConflict' },
              { target: 'reconciling', actions: 'markInvalidApplyResult' },
            ],
            onError: [
              { guard: 'knownNotApplied', target: 'failed', actions: 'failKnownNotApplied' },
              { target: 'reconciling', actions: 'markPotentialApplyFailure' },
            ],
          },
          on: {
            cancel: { guard: 'matchingCancellation' },
            'watch.error': { guard: 'currentWatchGeneration', actions: 'reportWatchFailure' },
          },
        },
        reconciling: {
          invoke: {
            id: 'read-parameter-set',
            src: 'readParameterSet',
            input: ({ context }) => ({
              target: structuredClone(context.target),
              request: structuredClone(context.activeRequest!),
              expected: structuredClone(context.activeRequest!.expected),
            }),
            onDone: [
              { guard: 'reconcileCommitted', target: 'committed', actions: 'commitReconciled' },
              { guard: 'reconcileKnownNotApplied', target: 'failed', actions: 'reconcileNotApplied' },
              { target: 'indeterminate', actions: 'markIndeterminate' },
            ],
            onError: { target: 'indeterminate', actions: 'markReconcileFailure' },
          },
          on: { 'watch.error': { guard: 'currentWatchGeneration', actions: 'reportWatchFailure' } },
        },
        committed: {
          entry: 'retireSettledOperation',
          on: { 'watch.error': { guard: 'currentWatchGeneration', actions: 'reportWatchFailure' } },
          after: {
            0: [
              {
                guard: 'isClosingWithPending',
                target: 'settlingClosePending',
                actions: 'cancelPendingRequest',
              },
              { guard: 'isClosing', target: '#parameter-set.quiescing' },
              { guard: 'isWatchDisconnected', target: '#parameter-set.disconnected' },
              { guard: 'needsRefresh', target: 'resolving', actions: 'beginPendingRefresh' },
              { guard: 'hasPendingRequest', target: 'checking', actions: 'promotePendingRequest' },
              { target: 'ready', actions: 'clearOperation' },
            ],
          },
        },
        rejected: {
          entry: 'retireSettledOperation',
          on: { 'watch.error': { guard: 'currentWatchGeneration', actions: 'reportWatchFailure' } },
          after: {
            0: [
              {
                guard: 'isClosingWithPending',
                target: 'settlingClosePending',
                actions: 'cancelPendingRequest',
              },
              { guard: 'isClosing', target: '#parameter-set.quiescing' },
              { guard: 'isWatchDisconnected', target: '#parameter-set.disconnected' },
              { guard: 'needsRefresh', target: 'resolving', actions: 'beginPendingRefresh' },
              { guard: 'hasPendingRequest', target: 'checking', actions: 'promotePendingRequest' },
              { target: 'ready', actions: 'clearOperation' },
            ],
          },
        },
        cancelled: {
          entry: 'retireSettledOperation',
          on: { 'watch.error': { guard: 'currentWatchGeneration', actions: 'reportWatchFailure' } },
          after: {
            0: [
              {
                guard: 'isClosingWithPending',
                target: 'settlingClosePending',
                actions: 'cancelPendingRequest',
              },
              { guard: 'isClosing', target: '#parameter-set.quiescing' },
              { guard: 'isWatchDisconnected', target: '#parameter-set.disconnected' },
              { guard: 'needsRefresh', target: 'resolving', actions: 'beginPendingRefresh' },
              { guard: 'hasPendingRequest', target: 'checking', actions: 'promotePendingRequest' },
              { target: 'ready', actions: 'clearOperation' },
            ],
          },
        },
        failed: {
          entry: 'retireSettledOperation',
          on: { 'watch.error': { guard: 'currentWatchGeneration', actions: 'reportWatchFailure' } },
          after: {
            0: [
              {
                guard: 'isClosingWithPending',
                target: 'settlingClosePending',
                actions: 'cancelPendingRequest',
              },
              { guard: 'isClosing', target: '#parameter-set.quiescing' },
              { guard: 'isWatchDisconnected', target: '#parameter-set.disconnected' },
              { guard: 'needsRefresh', target: 'resolving', actions: 'beginPendingRefresh' },
              { guard: 'hasPendingRequest', target: 'checking', actions: 'promotePendingRequest' },
              { target: 'ready', actions: 'clearOperation' },
            ],
          },
        },
        indeterminate: {
          always: [{ guard: 'isWatchDisconnected', target: '#parameter-set.disconnected' }],
          on: {
            resolve: { target: 'reconciling' },
            close: { actions: 'beginClose' },
            submit: [
              { guard: 'isActiveDuplicateSubmission' },
              { guard: 'isPendingDuplicateSubmission' },
              { guard: 'hasRequestIdCollision', actions: 'rejectRequestIdCollision' },
              { guard: 'isDurableReplaySubmission', actions: 'settleDurableReplay' },
              { actions: 'rejectIndeterminateSubmission' },
            ],
          },
        },
        settlingClosePending: {
          after: { 0: { target: '#parameter-set.quiescing' } },
        },
      },
    },
    disconnecting: {
      on: {
        'watch.retry': { actions: 'retryWatch' },
        cancel: { guard: 'matchingPendingCancellation', actions: 'cancelPendingRequest' },
        close: { actions: 'beginClose' },
        submit: [
          { guard: 'isActiveDuplicateSubmission' },
          { guard: 'isPendingDuplicateSubmission' },
          { guard: 'hasRequestIdCollision', actions: 'rejectRequestIdCollision' },
          { guard: 'isDurableReplaySubmission', actions: 'settleDurableReplay' },
          { actions: 'rejectUnavailable' },
        ],
      },
      after: {
        0: [
          {
            guard: 'hasPendingRequest',
            target: 'disconnecting',
            reenter: true,
            actions: 'cancelPendingRequest',
          },
          { guard: 'isClosingWithoutIndeterminate', target: 'quiescing' },
          {
            guard: ({ context }) => !context.watchDisconnected && context.operationIndeterminate,
            target: 'operational.reconciling',
          },
          {
            guard: 'isReconnectRequested',
            target: 'operational',
            actions: 'clearOperation',
          },
          { guard: 'hasIndeterminateOperation', target: 'disconnected' },
          { target: 'disconnected', actions: 'clearOperation' },
        ],
      },
    },
    disconnected: {
      on: {
        'watch.retry': { target: 'disconnecting', actions: 'retryWatch' },
        cancel: { guard: 'matchingPendingCancellation', actions: 'cancelPendingRequest' },
        close: { target: 'disconnecting', actions: 'beginClose' },
        submit: [
          { guard: 'isActiveDuplicateSubmission' },
          { guard: 'isPendingDuplicateSubmission' },
          { guard: 'hasRequestIdCollision', actions: 'rejectRequestIdCollision' },
          { guard: 'isDurableReplaySubmission', actions: 'settleDurableReplay' },
          { actions: 'rejectUnavailable' },
        ],
      },
    },
    quiescing: {
      invoke: {
        id: 'flush-parameter-set',
        src: 'flushParameterSet',
        input: ({ context }) => ({
          target: structuredClone(context.target),
          requestId: context.closeRequestId ?? 'close',
          invalidDrafts: [...context.invalidDrafts],
        }),
        onDone: { target: 'closed', actions: 'clearOperation' },
        onError: { target: 'closeFailed', actions: 'reportCloseFailure' },
      },
      on: { submit: { actions: 'rejectClosingSubmission' } },
    },
    closeFailed: {
      on: {
        close: { target: 'quiescing', actions: 'beginClose' },
        submit: { actions: 'rejectClosingSubmission' },
      },
    },
    closed: { type: 'final' },
  },
});
