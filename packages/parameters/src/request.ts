import { assertBoundedJson } from '#bounded-json.js';
import type { JSONValue } from '@taucad/types';
import type {
  ParameterSetIdentity,
  ParameterSetTarget,
  ParameterSetOperation,
  ParameterSetRequest,
  ParameterSourceUnitCapability,
  ParameterSetAuthoritySnapshot,
} from '#types.js';
const hasText = (value: string | undefined): value is string => value !== undefined && value.trim().length > 0;
/** Whether two parameter identities name the same revisions. @internal */
export const sameIdentity = (left: ParameterSetIdentity, right: ParameterSetIdentity): boolean =>
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

/** Structural JSON equality; admitted requests are JSON by `validRequestShape`, so inputs stay `unknown`. */
const sameJsonValue = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item: unknown, index) => sameJsonValue(item, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && sameJsonValue(left[key], right[key]))
  );
};

const isIdentity = (value: unknown): value is ParameterSetIdentity =>
  isRecord(value) &&
  hasText(typeof value['sourceRevision'] === 'string' ? value['sourceRevision'] : undefined) &&
  hasText(typeof value['manifestRevision'] === 'string' ? value['manifestRevision'] : undefined) &&
  hasText(typeof value['valueRevision'] === 'string' ? value['valueRevision'] : undefined) &&
  hasText(typeof value['dependencyRevision'] === 'string' ? value['dependencyRevision'] : undefined);

const hasOperationText = (operation: Readonly<Record<string, unknown>>, ...fields: readonly string[]): boolean =>
  fields.every((field) => hasText(typeof operation[field] === 'string' ? operation[field] : undefined));

/** Whether a value is a well-formed parameter target. @internal */
export const validTarget = (value: unknown): value is ParameterSetTarget =>
  isRecord(value) &&
  hasOperationText(value, 'authority', 'root', 'entry') &&
  (value['checkout'] === undefined || hasOperationText(value, 'checkout'));

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
    (operation['dependencies'] === undefined ||
      (dependencies !== undefined &&
        Object.entries(dependencies).every(([key, item]) => hasText(key) && hasText(item))))
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
    case 'replace-group-values':
    case 'delete-group':
    case 'select-group': {
      return (
        hasOperationText(value, 'group') &&
        (value['kind'] !== 'replace-group-values' || (isRecord(value['values']) && isJsonValue(value['values'])))
      );
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
    case 'bind-parameter': {
      if (!hasOperationText(value, 'group', 'parameterId', 'resource', 'pointer') || !isRecord(value['binding'])) {
        return false;
      }
      const { binding } = value;
      const keys = Object.keys(binding);
      return (
        keys.length > 0 &&
        keys.every((key) => ['unit', 'quantityKind', 'space', 'reference'].includes(key)) &&
        (binding['unit'] === undefined || hasText(typeof binding['unit'] === 'string' ? binding['unit'] : undefined)) &&
        (binding['quantityKind'] === undefined ||
          hasText(typeof binding['quantityKind'] === 'string' ? binding['quantityKind'] : undefined)) &&
        (binding['reference'] === undefined ||
          hasText(typeof binding['reference'] === 'string' ? binding['reference'] : undefined)) &&
        (binding['space'] === undefined ||
          binding['space'] === 'linear' ||
          binding['space'] === 'difference' ||
          binding['space'] === 'point')
      );
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

const validBase = (value: unknown, operation: unknown): boolean => {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value) || !hasText(typeof value['pointer'] === 'string' ? value['pointer'] : undefined)) {
    return false;
  }
  // Field-scoped freshness applies only to a single-field edit of the same pointer.
  if (
    !isRecord(operation) ||
    (operation['kind'] !== 'native-value' && operation['kind'] !== 'unit-value') ||
    operation['pointer'] !== value['pointer']
  ) {
    return false;
  }
  if (!isJsonValue(value['value'])) {
    return false;
  }
  const { binding } = value;
  if (binding === undefined) {
    return true;
  }
  return (
    isRecord(binding) &&
    Object.keys(binding).every((key) => ['unit', 'quantityKind', 'space', 'reference', 'representation'].includes(key))
  );
};

