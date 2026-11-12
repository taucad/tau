import { z } from 'zod';
import { deviceRecordSchema, emptyDeviceRecord } from '#device-record.js';
import type { DeviceRecord } from '#device-record.js';
import { mergeLeaves } from '#leaf-merge.js';
import type { LeafPatch } from '#leaf-merge.js';
import { emptyOnboardingState, mergeOnboarding, onboardingStateSchema } from '#onboarding-state.js';
import type { OnboardingDelta, OnboardingState } from '#onboarding-state.js';
import { emptyPersonProfile, personProfileSchema } from '#person-profile.js';
import type { PersonProfile } from '#person-profile.js';
import { emptyViewerPreferences, viewerPreferencesSchema } from '#viewer-preferences.js';
import type { ViewerPreferences } from '#viewer-preferences.js';

/**
 * How a section is stored under its key. `synced` is the value and revision last synced with the account; it is
 * written only once account sync exists, so every launch device stores `value` alone.
 *
 * @public
 */
export type StoredSection<T> = { value: T; synced?: { value: T; revision: number } };

/**
 * The zod schema {@link storedSectionSchema} builds: `{ value }` with an optional `synced` half, both strict. It parses
 * to a {@link StoredSection} of the value schema's output.
 *
 * @public
 */
export type StoredSectionSchema<T extends z.ZodType> = z.ZodObject<{
  value: T;
  synced: z.ZodOptional<z.ZodObject<{ value: T; revision: z.ZodNumber }>>;
}>;

/**
 * The schema of a stored section around a value schema.
 *
 * @param value - The section's value schema.
 * @returns A strict schema accepting `{ value }` with or without the `synced` half.
 *
 * @public
 */
export const storedSectionSchema = <T extends z.ZodType>(value: T): StoredSectionSchema<T> =>
  z.strictObject({
    value,
    synced: z.strictObject({ value, revision: z.number().int().nonnegative() }).optional(),
  });

/**
 * One section of the person or device record: its schema, the value it reads as when empty, the version this build
 * knows and how a write merges into what is stored.
 *
 * @public
 */
export type SectionDefinition<T extends { version: number }, Write> = Readonly<{
  name: string;
  version: T['version'];
  schema: z.ZodType<T>;
  empty: T;
  merge: (stored: T, write: Write) => T;
}>;

/**
 * The `person-profile` section, written leaf by leaf.
 *
 * @public
 */
export const personProfileSection: SectionDefinition<PersonProfile, LeafPatch<PersonProfile>> = {
  name: 'person-profile',
  version: 1,
  schema: personProfileSchema,
  empty: emptyPersonProfile,
  merge: mergeLeaves,
};

/**
 * The `viewer-preferences` section, written leaf by leaf.
 *
 * @public
 */
export const viewerPreferencesSection: SectionDefinition<ViewerPreferences, LeafPatch<ViewerPreferences>> = {
  name: 'viewer-preferences',
  version: 1,
  schema: viewerPreferencesSchema,
  empty: emptyViewerPreferences,
  merge: mergeLeaves,
};

/**
 * The `onboarding` section, written as deltas that only add progress.
 *
 * @public
 */
export const onboardingSection: SectionDefinition<OnboardingState, OnboardingDelta> = {
  name: 'onboarding',
  version: 1,
  schema: onboardingStateSchema,
  empty: emptyOnboardingState,
  merge: mergeOnboarding,
};

/**
 * The `device` section, written leaf by leaf.
 *
 * @public
 */
export const deviceSection: SectionDefinition<DeviceRecord, LeafPatch<DeviceRecord>> = {
  name: 'device',
  version: 1,
  schema: deviceRecordSchema,
  empty: emptyDeviceRecord,
  merge: mergeLeaves,
};

/**
 * What a stored section reads as. `newer` is a section a later build wrote: it is neither parsed nor overwritten, and
 * the build behaves as if it were empty.
 *
 * @public
 */
export type SectionRead<T> =
  | Readonly<{ status: 'current'; value: T; stored: StoredSection<T> }>
  | Readonly<{ status: 'empty'; value: T }>
  | Readonly<{ status: 'newer'; value: T }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const versionOf = (value: unknown): unknown => (isRecord(value) ? value['version'] : undefined);

const isNewer = (version: unknown, known: number): boolean => typeof version === 'number' && version > known;

/**
 * Read a section from the raw text stored under its key.
 *
 * @param section - The section definition.
 * @param raw - The stored text, or `undefined` when the key is absent.
 * @returns The value, `empty` for an absent or unreadable section, or `newer` for one this build must leave alone.
 *
 * @example <caption>Read a stored profile</caption>
 * ```typescript
 * import { personProfileSection, readSection } from '@taucad/preferences';
 *
 * const read = readSection(personProfileSection, '{"value":{"version":1,"goals":["printing"],"languages":[]}}');
 * console.log(read.status); // 'current'
 * ```
 *
 * @public
 */
export const readSection = <T extends { version: number }, Write>(
  section: SectionDefinition<T, Write>,
  raw: string | undefined,
): SectionRead<T> => {
  if (raw === undefined) {
    return { status: 'empty', value: section.empty };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return { status: 'empty', value: section.empty };
  }
  if (!isRecord(json)) {
    return { status: 'empty', value: section.empty };
  }
  const { synced } = json;
  if (
    isNewer(versionOf(json['value']), section.version) ||
    (isRecord(synced) && isNewer(versionOf(synced['value']), section.version))
  ) {
    return { status: 'newer', value: section.empty };
  }
  const parsed = storedSectionSchema(section.schema).safeParse(json);
  if (!parsed.success) {
    return { status: 'empty', value: section.empty };
  }
  return { status: 'current', value: parsed.data.value, stored: parsed.data };
};

/**
 * The result of preparing a write from the raw text stored under the key.
 *
 * @public
 */
export type SectionWrite<T> =
  | Readonly<{ status: 'write'; value: T; raw: string }>
  | Readonly<{ status: 'newer'; value: T }>;

/**
 * Prepare a write in one synchronous step: read what is stored, merge the write into it and serialise the result. A
 * section a later build wrote is never overwritten. The `synced` half, when present, is kept as it was.
 *
 * @param section - The section definition.
 * @param raw - The text stored under the key, read immediately before this call.
 * @param write - What this write changes.
 * @returns The text to store and the merged value, or `newer` with the value merged over the empty section.
 * @throws When the merged value does not parse, which a typed write cannot cause except with an out-of-range number.
 *
 * @public
 */
export const prepareSectionWrite = <T extends { version: number }, Write>(
  section: SectionDefinition<T, Write>,
  raw: string | undefined,
  write: Write,
): SectionWrite<T> => {
  const read = readSection(section, raw);
  const value = section.schema.parse(section.merge(read.value, write));
  if (read.status === 'newer') {
    return { status: 'newer', value };
  }
  const stored: StoredSection<T> =
    read.status === 'current' && read.stored.synced !== undefined ? { value, synced: read.stored.synced } : { value };
  return { status: 'write', value, raw: JSON.stringify(stored) };
};
