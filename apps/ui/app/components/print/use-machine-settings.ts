import { useCallback, useSyncExternalStore } from 'react';
import type { RJSFSchema } from '@rjsf/utils';
import { slicingPreferences, slicingPreferencesSchema } from '@taucad/slicer/preferences';
import type { SlicingPreferences } from '@taucad/slicer/preferences';
import type { ConfigurationManifestV1 } from '@taucad/runtime/configuration';
import type { MachineProvider } from '@taucad/runtime/machine';
import type {
  MachineSettingsRecord,
  MachineSettingsValue,
  SavedMachineConfiguration,
  MachineTypeId,
  MachineSettingsProfile,
} from '@taucad/types';
import { useFileManager } from '#hooks/use-file-manager.js';
import { isJsonSchemaValid } from '#lib/rjsf-validator.js';
import type { SettingsProjection } from '#components/print/machine-settings-store.js';

/** A provider's own saved preferences, as its `settingsConfiguration` form names them. @public */
export type MachinePreferences = Readonly<Record<string, MachineSettingsValue>>;
/** The print intent: the slicing preferences, and the plate when the provider's settings keep one. @public */
export type PrintPreferences = SlicingPreferences & { readonly plate?: string };
export type PrintPreferencesEdit = (preferences: PrintPreferences) => PrintPreferences;
const loading: SettingsProjection = { file: { status: 'loading' }, pending: 0 };
const noPreferences = {};
const slicingResults = new WeakMap<SavedMachineConfiguration, ReturnType<typeof slicingPreferencesSchema.safeParse>>();
const defaultSlicing = slicingPreferencesSchema.safeParse(noPreferences);
const noMachinePreferences: MachinePreferences = {};

export type MachineSettingsHandle = SettingsProjection & {
  readonly record: MachineSettingsRecord | undefined;
  readonly typeId: MachineTypeId | undefined;
  readonly intent: PrintPreferences | undefined;
  /** The provider's own saved preferences; nothing for a provider that declares no settings. */
  readonly machine: MachinePreferences | undefined;
  readonly error: string | undefined;
  readonly update: (edit: PrintPreferencesEdit) => void;
  readonly updateMachine: (edit: (value: MachinePreferences) => MachinePreferences) => void;
  readonly updateRecord: (edit: (value: MachineSettingsRecord) => MachineSettingsRecord) => void;
  readonly reset: (allProfiles?: boolean) => void;
  readonly startingProfiles: (profiles: MachineSettingsRecord['profiles']) => void;
  readonly blocked: boolean;
  readonly selectionBlocked: boolean;
  readonly flush: () => Promise<void>;
  readonly checkSave: () => Promise<void>;
  readonly useLatest: () => Promise<void>;
  readonly retry: () => Promise<void>;
};

/** The JSON schema a provider's settings form validates against. */
const schemaOf = (settings: ConfigurationManifestV1): RJSFSchema =>
  // SAFETY: a configuration manifest's legacy projection is draft-07 JSON Schema, which RJSF's schema type describes.
  settings.legacyProjection.inputSchema as RJSFSchema;

/** Whether a provider's settings form keeps the plate, which Prepare shows beside the slicing preferences. */
const keepsPlate = (settings: ConfigurationManifestV1 | undefined): boolean =>
  settings !== undefined && typeof schemaOf(settings).properties?.['plate'] === 'object';

/**
 * Whether saved values are what a provider's settings form accepts.
 *
 * @param settings - The provider's settings form.
 * @param values - The saved values.
 * @returns True when they validate.
 */
const isValidPreferences = (settings: ConfigurationManifestV1, values: MachinePreferences): boolean =>
  isJsonSchemaValid(schemaOf(settings), values, schemaOf(settings));

type ResolvedPreferences = Readonly<{ preferences?: PrintPreferences; machine?: MachinePreferences; error?: string }>;
const emptyConfigurations: MachineSettingsProfile['configurations'] = {};
const projections = new WeakMap<
  MachineSettingsProfile['configurations'],
  Readonly<{ settings: ConfigurationManifestV1 | undefined; resolved: ResolvedPreferences }>