const requestShape = (request: unknown): request is ParameterSetRequest =>
  isJsonValue(request) &&
  isRecord(request) &&
  hasText(typeof request['requestId'] === 'string' ? request['requestId'] : undefined) &&
  (request['fingerprint'] === undefined ||
    hasText(typeof request['fingerprint'] === 'string' ? request['fingerprint'] : undefined)) &&
  Number.isSafeInteger(request['draftGeneration']) &&
  Number(request['draftGeneration']) >= 0 &&
  isIdentity(request['expected']) &&
  validBase(request['base'], request['operation']) &&
  (request['pressure'] === 'transient' || request['pressure'] === 'final') &&
  validOperation(request['operation']);

/** Whether a value is a bounded, well-formed parameter request. @internal */
export const validRequestShape = (request: unknown): request is ParameterSetRequest => {
  try {
    assertBoundedJson(request, {
      code: 'PARAMETER_REQUEST',
      maximumDepth: 64,
      maximumNodes: 10_000,
      maximumCharacters: 1_000_000,
    });
    return requestShape(request);
  } catch {
    return false;
  }
};

/** Whether two requests are the same delivery, compared as JSON. @internal */
export const sameRequestDelivery = (left: ParameterSetRequest, right: ParameterSetRequest): boolean =>
  sameJsonValue(left, right);

const sourceUnitCapability = (value: unknown): ParameterSourceUnitCapability | undefined => {
  if (
    !isRecord(value) ||
    typeof value['producer'] !== 'string' ||
    typeof value['sourceRevision'] !== 'string' ||
    typeof value['capability'] !== 'string'
  ) {
    return undefined;
  }
  return {
    producer: value['producer'],
    sourceRevision: value['sourceRevision'],
    capability: value['capability'],
  };
};

const stringRecord = (value: unknown): Readonly<Record<string, string>> | undefined => {
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === 'string')) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
};

const validRequest = (
  request: ParameterSetRequest | undefined,
  current: ParameterSetAuthoritySnapshot | undefined,
): boolean => validRequestShape(request) && current !== undefined && sameIdentity(request.expected, current.identity);
/** Reject a group operation that is malformed or planned against a stale identity. @internal */
export const groupOperationRejection = (
  request: ParameterSetRequest | undefined,
  current: ParameterSetAuthoritySnapshot | undefined,
): Readonly<{ code: string; message: string }> | undefined => {
  if (request === undefined || current === undefined || !validRequest(request, current)) {
    return undefined;
  }
  const { operation } = request;
  if (operation.kind === 'create-group' && Object.hasOwn(current.entry.groups, operation.group)) {
    return {
      code: 'GROUP_ALREADY_EXISTS',
      message: `Parameter group "${operation.group}" already exists.`,
    };
  }
  if (
    operation.kind === 'select-group' ||
    operation.kind === 'reset-group' ||
    operation.kind === 'replace-group-values'
  ) {
    return Object.hasOwn(current.entry.groups, operation.group)
      ? undefined
      : {
          code: 'GROUP_NOT_FOUND',
          message: `Parameter group "${operation.group}" does not exist.`,
        };
  }
  if (operation.kind === 'rename-group') {
    if (!Object.hasOwn(current.entry.groups, operation.group)) {
      return {
        code: 'GROUP_NOT_FOUND',
        message: `Parameter group "${operation.group}" does not exist.`,
      };
    }
    return operation.nextGroup !== operation.group && Object.hasOwn(current.entry.groups, operation.nextGroup)
      ? {
          code: 'GROUP_ALREADY_EXISTS',
          message: `Parameter group "${operation.nextGroup}" already exists.`,
        }
      : undefined;
  }
  if (operation.kind !== 'delete-group') {
    return undefined;
  }
  if (!Object.hasOwn(current.entry.groups, operation.group)) {
    return {
      code: 'GROUP_NOT_FOUND',
      message: `Parameter group "${operation.group}" does not exist.`,
    };
  }
  if (Object.keys(current.entry.groups).length === 1) {
    return {
      code: 'LAST_GROUP_DELETE',
      message: 'The last parameter group cannot be deleted.',
    };
  }
  return operation.group === current.entry.activeGroup
    ? {
        code: 'ACTIVE_GROUP_DELETE',
        message: 'The active parameter group cannot be deleted.',
      }
    : undefined;
};
