/* oxlint-disable typescript/no-restricted-types -- Persisted JSON admits null, and checked transitions use null for observed file absence. */
/** Deeply immutable JSON value in persisted machine preferences. @public */
export type MachineSettingsValue =
  | null
  | string
  | number
  | boolean
  | readonly MachineSettingsValue[]
  | { readonly [key: string]: MachineSettingsValue };
/** Stable namespaced machine type. Admission requires canonical, path-safe spelling. @public */
export type MachineTypeId = `${string}.${string}`;
/** Stable profile slug independent of its label. @public */
export type MachineProfileId = string;
/** Source-versioned sparse configuration values. @public */
export type SavedMachineConfiguration = Readonly<{
  version: string;
  values: Readonly<Record<string, MachineSettingsValue>>;
}>;
/** Independent named preferences. @public */
export type MachineSettingsProfile = Readonly<{
  name: string;
  configurations: Readonly<Partial<Record<string, SavedMachineConfiguration>>>;
}>;
/** Canonical versioned machine preferences wire record. @public */
export type MachineSettingsRecord = Readonly<{
  version: 1;
  typeId: MachineTypeId;
  activeProfile: MachineProfileId;
  profiles: Readonly<Partial<Record<MachineProfileId, MachineSettingsProfile>>>;
}>;
/** Envelope refusal; callers preserve original bytes. @public */
export type MachineSettingsFailure = Readonly<{
  status: 'refused';
  code: 'INVALID_RECORD' | 'NEWER_RECORD' | 'MACHINE_TYPE_MISMATCH';
  message: string;
  pointer?: string;
}>;
/** One root-authority acquisition, independent of write health. @public */
export type MachineSettingsSnapshot =
  | Readonly<{ status: 'current'; record: MachineSettingsRecord }>
  | MachineSettingsFailure
  | Readonly<{ status: 'absent' }>
  | Readonly<{
      status: 'unavailable';
      code: 'SETTINGS_UNAVAILABLE';
      message: string;
    }>;
/** Captured, idempotent record transition. @public */
export type MachineSettingsEdit = Readonly<{
  operationId: string;
  typeId: MachineTypeId;
  base: MachineSettingsRecord | null;
  next: MachineSettingsRecord;
}>;
/** A terminal or uncertain save result. @public */
export type MachineSettingsSave =
  | Readonly<{ status: 'saved'; record: MachineSettingsRecord }>
  | Readonly<{
      status: 'conflict';
      message: string;
      current: MachineSettingsSnapshot;
    }>
  | Readonly<{ status: 'refused' | 'uncertain'; message: string }>;
/** Machine preference facet served only from an admitted rooted host. @public */
export type MachineSettingsService = Readonly<{
  readMachineSettings(typeId: MachineTypeId): Promise<MachineSettingsSnapshot>;
  editMachineSettings(input: MachineSettingsEdit): Promise<MachineSettingsSave>;
  machineSettingsSettlement(operationId: string): Promise<MachineSettingsSave>;
}>;
