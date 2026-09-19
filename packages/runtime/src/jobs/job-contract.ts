import { revisionId } from '@taucad/revisions/algorithms';
import type { RevisionId } from '@taucad/revisions/algorithms';
import { assertRootedPath } from '@taucad/utils/path';

import { canonicalizeCacheValue } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';

const maximumIdentityLength = 256;
const maximumPathLength = 4096;
const maximumSelections = 10_000;
const maximumConfigurationDepth = 128;
const maximumConfigurationNodes = 100_000;
const maximumConfigurationStringLength = 1_048_576;
const maximumConfigurationCharacters = 4_194_304;
const digestPattern = /^sha256:[\da-f]{64}$/u;
const pointerPattern = /^(?:\/(?:[^~/]|~[01])*)*$/u;

/** Qualified identity of one immutable workspace revision. @public */
export type JobRevision = {
  readonly authorityId: string;
  readonly workspaceId: string;
  readonly revisionId: RevisionId;
  readonly treeDigest: ContentDigest;
};

/** Exact provider manifest selected for admission. @public */
export type JobProviderIdentity<Id extends string = string> = {
  readonly id: Id;
  readonly version: string;
  readonly manifestDigest: ContentDigest;
};

/** Authority-qualified durable job identity. @public */
export type JobReference = { readonly hostId: string; readonly jobId: string };

/** Literal files selected from one sealed input revision. @public */
export type JobInput = {
  readonly revision: JobRevision;
  readonly paths: readonly string[];
};

/** Raw provider configuration and explicit RFC 6901 presence markers. @public */
export type JobConfigurationInput<Value extends CacheValue = CacheValue> = {
  readonly value: Value;
  readonly explicitPointers: readonly string[];
  readonly expectedEffectiveDigest?: ContentDigest;
};

/** Full public job submission boundary. @public */
export type JobSubmitInput<Id extends string = string, Value extends CacheValue = CacheValue> = {
  readonly provider: JobProviderIdentity<Id>;
  readonly input: JobInput;
  readonly configuration: JobConfigurationInput<Value>;
  readonly submissionKey: string;
  readonly signal?: AbortSignal;
};

/** Canonical public lifecycle projected from durable job facts. @public */
export type JobLifecycleState =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'attention_required'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Immutable admitted configuration retained with a job. @public */
export type JobEffectiveConfiguration<Value extends CacheValue = CacheValue> = {
  readonly value: Value;
  readonly digest: ContentDigest;
  readonly providerManifestDigest: ContentDigest;
};

/** Qualified public projection; receipt and cancellation intent are separate contracts. @public */
export type JobSnapshot<Value extends CacheValue = CacheValue> = {
  readonly reference: JobReference;
  readonly revision: number;
  readonly provider: JobProviderIdentity;
  readonly input: JobInput;
  readonly configuration: JobEffectiveConfiguration<Value>;
  readonly state: JobLifecycleState;
};

/** Admission result, including the lost-reply identity needed for safe reconciliation. @public */
export type JobSubmitOutcome =
  | {
      readonly type: 'accepted';
      readonly reference: JobReference;
      readonly requestDigest: ContentDigest;
      readonly deduplicated: boolean;
    }
  | { readonly type: 'refused'; readonly code: string; readonly issues?: readonly JobValidationIssue[] }
  | {
      readonly type: 'unknown';
      readonly hostId: string;
      readonly submissionKey: string;
      readonly requestDigest: ContentDigest;
    };

/** One invalid field reported at the public submission boundary. @public */
export type JobValidationIssue = { readonly pointer: string; readonly message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const isJsonArray = (value: CacheValue): value is readonly CacheValue[] => Array.isArray(value);

const isEnumerableDataDescriptor = (
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { readonly value: unknown } =>
  descriptor?.enumerable === true && 'value' in descriptor;

const assertKeys = (value: Record<string, unknown>, allowed: readonly string[], pointer: string): void => {
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !isEnumerableDataDescriptor(descriptor)) {
      throw new TypeError(`${pointer}/${String(key)} is not an allowed enumerable data property.`);
    }
  }
};

