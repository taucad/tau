import type { StandardSchemaV1 } from '@standard-schema/spec';
import { canonicalizeCacheValue } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';
import { cloneBoundedJson } from '@taucad/parameters/json';
import type { ReadonlyDeep } from 'type-fest';
import { z } from 'zod';
import { validateConfiguration } from '#configuration/configuration.js';
import type { ConfigurationDefinition, ConfigurationIssue } from '#configuration/configuration.js';

import type {
  MachineTypeId,
  MachineProfileId,
  SavedMachineConfiguration,
  MachineSettingsRecord,
  MachineSettingsFailure,
} from '@taucad/types';
/* oxlint-disable no-barrel-files/no-barrel-files -- This published machine/settings entrypoint exposes its canonical wire types. */
export type {
  MachineTypeId,
  MachineProfileId,
  SavedMachineConfiguration,
  MachineSettingsProfile,
  MachineSettingsRecord,
  MachineSettingsFailure,
} from '@taucad/types';
/* oxlint-enable no-barrel-files/no-barrel-files */
/** Sparse, JSON-only configuration schema. @public */
export type SettingsSchema = StandardSchemaV1<
  Readonly<Record<string, CacheValue | undefined>>,
  Readonly<Record<string, CacheValue | undefined>>
>;
/** Value-preserving configuration definition admitted for persistence. @public */
export type SettingsDefinition<Schema extends SettingsSchema> = ConfigurationDefinition<Schema> &
  ([StandardSchemaV1.InferInput<Schema>] extends [StandardSchemaV1.InferOutput<Schema>]
    ? [StandardSchemaV1.InferOutput<Schema>] extends [StandardSchemaV1.InferInput<Schema>]
      ? unknown
      : never
    : never);
/** Deeply immutable saved configuration values. @public */
export type SavedSettingsValues<Schema extends SettingsSchema> = ReadonlyDeep<StandardSchemaV1.InferOutput<Schema>>;
/** Missing selected profile is a refusal, never defaults. @public */
export type MachineProfileFailure = Readonly<{
  status: 'refused';
  code: 'PROFILE_NOT_FOUND';
  message: string;
  profileId: MachineProfileId;
}>;
/** Authoritative configuration validation refusal. @public */
export type MachineConfigurationFailure =
  | Readonly<{
      status: 'refused';
      code: 'CONFIGURATION_VERSION_UNSUPPORTED';
      message: string;
      source: Readonly<{ id: string; version: string }>;
      savedVersion: string;
    }>
  | Readonly<{
      status: 'refused';
      code: 'CONFIGURATION_INVALID';
      message: string;
      issues: readonly ConfigurationIssue[];
    }>;
/** Result of admitting stored bytes. @public */
export type ReadMachineSettingsResult =
  | Readonly<{ status: 'current'; record: MachineSettingsRecord }>
  | MachineSettingsFailure;
/** Result of resolving one saved configuration. @public */
export type ReadMachineConfigurationResult<Value> =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'current'; values: Value }>
  | MachineConfigurationFailure
  | MachineProfileFailure;
/** UTF-8 ceiling, including inactive opaque blocks. @public */
export const machineSettingsMaximumBytes = 262_144;

const limits = {
  code: 'MACHINE_SETTINGS',
  maximumDepth: 24,
  maximumNodes: 8192,
  maximumCharacters: machineSettingsMaximumBytes,
} as const;
const safeKey = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => !['__proto__', 'prototype', 'constructor'].includes(value));
/** Path-safe namespaced identity schema shared with machine manifests. @public */
// SAFETY: the regex admits exactly namespaced strings, preserving a JSON-Schema-convertible string validator.
export const machineTypeIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)+$/u) as z.ZodType<MachineTypeId>;
const profileIdSchema = safeKey.pipe(
  z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
);
/** Captured project profile and exact configuration versions for a prepared job. @public */
export const machineSettingsProvenanceSchema = z.strictObject({
  scope: z.literal('project'),
  typeId: machineTypeIdSchema,
  profileId: profileIdSchema,
  configurationVersions: z.record(safeKey, z.string().min(1).max(128)),
});
/** Immutable provenance retained independently of later preference edits. @public */
export type MachineSettingsProvenance = z.output<typeof machineSettingsProvenanceSchema>;
const blockSchema = z.strictObject({
  version: z.string().min(1).max(128),
  values: z.record(safeKey, z.unknown()),
});
const profileSchema = z.strictObject({
  name: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => value.trim() === value && value.isWellFormed()),
  configurations: z.record(safeKey, blockSchema).refine((value) => Object.keys(value).length <= 32),
});
const recordSchema = z
  .strictObject({
    version: z.literal(1),
    typeId: machineTypeIdSchema,
    activeProfile: profileIdSchema,
    profiles: z
      .record(profileIdSchema, profileSchema)
      .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 16),
  })
  .refine((value) => Object.hasOwn(value.profiles, value.activeProfile), {
    message: 'Active profile must exist',
    path: ['activeProfile'],
  });

const freeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
};
const assertSafeKeys = (value: CacheValue): void => {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) {
        throw new TypeError('Unsafe record key');
      }
      assertSafeKeys(child);
    }
  }
};
const admitRecord = (value: unknown): MachineSettingsRecord => {
  const json = cloneBoundedJson(value, limits);
  assertSafeKeys(json);
  const parsed = recordSchema.parse(json);
  // SAFETY: bounded strict JSON plus the envelope schema prove the entire record shape.
  return freeze(parsed) as MachineSettingsRecord;
};
const canonical = (value: unknown): string => canonicalizeCacheValue({ value: cloneBoundedJson(value, limits) });

/**
 * Return the canonical project-relative file for one type.
 * @param input - Stable machine type identity.
 * @returns The authored project path.
 * @public
 */
export const machineSettingsPath = ({
  typeId,
}: Readonly<{
  typeId: MachineTypeId;
}>): `.tau/machines/settings/${MachineTypeId}.json` => {
  machineTypeIdSchema.parse(typeId);
  return `.tau/machines/settings/${typeId}.json`;
};
/**
 * Admit bounded UTF-8 bytes without interpreting opaque configuration blocks.
 * @param input - Captured bytes and expected type identity.
 * @returns An immutable current record or an explicit refusal.
 * @public
 */
export const readMachineSettings = ({
  bytes,
  typeId,
}: Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  typeId: MachineTypeId;
}>): ReadMachineSettingsResult => {
  machineTypeIdSchema.parse(typeId);
  try {
    if (bytes.byteLength > machineSettingsMaximumBytes) {
      throw new TypeError('Machine settings exceed 256 KiB');
    }
    const candidate: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      'version' in candidate &&
      typeof candidate.version === 'number' &&
      candidate.version > 1
    ) {
      return {
        status: 'refused',
        code: 'NEWER_RECORD',
        message: 'This machine settings record needs a newer Tau version.',
      };
    }
    const record = admitRecord(candidate);
    if (record.typeId !== typeId) {
      return {
        status: 'refused',
        code: 'MACHINE_TYPE_MISMATCH',
        message: 'Machine settings belong to another type.',
      };
    }
    return { status: 'current', record };
  } catch (error) {
    return {
      status: 'refused',
      code: 'INVALID_RECORD',
      message: error instanceof Error ? error.message : 'Invalid machine settings record.',
    };
  }
};
/**
 * Serialize a validated record with deterministic keys and a trailing newline.
 * @param input - The complete versioned record.
 * @returns Canonical UTF-8 source text.
 * @public
 */
export const serializeMachineSettings = ({ record }: Readonly<{ record: MachineSettingsRecord }>): string => {
  const text = `${JSON.stringify(JSON.parse(canonical(admitRecord(record))), null, 2)}\n`;
  if (new TextEncoder().encode(text).byteLength > machineSettingsMaximumBytes) {
    throw new TypeError('Machine settings exceed 256 KiB');
  }
  return text;
};

const resolved = new WeakMap<
  SavedMachineConfiguration,
  WeakMap<ConfigurationDefinition<SettingsSchema>, Promise<ReadMachineConfigurationResult<unknown>>>