>();
const resolveSettings = (
  configurations: MachineSettingsProfile['configurations'],
  settings: ConfigurationManifestV1 | undefined,
): ResolvedPreferences => {
  const cached = projections.get(configurations);
  if (cached !== undefined && cached.settings === settings) {
    return cached.resolved;
  }
  const slicingBlock = configurations[slicingPreferences.manifest.source.id];
  const machineBlock = settings === undefined ? undefined : configurations[settings.source.id];
  const compute = (): ResolvedPreferences => {
    for (const [block, source] of [
      [slicingBlock, slicingPreferences.manifest.source],
      [machineBlock, settings?.source],
    ] as const) {
      if (block && source && block.version !== source.version) {
        return { error: `Saved ${source.id} version ${block.version} is unsupported.` };
      }
    }
    const unavailable = Object.keys(configurations).find(
      (id) => id !== slicingPreferences.manifest.source.id && id !== settings?.source.id,
    );
    if (unavailable) {
      return { error: `Saved configuration source ${unavailable} is unavailable.` };
    }
    const slicing = slicingBlock
      ? (slicingResults.get(slicingBlock) ?? slicingPreferencesSchema.safeParse(slicingBlock.values))
      : defaultSlicing;
    if (slicingBlock) {
      slicingResults.set(slicingBlock, slicing);
    }
    const machine = machineBlock?.values ?? noMachinePreferences;
    if (!slicing.success || (settings !== undefined && !isValidPreferences(settings, machine))) {
      return { error: 'The active profile contains invalid settings. Edit its saved record before using it.' };
    }
    const plate = keepsPlate(settings) ? machine['plate'] : undefined;
    return {
      preferences: { ...slicing.data, ...(typeof plate === 'string' ? { plate } : {}) },
      ...(settings === undefined ? {} : { machine }),
    };
  };
  const resolved = compute();
  projections.set(configurations, { settings, resolved });
  return resolved;
};

/**
 * One profile with the provider's settings block replaced by `values`, validated by the provider's form.
 *
 * @param profile - The profile.
 * @param settings - The provider's settings form.
 * @param values - The new values.
 * @returns The profile's configurations after the edit.
 * @throws When the values are not what the form accepts.
 */
const withMachinePreferences = (
  profile: MachineSettingsProfile,
  settings: ConfigurationManifestV1,
  values: MachinePreferences,
): MachineSettingsProfile['configurations'] => {
  if (!isValidPreferences(settings, values)) {
    throw new TypeError(`The ${settings.source.id} settings are not valid.`);
  }
  return {
    ...profile.configurations,
    [settings.source.id]: { version: settings.source.version, values },
  };
};

/**
 * Resolve sparse, source-versioned preferences from the root's shared projection: the slicing preferences every
 * printer shares, and the provider's own block under its `settingsConfiguration` source id.
 *
 * @param provider - The selected machine's provider; its manifest names the type, its settings form the block.
 * @returns The handle.
 * @public
 */