const readField = (value: Record<string, unknown>, key: string, pointer: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!isEnumerableDataDescriptor(descriptor)) {
    throw new TypeError(`${pointer} must be an enumerable data property.`);
  }
  return descriptor.value;
};

const readOptionalField = (value: Record<string, unknown>, key: string, pointer: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    return undefined;
  }
  if (!isEnumerableDataDescriptor(descriptor)) {
    throw new TypeError(`${pointer} must be an enumerable data property.`);
  }
  return descriptor.value;
};

const readArray = (value: unknown, pointer: string): readonly unknown[] => {
  if (!Array.isArray(value) || value.length > maximumSelections) {
    throw new TypeError(`${pointer} must contain at most ${String(maximumSelections)} entries.`);
  }
  const entries: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!isEnumerableDataDescriptor(descriptor)) {
      throw new TypeError(`${pointer}/${String(index)} must be an enumerable data property.`);
    }
    entries.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).some((key) => key !== 'length' && !/^(?:0|[1-9]\d*)$/u.test(String(key)))) {
    throw new TypeError(`${pointer} must not contain non-index properties.`);
  }
  return entries;
};

const parseIdentity = (value: unknown, pointer: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumIdentityLength) {
    throw new TypeError(
      `${pointer} must be a non-empty string of at most ${String(maximumIdentityLength)} characters.`,
    );
  }
  return value;
};

const parseDigest = (value: unknown, pointer: string): ContentDigest => {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new TypeError(`${pointer} must be a lowercase algorithm-qualified SHA-256 digest.`);
  }
  // Runtime validation above establishes the shared digest brand.
  return value as ContentDigest;
};

const readConfigurationValue = (value: unknown): CacheValue => {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  let characters = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > maximumConfigurationNodes || current.depth > maximumConfigurationDepth) {
      throw new TypeError('/configuration/value exceeds the structural admission limit.');
    }
    if (typeof current.value === 'string') {
      characters += current.value.length;
      if (current.value.length > maximumConfigurationStringLength || characters > maximumConfigurationCharacters) {
        throw new TypeError('/configuration/value exceeds the string admission limit.');
      }
    }
    if (typeof current.value !== 'object' || current.value === null) {
      continue;
    }
    for (const key of Reflect.ownKeys(current.value)) {
      if (typeof key === 'string') {
        characters += key.length;
        if (key.length > maximumConfigurationStringLength || characters > maximumConfigurationCharacters) {
          throw new TypeError('/configuration/value exceeds the string admission limit.');
        }
      }
      const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
      if (descriptor !== undefined && 'value' in descriptor) {
        pending.push({ value: descriptor.value, depth: current.depth + 1 });
      }
    }
  }

  // The shared canonicalizer owns strict CacheValue semantics without invoking getters.
  const canonical = canonicalizeCacheValue({ value: value as CacheValue });
  return JSON.parse(canonical) as CacheValue;
};

const parsePath = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumPathLength || /[*?[\]]/u.test(value)) {
    throw new TypeError('/input/paths must contain bounded root-relative literal paths.');
  }
  return assertRootedPath(value);
};

const hasPointer = (value: CacheValue, pointer: string): boolean => {
  if (pointer === '') {
    return true;
  }
  let current: CacheValue = value;
  for (const token of pointer.slice(1).split('/')) {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    if (isJsonArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= current.length) {
        return false;
      }
      current = current[Number(key)]!;
    } else if (typeof current === 'object' && current !== null && Object.hasOwn(current, key)) {
      current = current[key]!;
    } else {
      return false;
    }
  }
  return true;
};

const dangerousPointerTokens = new Set(['__proto__', 'constructor', 'prototype']);

const parsePointer = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > maximumPathLength || !pointerPattern.test(value)) {
    throw new TypeError('/configuration/explicitPointers must contain RFC 6901 pointers.');
  }
  const tokens = value
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (value !== '' && tokens.some((token) => dangerousPointerTokens.has(token))) {
    throw new TypeError('/configuration/explicitPointers must not contain prototype-path tokens.');
  }
  return value;
};