>();
const validateValues = async <Schema extends SettingsSchema>(
  definition: SettingsDefinition<Schema>,
  values: unknown,
): Promise<ReadMachineConfigurationResult<SavedSettingsValues<Schema>>> => {
  try {
    const input = cloneBoundedJson(values, limits);
    assertSafeKeys(input);
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('Settings must be an object');
    }
    const validation = await validateConfiguration({
      definition,
      manifestDigest: await definition.manifestDigest(),
      formRevision: 0,
      value: input,
      explicitPointers: [],
    });
    if (validation.type === 'invalid') {
      return {
        status: 'refused',
        code: 'CONFIGURATION_INVALID',
        message: 'Saved configuration is invalid.',
        issues: validation.issues,
      };
    }
    if (canonical(input) !== canonical(validation.value)) {
      throw new TypeError('Settings validation must preserve sparse values');
    }
    return {
      status: 'current',
      values: freeze(validation.value) as SavedSettingsValues<Schema>,
    };
  } catch (error) {
    return {
      status: 'refused',
      code: 'CONFIGURATION_INVALID',
      message: error instanceof Error ? error.message : 'Invalid saved configuration.',
      issues: [],
    };
  }
};
/**
 * Resolve one configuration source; unknown inactive blocks remain opaque. Cancellation rejects.
 * @param input - Captured record/profile and trusted configuration definition.
 * @returns Deeply readonly sparse values, absence or a validation refusal.
 * @public
 */
export const readMachineConfiguration = async <Schema extends SettingsSchema>({
  settings,
  profileId,
  definition,
  signal,
}: Readonly<{
  settings: MachineSettingsRecord;
  profileId: MachineProfileId;
  definition: SettingsDefinition<Schema>;
  signal?: AbortSignal;
}>): Promise<ReadMachineConfigurationResult<SavedSettingsValues<Schema>>> => {
  signal?.throwIfAborted();
  const profile = settings.profiles[profileId];
  if (!profile) {
    return {
      status: 'refused',
      code: 'PROFILE_NOT_FOUND',
      message: 'Saved profile no longer exists.',
      profileId,
    };
  }
  const block = profile.configurations[definition.manifest.source.id];
  if (!block) {
    return { status: 'absent' };
  }
  if (block.version !== definition.manifest.source.version) {
    return {
      status: 'refused',
      code: 'CONFIGURATION_VERSION_UNSUPPORTED',
      message: 'Saved configuration version is unsupported.',
      source: definition.manifest.source,
      savedVersion: block.version,
    };
  }
  let definitions = resolved.get(block);
  if (!definitions) {
    definitions = new WeakMap();
    resolved.set(block, definitions);
  }
  let promise = definitions.get(definition);
  if (!promise) {
    promise = validateValues(definition, block.values);
    definitions.set(definition, promise);
  }
  const result = await promise;
  signal?.throwIfAborted();
  // SAFETY: this cache is keyed by the exact trusted definition and immutable block used above.
  return result as ReadMachineConfigurationResult<SavedSettingsValues<Schema>>;
};
/**
 * Replace or remove one configuration block in a captured profile, without I/O.
 * @param input - Captured record/profile, trusted definition and sparse replacement values.
 * @returns The complete immutable record or a validation refusal.
 * @public
 */
export const setMachineConfiguration = async <Schema extends SettingsSchema>({
  settings,
  profileId,
  definition,
  values,
  signal,
}: Readonly<{
  settings: MachineSettingsRecord;
  profileId: MachineProfileId;
  definition: SettingsDefinition<Schema>;
  values: ReadonlyDeep<NoInfer<StandardSchemaV1.InferInput<Schema>>> | undefined;
  signal?: AbortSignal;
}>): Promise<
  Readonly<{ status: 'current'; settings: MachineSettingsRecord }> | MachineConfigurationFailure | MachineProfileFailure
> => {
  signal?.throwIfAborted();
  const profile = settings.profiles[profileId];
  if (!profile) {
    return {
      status: 'refused',
      code: 'PROFILE_NOT_FOUND',
      message: 'Saved profile no longer exists.',
      profileId,
    };
  }
  const configurations = { ...profile.configurations };
  if (values === undefined) {
    Reflect.deleteProperty(configurations, definition.manifest.source.id);
  } else {
    const result = await validateValues(definition, values);
    signal?.throwIfAborted();
    if (result.status === 'refused') {
      return result;
    }
    if (result.status !== 'current') {
      throw new TypeError('Unexpected configuration validation state');
    }
    configurations[definition.manifest.source.id] = {
      version: definition.manifest.source.version,
      values: cloneBoundedJson(result.values, limits) as Record<string, CacheValue>,
    };
  }
  return {
    status: 'current',
    settings: admitRecord({
      ...settings,
      profiles: {
        ...settings.profiles,
        [profileId]: { ...profile, configurations },
      },
    }),
  };
};