export const useMachineSettings = (provider: MachineProvider | undefined): MachineSettingsHandle => {
  const { machineSettings } = useFileManager();
  const typeId = provider?.manifest.identity.typeId;
  const settings = provider?.settingsConfiguration;
  const subscribe = useCallback(
    (notify: () => void) => (typeId ? machineSettings.subscribe(typeId, notify) : () => undefined),
    [machineSettings, typeId],
  );
  const snapshot = useCallback(() => (typeId ? machineSettings.get(typeId) : loading), [machineSettings, typeId]);
  const state = useSyncExternalStore(subscribe, snapshot, () => loading);
  const record =
    state.draft ??
    (state.file.status === 'current' ? state.file.record : state.file.status === 'absent' ? state.starting : undefined);
  const active = record?.profiles[record.activeProfile];
  const resolved = resolveSettings(active?.configurations ?? emptyConfigurations, settings);
  const updateRecord = useCallback(
    (edit: (value: MachineSettingsRecord) => MachineSettingsRecord) => {
      if (typeId) {
        machineSettings.update(typeId, edit);
      }
    },
    [machineSettings, typeId],
  );
  const updateMachine = useCallback(
    (edit: (value: MachinePreferences) => MachinePreferences) => {
      if (settings === undefined) {
        return;
      }
      updateRecord((value) => {
        const profile = value.profiles[value.activeProfile]!;
        const prior = profile.configurations[settings.source.id]?.values ?? noMachinePreferences;
        return {
          ...value,
          profiles: {
            ...value.profiles,
            [value.activeProfile]: {
              ...profile,
              configurations: withMachinePreferences(profile, settings, edit(prior)),
            },
          },
        };
      });
    },
    [settings, updateRecord],
  );
  const update = useCallback(
    (edit: PrintPreferencesEdit) => {
      updateRecord((value) => {
        const profile = value.profiles[value.activeProfile]!;
        const slicing = slicingPreferencesSchema.parse(
          profile.configurations[slicingPreferences.manifest.source.id]?.values ?? {},
        );
        const machine =
          settings === undefined ? noMachinePreferences : (profile.configurations[settings.source.id]?.values ?? {});
        const keeps = keepsPlate(settings);
        const prior = keeps ? machine['plate'] : undefined;
        const { plate, ...next } = edit({ ...slicing, ...(typeof prior === 'string' ? { plate: prior } : {}) });
        const values = slicingPreferencesSchema.parse(next);
        const { plate: _plate, ...otherMachine } = machine;
        const configurations = {
          ...profile.configurations,
          [slicingPreferences.manifest.source.id]: { version: slicingPreferences.manifest.source.version, values },
        };
        return {
          ...value,
          profiles: {
            ...value.profiles,
            [value.activeProfile]: {
              ...profile,
              /* The plate lives in the provider's own block when its form keeps one; otherwise it is not saved. */
              configurations:
                settings !== undefined && keeps
                  ? withMachinePreferences(
                      { ...profile, configurations },
                      settings,
                      plate ? { ...otherMachine, plate } : otherMachine,
                    )
                  : configurations,
            },
          },
        };
      });
    },
    [settings, updateRecord],
  );
  const startingProfiles = useCallback(
    (profiles: MachineSettingsRecord['profiles']) => {
      if (typeId) {
        machineSettings.startingProfiles(typeId, profiles);
      }
    },
    [machineSettings, typeId],
  );
  const reset = useCallback(
    (allProfiles = false) => {
      updateRecord((value) => ({
        ...value,
        profiles: Object.fromEntries(
          Object.entries(value.profiles).map(([id, profile]) => [
            id,
            profile && (allProfiles || id === value.activeProfile)
              ? {
                  ...profile,
                  configurations: Object.fromEntries(
                    Object.entries(profile.configurations).filter(
                      ([source]) => source !== slicingPreferences.manifest.source.id && source !== settings?.source.id,
                    ),
                  ),
                }
              : profile,
          ]),
        ),
      }));
    },
    [settings, updateRecord],
  );
  const error =
    resolved.error ??
    (state.failure
      ? state.failure.result.message
      : (state.observation?.error ??
        (state.file.status === 'refused' || state.file.status === 'unavailable' ? state.file.message : undefined)));
  return {
    ...state,
    record,
    typeId,
    intent: resolved.preferences,
    machine: resolved.machine,
    error,
    update,
    updateMachine,
    updateRecord,
    reset,
    startingProfiles,
    blocked:
      Boolean(error) ||
      state.file.status === 'loading' ||
      state.observation?.status === 'registering' ||
      state.observation?.status === 'pending',
    selectionBlocked:
      Boolean(state.failure) ||
      state.observation?.status === 'registering' ||
      state.observation?.status === 'pending' ||
      state.observation?.status === 'closed' ||
      state.observation?.status === 'error' ||
      state.file.status === 'loading' ||
      state.file.status === 'refused' ||
      state.file.status === 'unavailable',
    flush: async (): Promise<void> => {
      if (error) {
        throw new Error(error);
      }
      if (typeId) {
        await machineSettings.flush(typeId);
      }
    },
    checkSave: async (): Promise<void> => {
      if (typeId) {
        await machineSettings.checkSave(typeId);
      }
    },
    retry: async (): Promise<void> => {
      if (typeId) {
        await machineSettings.refresh(typeId);
      }
    },
    useLatest: async (): Promise<void> => {
      if (typeId) {
        await machineSettings.useLatest(typeId);
      }
    },
  };
};