/**
 * Validate and own an untrusted public submission envelope.
 *
 * This validates boundary shape only. Provider schemas, required-file presence, revision
 * availability, grants, and effective configuration remain authoritative admission work.
 *
 * @param value - Untrusted transport value.
 * @returns A defensively owned submission envelope.
 * @public
 */
export const parseJobSubmitInput = (value: unknown): JobSubmitInput => {
  if (!isRecord(value)) {
    throw new TypeError('Job submission must be a plain object.');
  }
  assertKeys(value, ['provider', 'input', 'configuration', 'submissionKey', 'signal'], '');

  const provider = readField(value, 'provider', '/provider');
  const input = readField(value, 'input', '/input');
  const configuration = readField(value, 'configuration', '/configuration');
  if (!isRecord(provider) || !isRecord(input) || !isRecord(configuration)) {
    throw new TypeError('/provider, /input, and /configuration must be plain objects.');
  }
  assertKeys(provider, ['id', 'version', 'manifestDigest'], '/provider');
  assertKeys(input, ['revision', 'paths'], '/input');
  assertKeys(configuration, ['value', 'explicitPointers', 'expectedEffectiveDigest'], '/configuration');
  const revision = readField(input, 'revision', '/input/revision');
  const paths = readArray(readField(input, 'paths', '/input/paths'), '/input/paths');
  const pointers = readArray(
    readField(configuration, 'explicitPointers', '/configuration/explicitPointers'),
    '/configuration/explicitPointers',
  );
  if (!isRecord(revision)) {
    throw new TypeError('/input/revision must be a plain object.');
  }
  assertKeys(revision, ['authorityId', 'workspaceId', 'revisionId', 'treeDigest'], '/input/revision');
  const explicitPointers = pointers.map((pointer) => parsePointer(pointer));
  if (new Set(explicitPointers).size !== explicitPointers.length) {
    throw new TypeError('/configuration/explicitPointers must not contain duplicates.');
  }
  const signal = readOptionalField(value, 'signal', '/signal');
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new TypeError('/signal must be an AbortSignal.');
  }

  const configurationValue = readConfigurationValue(readField(configuration, 'value', '/configuration/value'));
  const missingPointer = explicitPointers.find((pointer) => !hasPointer(configurationValue, pointer));
  if (missingPointer !== undefined) {
    throw new TypeError(`/configuration/explicitPointers contains absent pointer ${JSON.stringify(missingPointer)}.`);
  }
  const expectedEffectiveDigest = readOptionalField(
    configuration,
    'expectedEffectiveDigest',
    '/configuration/expectedEffectiveDigest',
  );

  return {
    provider: {
      id: parseIdentity(readField(provider, 'id', '/provider/id'), '/provider/id'),
      version: parseIdentity(readField(provider, 'version', '/provider/version'), '/provider/version'),
      manifestDigest: parseDigest(
        readField(provider, 'manifestDigest', '/provider/manifestDigest'),
        '/provider/manifestDigest',
      ),
    },
    input: {
      revision: {
        authorityId: parseIdentity(
          readField(revision, 'authorityId', '/input/revision/authorityId'),
          '/input/revision/authorityId',
        ),
        workspaceId: parseIdentity(
          readField(revision, 'workspaceId', '/input/revision/workspaceId'),
          '/input/revision/workspaceId',
        ),
        revisionId: revisionId(
          parseIdentity(readField(revision, 'revisionId', '/input/revision/revisionId'), '/input/revision/revisionId'),
        ),
        treeDigest: parseDigest(
          readField(revision, 'treeDigest', '/input/revision/treeDigest'),
          '/input/revision/treeDigest',
        ),
      },
      paths: paths.map((path) => parsePath(path)),
    },
    configuration: {
      value: configurationValue,
      explicitPointers,
      ...(expectedEffectiveDigest === undefined
        ? {}
        : {
            expectedEffectiveDigest: parseDigest(expectedEffectiveDigest, '/configuration/expectedEffectiveDigest'),
          }),
    },
    submissionKey: parseIdentity(readField(value, 'submissionKey', '/submissionKey'), '/submissionKey'),
    ...(signal === undefined ? {} : { signal }),
  };
};
