import { useCallback, useSyncExternalStore } from 'react';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
import { slicingPreferences, slicingPreferencesSchema } from '@taucad/slicer/preferences';
import type { SlicingPreferences } from '@taucad/slicer/preferences';
import type { MachineManifest } from '@taucad/runtime/machine';
import type {
  MachineSettingsRecord,
  SavedMachineConfiguration,
  MachineTypeId,
  MachineSettingsProfile,
} from '@taucad/types';
import { useFileManager } from '#hooks/use-file-manager.js';
import type { SettingsProjection } from '#components/print/machine-settings-store.js';

export type PrintPreferences = SlicingPreferences &
  Pick<ReturnType<typeof bambuSettingsConfiguration.schema.parse>, 'plate'>;
export type PrintPreferencesEdit = (preferences: PrintPreferences) => PrintPreferences;
const loading: SettingsProjection = { file: { status: 'loading' }, pending: 0 };
const noPreferences = {};
const slicingResults = new WeakMap<SavedMachineConfiguration, ReturnType<typeof slicingPreferencesSchema.safeParse>>();
const machineResults = new WeakMap<
  SavedMachineConfiguration,
  ReturnType<typeof bambuSettingsConfiguration.schema.safeParse>
>();
const defaultSlicing = slicingPreferencesSchema.safeParse(noPreferences);
const defaultMachine = bambuSettingsConfiguration.schema.safeParse(noPreferences);

type BambuPreferences = ReturnType<typeof bambuSettingsConfiguration.schema.parse>;
export type MachineSettingsHandle = SettingsProjection & {
  readonly record: MachineSettingsRecord | undefined;
  readonly typeId: MachineTypeId | undefined;
  readonly intent: PrintPreferences | undefined;
  readonly machine: BambuPreferences | undefined;
  readonly error: string | undefined;
  readonly update: (edit: PrintPreferencesEdit) => void;
  readonly updateMachine: (edit: (value: BambuPreferences) => BambuPreferences) => void;
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

type ResolvedPreferences = Readonly<{ preferences?: PrintPreferences; machine?: BambuPreferences; error?: string }>;
const emptyConfigurations: MachineSettingsProfile['configurations'] = {};
const projections = new WeakMap<MachineSettingsProfile['configurations'], ResolvedPreferences>();
const resolveSettings = (configurations = emptyConfigurations): ResolvedPreferences => {
  const cached = projections.get(configurations);
  if (cached) {
    return cached;
  }
  const slicingBlock = configurations[slicingPreferences.manifest.source.id];
  const machineBlock = configurations[bambuSettingsConfiguration.manifest.source.id];
  const compute = (): ResolvedPreferences => {
    for (const [block, definition] of [
      [slicingBlock, slicingPreferences],
      [machineBlock, bambuSettingsConfiguration],
    ] as const) {
      if (block && block.version !== definition.manifest.source.version) {
        return {
          error: `Saved ${definition.manifest.source.id} version ${block.version} is unsupported.`,
        };
      }
    }
    const unavailable = Object.keys(configurations).find(
      (id) => id !== slicingPreferences.manifest.source.id && id !== bambuSettingsConfiguration.manifest.source.id,
    );
    if (unavailable) {
      return {
        error: `Saved configuration source ${unavailable} is unavailable.`,
      };
    }
    const slicing = slicingBlock
      ? (slicingResults.get(slicingBlock) ?? slicingPreferencesSchema.safeParse(slicingBlock.values))
      : defaultSlicing;
    const machine = machineBlock
      ? (machineResults.get(machineBlock) ?? bambuSettingsConfiguration.schema.safeParse(machineBlock.values))
      : defaultMachine;
    if (slicingBlock) {
      slicingResults.set(slicingBlock, slicing);
    }
    if (machineBlock) {
      machineResults.set(machineBlock, machine);
    }
    if (!slicing.success || !machine.success) {
      return {
        error: 'The active profile contains invalid settings. Edit its saved record before using it.',
      };
    }
    return {
      preferences: {
        ...slicing.data,
        ...(machine.data.plate ? { plate: machine.data.plate } : {}),
      },
      machine: machine.data,
    };
  };
  const resolved = compute();
  projections.set(configurations, resolved);
  return resolved;
};

/** Resolve sparse, source-versioned preferences from the root's shared projection. */
export const useMachineSettings = (manifest: MachineManifest | undefined): MachineSettingsHandle => {
  const { machineSettings } = useFileManager();
  const typeId = manifest?.identity.typeId;
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
  const resolved = resolveSettings(active?.configurations);
  const updateRecord = useCallback(
    (edit: (value: MachineSettingsRecord) => MachineSettingsRecord) => {
      if (typeId) {
        machineSettings.update(typeId, edit);
      }
    },
    [machineSettings, typeId],
  );
  const updateMachine = useCallback(
    (
      edit: (
        value: ReturnType<typeof bambuSettingsConfiguration.schema.parse>,
      ) => ReturnType<typeof bambuSettingsConfiguration.schema.parse>,
    ) => {
      updateRecord((value) => {
        const profile = value.profiles[value.activeProfile]!;
        const prior = profile.configurations[bambuSettingsConfiguration.manifest.source.id];
        const preferences = bambuSettingsConfiguration.schema.parse(
          edit(bambuSettingsConfiguration.schema.parse(prior?.values ?? {})),
        );
        return {
          ...value,
          profiles: {
            ...value.profiles,
            [value.activeProfile]: {
              ...profile,
              configurations: {
                ...profile.configurations,
                [bambuSettingsConfiguration.manifest.source.id]: {
                  version: bambuSettingsConfiguration.manifest.source.version,
                  values: preferences,
                },
              },
            },
          },
        };
      });
    },
    [updateRecord],
  );
  const update = useCallback(
    (edit: PrintPreferencesEdit) => {
      updateRecord((value) => {
        const profile = value.profiles[value.activeProfile]!;
        const slicing = slicingPreferencesSchema.parse(
          profile.configurations[slicingPreferences.manifest.source.id]?.values ?? {},
        );
        const machine = bambuSettingsConfiguration.schema.parse(
          profile.configurations[bambuSettingsConfiguration.manifest.source.id]?.values ?? {},
        );
        const { plate, ...next } = edit({
          ...slicing,
          ...(machine.plate ? { plate: machine.plate } : {}),
        });
        const values = slicingPreferencesSchema.parse(next);
        const { plate: _plate, ...otherMachine } = machine;
        return {
          ...value,
          profiles: {
            ...value.profiles,
            [value.activeProfile]: {
              ...profile,
              configurations: {
                ...profile.configurations,
                [slicingPreferences.manifest.source.id]: {
                  version: slicingPreferences.manifest.source.version,
                  values,
                },
                [bambuSettingsConfiguration.manifest.source.id]: {
                  version: bambuSettingsConfiguration.manifest.source.version,
                  values: { ...otherMachine, ...(plate ? { plate } : {}) },
                },
              },
            },
          },
        };
      });
    },
    [updateRecord],
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
                      ([source]) =>
                        source !== slicingPreferences.manifest.source.id &&
                        source !== bambuSettingsConfiguration.manifest.source.id,
                    ),
                  ),
                }
              : profile,
          ]),
        ),
      }));
    },
    [updateRecord],
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
