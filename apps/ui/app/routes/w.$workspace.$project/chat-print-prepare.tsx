import type { MachineSettingsProvenance } from '@taucad/runtime/machine/settings';
import { printerPreparation } from '#components/printer/printer-preparation.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { defaultFilamentSlots, machineSliceOptions } from '@taucad/agent-tools/registry';
import { Check, Eye, Layers, ListChecks, LoaderCircle, Scissors, Send, Settings2 } from 'lucide-react';
import type { JSONSchema7, JSONSchema7Definition } from '@taucad/json-schema';
import type { ParameterManifest } from '@taucad/parameters';
import type {
  MachineArtifactReference,
  MachineCheckJobInput,
  MachineClient,
  MachineDirectoryEntry,
  MachineFffProcess,
  MachineJobCheck,
  MachineManifest,
  MachineProgramSummary,
  MachineProvider,
  MaterialSlotAddress,
} from '@taucad/runtime/machine';
import { fffProcessOf } from '@taucad/runtime/machine';
import { slicingPreferencesSchema } from '@taucad/slicer/preferences';
import type { PrintPreferences, MachineSettingsHandle } from '#components/print/use-machine-settings.js';
import { MachineProfiles } from '#components/print/machine-profiles.js';
import type { FileExtension } from '@taucad/types';
import { asKnownArtifact } from '@taucad/runtime';
import type { Rendering } from '@taucad/runtime';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { sha256Bytes } from '@taucad/utils/hash';
import { randomUuid } from '@taucad/utils/id';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { BambuStudioPresets, shortPresetName } from '#components/print/bambu-studio-presets.js';
import { FilamentSlots } from '#components/print/filament-slots.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { SearchInput } from '#components/search-input.js';
import {
  bambuOwnedSubmissionFields,
  bambuPreferencesOf,
  bambuSubmissionSlots,
  chosenBambuFilament,
  rememberBambuSubmission,
  savedBambuSlots,
  useBambuStudio,
  withBambuSubmissionSlots,
} from '#components/print/use-bambu-studio.js';
import type { BambuQualityPreset, BambuStudioMode } from '#components/print/use-bambu-studio.js';
import { useMachineSettings } from '#components/print/use-machine-settings.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { compileExportConfigurationManifest } from '#routes/w.$workspace.$project/chat-converter.js';
import { useFileReturn } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { listGeometryEntryPaths } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import { selectCadFailureIssues } from '#machines/cad.machine.js';
import {
  PrintDisclosure,
  PrintNotice,
  PrintRow,
  PrintStage,
} from '#routes/w.$workspace.$project/chat-print-section.js';
import { operator } from '#hooks/use-machine-control.js';
import {
  describePrintError,
  formatQuantity,
  materialSystemValue,
  observedPlate,
  observedSlots,
  sameSlot,
  slotKey,
} from '#components/print/machine-facts.js';
import type { ObservedSlot } from '#components/print/machine-facts.js';
import { JobChecks, startBlocker } from '#routes/w.$workspace.$project/chat-print-send.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import {
  fitsPlate,
  formatDuration,
  formatFilament,
  formatProducer,
  formatSize,
} from '#routes/w.$workspace.$project/chat-print-summary.js';
import type { PlateFit } from '#routes/w.$workspace.$project/chat-print-summary.js';
import type { SliceSummary } from '#components/printer/printer-summary.js';
import { bestRouteForActiveKernel, exportDocumentWithValidatedInput } from '#utils/export-formats.utils.js';

/** The export target every print goes through (blueprint D3). */
const gcodeContainerFormat: FileExtension = 'gcode.3mf';
const printUnits = { length: { displaySymbol: 'mm' } } as const;

/**
 * The submission form a provider's jobs carry; an empty form for a machine that takes no jobs.
 *
 * @param provider - The provider.
 * @returns Its submission configuration manifest.
 */
const submissionOf = (provider: MachineProvider): MachineProvider['bindingConfiguration'] =>
  provider.manifest.jobs.type === 'supported' ? provider.manifest.jobs.submission : emptySubmission;

/** A machine without jobs submits nothing. */
const emptySubmission: MachineProvider['bindingConfiguration'] = {
  version: 1,
  source: { id: 'tau.no-submission', version: '1' },
  parameters: {
    input: { status: 'unsupported', defaults: {}, diagnostics: [] },
    output: { status: 'unsupported', defaults: {}, diagnostics: [] },
  },
  legacyProjection: {
    dialect: 'draft-07',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
  },
  ui: { version: 1, rjsf: {} },
};

/** A slot's remaining filament as a select option's secondary text. */
const withRemaining = (percent: number | undefined): Readonly<{ secondary?: string }> =>
  percent === undefined ? {} : { secondary: `${String(percent)} %` };

/** What a submission may hold: the canonical JSON the host reads. */
type SubmissionValue = MachineCheckJobInput['configuration'];

/**
 * Whether a value is canonical JSON the host can read: no `undefined`, no non-finite number, no class instance.
 *
 * @param value - Any value.
 * @returns True for canonical JSON.
 */
const isSubmissionValue = (value: unknown): value is SubmissionValue =>
  value === null ||
  typeof value === 'boolean' ||
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (Array.isArray(value)
    ? value.every((item) => isSubmissionValue(item))
    : isRecordObject(value) && Object.values(value).every((item) => isSubmissionValue(item)));

/**
 * The artifact reference a slice becomes for one provider: its container, and the member the machine runs.
 *
 * @param input - The project, the slice and the provider.
 * @returns The reference, or why the provider cannot take it.
 */
const artifactFor = ({
  projectId,
  slice,
  provider,
}: Readonly<{ projectId: string; slice: SlicedArtifact; provider: MachineProvider }>):
  | Readonly<{ artifact: MachineArtifactReference }>
  | Readonly<{ refusal: string }> => {
  const accepts = provider.manifest.jobs.type === 'supported' ? provider.manifest.jobs.accepts : [];
  const accepted = accepts.find((container) => container.mediaType === slice.mimeType) ?? accepts[0];
  if (accepted === undefined) {
    return { refusal: `${provider.name} takes no jobs.` };
  }
  /* The provider names the member it runs; one that names none cannot say which plate to print. */
  const [selectedMember] = accepted.requiredMembers;
  if (selectedMember === undefined) {
    return { refusal: `${provider.name} does not name the program inside a ${accepted.mediaType} file.` };
  }
  /* The host finds the project by its `tau.json` id and re-verifies the bytes by digest on every use. */
  return {
    artifact: {
      projectId,
      path: slice.path,
      digest: slice.digest,
      length: slice.length,
      mediaType: accepted.mediaType,
      contract: accepted.contract,
      selectedMember,
    },
  };
};

/** How long the configuration must stay unchanged before the machine checks the job. Milliseconds. */
const checkDelay = 300;

/** A draft-7 schema and the defaults its owner declares. @public */
export type ResolvedSchema = Readonly<{ schema: JSONSchema7; defaults: Record<string, unknown> }>;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/** The reference-slicer options a print intent may hold; the others describe the machine and stay on screen. */
const intentOptionKeys: ReadonlySet<string> = new Set(
  Object.keys(slicingPreferencesSchema.shape.options.unwrap().shape),
);

/**
 * Apply one Advanced form change to the print intent: `preset` and the reference options it may
 * hold, each set or removed as the form left it. Only the keys that changed are touched, so a
 * change another writer made to a different key survives.
 *
 * @param intent - The intent the change applies to.
 * @param next - The form's modified values after the change.
 * @param keys - The intent keys whose value changed.
 * @returns The next intent.
 */
const withOptionChanges = (
  intent: PrintPreferences,
  next: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): PrintPreferences => {
  const { preset, options, ...rest } = intent;
  const changed = Object.fromEntries(
    keys.filter((key) => key !== 'preset').map((key): [string, unknown] => [key, next[key]]),
  );
  const merged = Object.fromEntries(
    Object.entries<unknown>({ ...options, ...changed }).filter(([, value]) => value !== undefined),
  );
  // SAFETY: the form checks each value against the slicer's schema, and the serializer validates it again.
  const nextPreset = (keys.includes('preset') ? next['preset'] : preset) as PrintPreferences['preset'];
  // SAFETY: as above; only the keys `intentOptionKeys` names reach this record.
  const nextOptions = merged as PrintPreferences['options'];
  return {
    ...rest,
    ...(nextPreset === undefined ? {} : { preset: nextPreset }),
    ...(Object.keys(merged).length === 0 ? {} : { options: nextOptions }),
  };
};

/** Whether a print intent holds anything beyond its model. */
const hasIntentChanges = (intent: PrintPreferences | undefined): boolean =>
  intent !== undefined && Object.keys(intent).some((key) => key !== 'model');

const modelName = (entryPath: string): string => (entryPath.split('/').pop() ?? entryPath).replace(/\.[^.]+$/u, '');

/** One sliced artifact written into the project and ready to send. @public */
export type SlicedArtifact = Readonly<{
  path: string;
  fileName: string;
  digest: MachineArtifactReference['digest'];
  length: number;
  mimeType: string;
  /** The slicer options this artifact was produced from; a different key means the slice is stale. */
  optionsKey: string;
  /** The committed rendering it was sliced from; a new rendering makes the slice stale. */
  rendering: Rendering | undefined;
  /** The material identity and slots approved by this slice, held across later telemetry frames. */
  materialConfiguration: Readonly<Record<string, unknown>>;
  summary: SliceSummary;
  fit: PlateFit | undefined;
  /** What the slicer warned about a slice it still made, such as a model's colours printing as one. */
  warnings: readonly string[];
}>;

const noColors: readonly string[] = [];
/**
 * Values owned by the machine or the visible Prepare controls, not separate Advanced choices: Bambu's own keys, and the
 * start options the provider declares as on/off, which Start options shows.
 */
const preparedFields = (provider: MachineProvider | undefined): ReadonlySet<string> =>
  new Set([
    ...bambuOwnedSubmissionFields(provider),
    ...startOptionsOf(provider && (submissionOf(provider).legacyProjection.inputSchema as JSONSchema7)).map(
      ({ key }) => key,
    ),
  ]);
const observedDiameterFields = new Set(['expectedFilamentDiameter', 'expectedNozzleDiameter']);

/** The submission schema's own defaults, by key. */
const schemaDefaultsOf = (provider: MachineProvider): Record<string, unknown> => {
  const schema = submissionOf(provider).legacyProjection.inputSchema as JSONSchema7;
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).flatMap(([key, property]) =>
      typeof property === 'object' && property.default !== undefined ? [[key, property.default] as const] : [],
    ),
  );
};

/**
 * What Prepare sends for a check: the person's choices and the mapping it shows, without a value that only repeats
 * the schema's own default, which the provider applies itself (R5: what the program was sliced for, such as an
 * empty `expectedMaterials`, is the provider's to read from the program).
 *
 * @param effective - The submission as Prepare shows it.
 * @param own - What the person chose.
 * @param provider - The provider that owns the schema.
 * @returns The configuration to check.
 */
const chosenSubmission = (
  effective: Readonly<Record<string, unknown>>,
  own: Readonly<Record<string, unknown>>,
  provider: MachineProvider,
): Record<string, unknown> => {
  const defaults = schemaDefaultsOf(provider);
  return Object.fromEntries(
    Object.entries(effective).filter(
      ([key, value]) => key in own || !(key in defaults) || JSON.stringify(value) !== JSON.stringify(defaults[key]),
    ),
  );
};

const advancedSubmissionValues = (
  provider: MachineProvider | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> => {
  const prepared = preparedFields(provider);
  return Object.fromEntries(Object.entries(values).filter(([key]) => !prepared.has(key)));
};

/**
 * The slot each filament prints from unless someone chooses: the first loaded slot for one, as the agent's planner
 * maps several over the slots that can change filament mid-print ({@link defaultFilamentSlots}), undefined where no
 * free slot of the print's material is left.
 */
const defaultMapping = (
  slots: readonly ObservedSlot[],
  loaded: ObservedSlot | undefined,
  filamentColors: readonly string[],
): ReadonlyArray<MaterialSlotAddress | undefined> => {
  if (loaded?.materialId === undefined) {
    return [];
  }
  if (filamentColors.length < 2) {
    return [loaded.address];
  }
  // The planner numbers slots only to tell them apart; its numbers here are positions in `slots`.
  const numbered = slots.map((slot, index) => ({ ...slot, slot: index }));
  return defaultFilamentSlots(filamentColors, numbered, loaded.materialId).map((index) =>
    index === undefined ? undefined : slots[index]?.address,
  );
};

/**
 * The person's starting choices for a submission: the schema's own defaults, the provider's declared defaults and the
 * slot each filament prints from. What the program was sliced for (its model, nozzle, plate and materials) the
 * provider reads from the program when it checks the job ({@link MachineJobCheck}), so the pane never writes it.
 * The mapping is written in the provider's own words ({@link withBambuSubmissionSlots}), so a provider whose form names
 * none never receives one. A slice of several filaments maps each to a loaded slot as the agent's planner does
 * ({@link defaultFilamentSlots}); a filament no free slot can take is left unmapped.
 *
 * @param provider - The provider that owns the submission schema.
 * @param entry - The machine as observed.
 * @param known - The colours of the filaments the last slice prints, in filament order.
 * @returns The choices the Prepare controls start from.
 * @public
 */
export const submissionDefaults = (
  provider: MachineProvider,
  entry: MachineDirectoryEntry,
  { filamentColors = noColors }: Readonly<{ filamentColors?: readonly string[] }>,
): Record<string, unknown> => {
  const projection = submissionOf(provider).parameters.input;
  const declared = projection.status === 'usable' ? { ...projection.declaration.defaults } : {};
  // A provider's optional flags may keep their defaults only in the schema (Bambu: bed leveling and flow calibration
  // on); Prepare shows them, and sends none it only repeats ({@link chosenSubmission}).
  const schemaDefaults = schemaDefaultsOf(provider);
  const loaded = observedSlots(entry).find(
    (material) => material.state === 'loaded' && material.materialId !== undefined,
  );
  // Only a feeder changes filament mid-print; the external spool feeds one-filament prints.
  const feeders = observedSlots(entry).filter((material) => !material.isExternal);
  const mapping = defaultMapping(feeders, loaded, filamentColors);
  const defaults = { ...schemaDefaults, ...declared };
  // ponytail: the slot mapping is the Bambu submission's (`amsMapping`); a provider whose form names it otherwise
  // needs its own codec beside Bambu's.
  return Object.fromEntries(
    Object.entries(mapping.length > 0 ? withBambuSubmissionSlots(provider, defaults, mapping) : defaults).filter(
      ([, value]) => value !== undefined,
    ),
  );
};

/**
 * Apply one manifest preset to the slicer options through the option the
 * slicer actually declares: `preset` when it has one, its layer height otherwise.
 *
 * @param options - The current modified options.
 * @param preset - The manifest preset chosen.
 * @param schema - The slicer's option schema.
 * @returns The next modified options.
 * @public
 */
export const applyPreset = (
  options: Record<string, unknown>,
  preset: MachineFffProcess['slicing']['presets'][number],
  schema: JSONSchema7 | undefined,
): Record<string, unknown> => {
  const properties = schema?.properties ?? {};
  if ('preset' in properties) {
    return { ...options, preset: preset.id };
  }
  if ('layerHeight' in properties) {
    return { ...options, layerHeight: preset.layerHeight.value };
  }
  return options;
};

/**
 * Compile a provider configuration schema into the parameter manifest the
 * shared Parameters renderer needs (blueprint R4). The declared defaults keep
 * the manifest stable across telemetry; observed defaults go to the form.
 *
 * @param provider - The provider or route the schema belongs to.
 * @param configuration - The configuration name inside that provider.
 * @param resolved - The draft-7 schema and its declared defaults.
 * @returns The manifest once compiled for the current schema.
 * @public
 */
export const useCompiledConfigurationManifest = (
  provider: string | undefined,
  configuration: string,
  resolved: ResolvedSchema | undefined,
): ParameterManifest | undefined => {
  const [compiled, setCompiled] = useState<{
    readonly resolved: ResolvedSchema;
    readonly manifest: ParameterManifest;
  }>();
  useEffect(() => {
    if (!provider || !resolved) {
      return;
    }
    let cancelled = false;
    const compile = async (): Promise<void> => {
      try {
        const { manifest } = await compileExportConfigurationManifest(provider, configuration, resolved);
        if (!cancelled) {
          setCompiled({ resolved, manifest });
        }
      } catch (error) {
        /* The form stays in its preparing state; the slice still runs on the values entered so far. */
        console.error(`[print] Could not compile the ${configuration} form for ${provider}.`, error);
      }
    };
    // async-iife: bootstrap -- the manifest is derived from the schema; a newer schema simply supersedes this compile.
    void compile();
    return () => {
      cancelled = true;
    };
  }, [configuration, provider, resolved]);
  return compiled !== undefined && compiled.resolved === resolved ? compiled.manifest : undefined;
};

/** Everything the Prepare step knows, owned above the pane so orientation can name the next action. @public */
export type PrintPrepare = Readonly<{
  entryPath: string;
  entryPaths: readonly string[];
  setEntryPath: (entryPath: string) => void;
  hasGeometry: boolean;
  route: ReturnType<typeof bestRouteForActiveKernel>;
  /** Bambu Studio's presets and settings when the machine is a Bambu printer. */
  studio: BambuStudioMode;
  /** The colours of the filaments the last slice prints, in filament order; one row each when there are several. */
  filamentColors: readonly string[];
  /** The slot each filament prints from, in filament order; undefined for a filament given none yet. */
  slots: ReadonlyArray<MaterialSlotAddress | undefined>;
  /** Print one filament from another slot; a filament already there takes this one's slot. */
  selectFilamentSlot: (filament: number, slot: MaterialSlotAddress) => void;
  /** Print a one-filament slice from this slot. */
  selectMaterial: (slot: MaterialSlotAddress) => void;
  /** Whether Bambu Studio slices, rather than the slicer route's own engine. */
  isBambuStudio: boolean;
  /** The project's print settings in `.tau/machines/settings/<typeId>.json`. */
  machineSettings: MachineSettingsHandle;
  /** Why the slice button waits, when it does. */
  sliceBlocker: string | undefined;
  optionsSchema: ResolvedSchema | undefined;
  /** The reference slicer's changed options: the print intent's, and the machine's own kept on screen. */
  options: Record<string, unknown>;
  setOptions: (options: Record<string, unknown>) => void;
  submissionSchema: ResolvedSchema | undefined;
  submission: Record<string, unknown>;
  setSubmission: (submission: Record<string, unknown>) => void;
  effectiveSubmission: Record<string, unknown>;
  /** The plate Prepare slices for: picked, reported by the machine, or the model's first. */
  plate: string | undefined;
  sendConfiguration: Record<string, unknown>;
  /** The machine's check of the fresh slice with this configuration, once it answered. */
  jobCheck: MachineJobCheck | undefined;
  slice: SlicedArtifact | undefined;
  isSliceStale: boolean;
  /** Why the slice no longer matches the model or its options, in the person's words. */
  staleReason: string | undefined;
  isSlicing: boolean;
  sliceError: string | undefined;
  sliceNow: () => Promise<void>;
  cancelSlice: () => void;
  openPreview: () => void;
  /** Open the one confirmation every start passes through. */
  /** Create the request and approve it: the host uploads and starts (blueprint D12). */
  send: () => Promise<void>;
  isSending: boolean;
  sendError: string | undefined;
  /** Why sending is not possible right now, in the person's words. */
  sendBlocker: string | undefined;
}>;

/**
 * Own the Prepare step: which model, which slicer options, the last slice and
 * the request it becomes. Drafts live here, apart from telemetry, so a machine
 * frame never resets them.
 *
 * @param input - The machine, its provider and its manifest.
 * @returns The prepare state and its actions.
 * @public
 */
export const usePrintPrepare = ({
  client,
  entry,
  provider,
  manifest,
  isShown = true,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry | undefined;
  readonly provider: MachineProvider | undefined;
  readonly manifest: MachineManifest | undefined;
  readonly isShown?: boolean;
}): PrintPrepare => {
  const { projectId, projectRef, geometryUnits, mainEntryPath, editorRef, viewRecords, entriesRecord } = useProject();
  const fileManager = useFileManager();
  const [chosenEntryPath, setEntryPath] = useState<string>();
  const entryPaths = useMemo(
    () => listGeometryEntryPaths(geometryUnits, viewRecords, mainEntryPath),
    [geometryUnits, viewRecords, mainEntryPath],
  );
  const entryPath =
    chosenEntryPath !== undefined && entryPaths.includes(chosenEntryPath) ? chosenEntryPath : mainEntryPath;
  const operationTimeout = entriesRecord?.entries[entryPath]?.renderTimeout;
  useEffect(() => {
    if (!isShown || !entryPath) {
      return;
    }
    const claimId = randomUuid();
    projectRef.send({ type: 'claimGeometryUnit', claimId, entryPath, operationTimeout });
    return () => {
      projectRef.send({ type: 'releaseGeometryUnit', claimId });
    };
  }, [entryPath, isShown, projectRef, operationTimeout]);
  const actor = useSelector(projectRef, (state) => state.context.geometryUnits.get(entryPath));
  const kernelClient = useSelector(actor, (state) => state?.context.kernelClient);
  const activeKernelId = useSelector(actor, (state) => state?.context.activeKernelId);
  const capabilities = useSelector(actor, (state) => state?.context.capabilities);
  const rendering = useSelector(actor, (state) => state?.context.rendering);
  const artifact = useMemo(() => (rendering?.success ? asKnownArtifact(rendering.artifact) : undefined), [rendering]);
  const hasGeometry = artifact !== undefined;

  const route = useMemo(
    () =>
      kernelClient && activeKernelId && capabilities
        ? bestRouteForActiveKernel(kernelClient, gcodeContainerFormat, activeKernelId)
        : undefined,
    [activeKernelId, capabilities, kernelClient],
  );
  const submissionSchema = useMemo<ResolvedSchema | undefined>(() => {
    if (!provider) {
      return undefined;
    }
    const projection = submissionOf(provider).parameters.input;
    return {
      schema: submissionOf(provider).legacyProjection.inputSchema as JSONSchema7,
      defaults: projection.status === 'usable' ? { ...projection.declaration.defaults } : {},
    };
  }, [provider]);

  const machineSettings = useMachineSettings(provider);
  const { intent, update: updateIntent } = machineSettings;
  /* Reference options no print intent may hold (the machine's nozzle, bed and plate, the engine) stay on screen. */
  const [screenOptions, setScreenOptions] = useState<Record<string, unknown>>({});
  const [transientSubmission, setTransientSubmission] =
    useState<Readonly<{ key: string; values: Record<string, unknown> }>>();
  const [slice, setSlice] = useState<SlicedArtifact>();
  const [isSlicing, setIsSlicing] = useState(false);
  const sliceController = useRef<
    { readonly controller: AbortController; readonly entryPath: string; readonly optionsKey: string } | undefined
  >(undefined);
  const cancelSlice = useCallback(() => {
    sliceController.current?.controller.abort();
    sliceController.current = undefined;
    setIsSlicing(false);
  }, []);
  useEffect(
    () => () => {
      sliceController.current?.controller.abort();
    },
    [],
  );
  /* Kept with the geometry it described, so a new render retires it (a failure on an empty model must not outlive it). */
  const [failedSlice, setFailedSlice] = useState<Readonly<{ message: string; rendering: Rendering | undefined }>>();
  const sliceError = failedSlice !== undefined && failedSlice.rendering === rendering ? failedSlice.message : undefined;
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const requestIdRef = useRef<{ readonly key: string; readonly requestId: string }>(undefined);

  const modelColors = useMemo(() => {
    if (artifact?.mimeType !== 'model/gltf-binary') {
      return noColors;
    }
    try {
      const components = buildGltfComponentManifest(artifact.content);
      const materials = components.nodesById[components.rootId]?.appearance?.materials ?? [];
      return [...new Set(materials.flatMap(({ color }) => (color?.startsWith('#') ? [color.toUpperCase()] : [])))];
    } catch {
      return noColors;
    }
  }, [artifact]);
  const filamentColors =
    slice !== undefined && slice.rendering === rendering ? slice.summary.filamentColors : modelColors;
  const preferenceKey = `${machineSettings.typeId ?? ''}:${machineSettings.record?.activeProfile ?? 'default'}:${entry?.machineId ?? ''}`;
  const submission = useMemo<Record<string, unknown>>(() => {
    const preferences = bambuPreferencesOf(provider, machineSettings.machine);
    const { material: _material, plate: _plate, ...flags } = preferences ?? {};
    const fallback =
      entry && provider ? bambuSubmissionSlots(provider, submissionDefaults(provider, entry, { filamentColors })) : [];
    /* Saved slots are the machine type's; one this printer has not loaded (another X1C's A4 on the simulator)
     * gives way to the default rather than selecting nothing. */
    const isLoaded = (slot: MaterialSlotAddress | undefined): slot is MaterialSlotAddress =>
      slot !== undefined &&
      entry !== undefined &&
      observedSlots(entry).some((observed) => sameSlot(slot, observed.address) && observed.state === 'loaded');
    const saved = savedBambuSlots(preferences, filamentColors);
    const mapping =
      filamentColors.length > 1
        ? saved.some((slot) => isLoaded(slot))
          ? saved.map((slot, index) => (isLoaded(slot) ? slot : fallback[index]))
          : []
        : saved.filter((slot) => isLoaded(slot));
    return {
      ...withBambuSubmissionSlots(provider, flags, mapping),
      ...(transientSubmission?.key === preferenceKey ? transientSubmission.values : {}),
    };
  }, [machineSettings.machine, filamentColors, entry, provider, transientSubmission, preferenceKey]);
  const setSubmission = useCallback(
    (next: Record<string, unknown>): void => {
      /* Bambu's own keys are remembered in its preferences or completed by the provider; every other choice passes. */
      const owned = bambuOwnedSubmissionFields(provider);
      setTransientSubmission({
        key: preferenceKey,
        values: Object.fromEntries(Object.entries(next).filter(([key]) => !owned.has(key))),
      });
      /* Only Bambu's settings remember the choices; another provider's form keeps what it declares. */
      machineSettings.updateMachine((prior) => {
        const bambu = bambuPreferencesOf(provider, prior);
        return bambu === undefined ? prior : rememberBambuSubmission(bambu, next, filamentColors);
      });
    },
    [machineSettings.updateMachine, preferenceKey, filamentColors, provider],
  );

  /* The plate to slice for: the one picked here, else the one the machine reports, else the model's first. It is
   * Prepare's choice, never a submission field: the provider reads the plate a program was sliced for from it. */
  const plate =
    intent?.plate ??
    (entry === undefined ? undefined : observedPlate(entry)) ??
    (manifest === undefined ? undefined : fffProcessOf(manifest)?.bed.plates[0]?.id);
  const effectiveSubmission = useMemo(() => {
    if (!provider || !entry) {
      return submission;
    }
    /* A mapping made for another number of filaments (a material picked before the slice showed several colours)
     * gives way to the defaults for this slice's filaments. */
    const ownMapping = bambuSubmissionSlots(provider, submission);
    const own = withBambuSubmissionSlots(provider, submission, []);
    const colorsConfirmed =
      slice?.rendering !== rendering ||
      modelColors.length === 0 ||
      (modelColors.length === filamentColors.length &&
        modelColors.every((color, index) => color === filamentColors[index]));
    const isOwnMapping =
      (filamentColors.length < 2 || ownMapping.length === 0 || ownMapping.length === filamentColors.length) &&
      colorsConfirmed;
    const effective: Record<string, unknown> = {
      ...submissionDefaults(provider, entry, { filamentColors }),
      ...(isOwnMapping ? submission : own),
    };
    // The plate picked here is what the person says is installed when the machine cannot report it.
    if (
      observedPlate(entry) === undefined &&
      plate !== undefined &&
      'operatorConfirmedBedType' in (submissionSchema?.schema.properties ?? {})
    ) {
      effective['operatorConfirmedBedType'] = plate;
    }
    return effective;
  }, [entry, filamentColors, modelColors, plate, provider, slice?.rendering, submission, submissionSchema]);
  /* The slot each filament prints from, kept while its content is the same so a telemetry frame reloads nothing. */
  const slotsKey = JSON.stringify(bambuSubmissionSlots(provider, effectiveSubmission));
  /* Keyed by content: a new array with the same slots is the same mapping, so it is rebuilt from the key. */
  const slots = useMemo(
    (): ReadonlyArray<MaterialSlotAddress | undefined> =>
      // JSON writes an empty slot as null; `?? undefined` restores it.
      (JSON.parse(slotsKey) as ReadonlyArray<MaterialSlotAddress | undefined>).map((slot) => slot ?? undefined),
    [slotsKey],
  );
  const studio = useBambuStudio({ provider, entry, manifest, plate, mapping: slots, intent, update: updateIntent });
  const selectFilamentSlot = useCallback(
    (filament: number, slot: MaterialSlotAddress) => {
      if (!entry) {
        return;
      }
      /* Slots stay one filament's each: the filament that held this slot takes the one given up. */
      const previous = slots[filament];
      const next = slots.map((current, index) =>
        index === filament ? slot : current !== undefined && sameSlot(slot, current) ? previous : current,
      );
      setSubmission(withBambuSubmissionSlots(provider, submission, next));
    },
    [entry, provider, slots, submission, setSubmission],
  );
  const selectMaterial = useCallback(
    (slot: MaterialSlotAddress) => {
      setSubmission(withBambuSubmissionSlots(provider, submission, [slot]));
    },
    [provider, setSubmission, submission],
  );
  const isBambuStudio = studio.status === 'ready' || studio.status === 'checking';
  /* The machine's own slicer options under the person's, so the Advanced form and the slice agree. */
  const machineOptions = useMemo(
    () => (manifest && plate ? machineSliceOptions(manifest, plate) : {}),
    [manifest, plate],
  );
  /* The material loaded where the first filament prints from, which a reference slice records for the printer's
   * filament check. It is read when slicing and is not a slice option the slice goes stale on: a spool changed later
   * is the machine's check to report against what the file says. */
  const material =
    entry === undefined ? undefined : observedSlots(entry).find((slot) => sameSlot(slot.address, slots[0]))?.materialId;
  const optionsSchema = useMemo<ResolvedSchema | undefined>(
    () =>
      route && Object.keys(route.exportOptions.schema).length > 0
        ? {
            schema: route.exportOptions.schema,
            defaults: {
              ...(isRecordObject(route.exportOptions.defaults) ? route.exportOptions.defaults : {}),
              ...machineOptions,
            },
          }
        : undefined,
    [machineOptions, route],
  );
  const qualityPreset = (manifest === undefined ? undefined : fffProcessOf(manifest))?.slicing.presets.find(
    ({ id }) => id === intent?.preset,
  );
  const options = useMemo<Record<string, unknown>>(
    () => ({
      ...screenOptions,
      ...(qualityPreset === undefined ? {} : applyPreset({}, qualityPreset, optionsSchema?.schema)),
      ...intent?.options,
    }),
    [intent, optionsSchema, qualityPreset, screenOptions],
  );
  const setOptions = useCallback(
    (next: Record<string, unknown>) => {
      setScreenOptions(
        Object.fromEntries(Object.entries(next).filter(([key]) => !intentOptionKeys.has(key) && key !== 'preset')),
      );
      const keys = [...new Set([...Object.keys(options), ...Object.keys(next)])].filter(
        (key) => (key === 'preset' || intentOptionKeys.has(key)) && !sameValue(options[key], next[key]),
      );
      if (keys.length > 0) {
        updateIntent((current) => withOptionChanges(current, next, keys));
      }
    },
    [options, updateIntent],
  );
  /* Bambu Studio slices with its own presets; the reference options apply only to the slicer route's own engine. */
  const bambuExportOptions = studio.exportOptions;
  const sliceOptions = useMemo(
    () => (isBambuStudio ? bambuExportOptions : { ...machineOptions, ...options }),
    [bambuExportOptions, isBambuStudio, machineOptions, options],
  );
  const optionsKey = JSON.stringify([sliceOptions ?? null, submission]);
  useEffect(
    () => () => {
      const active = sliceController.current;
      if (active?.entryPath === entryPath && active.optionsKey === optionsKey) {
        cancelSlice();
      }
    },
    [entryPath, optionsKey, cancelSlice],
  );
  const sliceBlocker = ((): string | undefined => {
    // The settings file's own failure is shown with the profile; slicing waits for it to load.
    if (machineSettings.blocked) {
      return machineSettings.error === undefined ? 'Loading print settings…' : 'Waiting for the print settings file.';
    }
    if (!isBambuStudio || sliceOptions !== undefined) {
      return undefined;
    }
    if (studio.error !== undefined) {
      return studio.error;
    }
    return studio.status === 'checking' ? 'Checking for Bambu Studio…' : 'Loading Bambu Studio presets…';
  })();
  const changed = ((): 'model' | 'options' | undefined => {
    if (slice === undefined) {
      return undefined;
    }
    if (slice.rendering !== rendering) {
      return 'model';
    }
    return slice.optionsKey === optionsKey ? undefined : 'options';
  })();
  const isSliceStale = changed !== undefined;
  const staleReason =
    changed === 'model'
      ? 'The model changed since this slice. Slice again to send the current model.'
      : changed === 'options'
        ? 'Options changed since this slice. Slice again to send the current settings.'
        : undefined;

  const sliceNow = useCallback(async (): Promise<void> => {
    if (!actor || !kernelClient || !route || sliceOptions === undefined) {
      return;
    }
    sliceController.current?.controller.abort();
    const controller = new AbortController();
    const activeSlice = { controller, entryPath, optionsKey };
    sliceController.current = activeSlice;
    const started = performance.now();
    const claimId = randomUuid();
    projectRef.send({ type: 'claimGeometryUnit', claimId, entryPath, operationTimeout });
    setIsSlicing(true);
    setFailedSlice(undefined);
    let sliceRendering = rendering;
    let releaseRenderWatch: (() => void) | undefined;
    let stageStarted = started;
    const recordStage = (stage: string): void => {
      const end = performance.now();
      const name = `tau.printer.slice.${stage}`;
      performance.clearMeasures(name);
      performance.measure(name, { start: stageStarted, end });
      stageStarted = end;
    };

    try {
      await machineSettings.flush();
      const settled = await awaitFreshRender(actor, { signal: controller.signal });
      controller.signal.throwIfAborted();
      recordStage('fresh-render');
      const failedIssues = selectCadFailureIssues(settled);
      if (failedIssues) {
        throw new Error(failedIssues.map((issue) => issue.message).join('; ') || 'The selected CAD render failed');
      }
      if (settled.context.latestRenderingOutcome !== 'success') {
        throw new Error(`No current successful geometry is available for ${entryPath}`);
      }
      sliceRendering = settled.context.rendering;
      const renderWatch = actor.subscribe({
        next: () => {
          if (actor.getSnapshot().context.openAttempt > settled.context.openAttempt) {
            controller.abort(new DOMException('The design changed during slicing.', 'AbortError'));
          }
        },
      });
      releaseRenderWatch = (): void => {
        renderWatch.unsubscribe();
      };

      const freshKernelClient = settled.context.kernelClient;
      const freshDocument = settled.context.document;
      const freshKernelId = settled.context.activeKernelId;
      const freshRoute = freshKernelClient
        ? bestRouteForActiveKernel(freshKernelClient, gcodeContainerFormat, freshKernelId)
        : undefined;
      if (!freshKernelClient || !freshRoute || !freshDocument) {
        throw new Error('The selected CAD runtime is unavailable');
      }
      const result = await exportDocumentWithValidatedInput(freshDocument, freshRoute, {
        /* The person's own filament type, set under Advanced, wins over the loaded tray's. */
        options: isBambuStudio || material === undefined ? sliceOptions : { filamentType: material, ...sliceOptions },
        signal: controller.signal,
      });
      recordStage('export');
      if (!result.success) {
        throw new Error(result.issues.map((issue) => issue.message).join('; ') || 'Slicing failed.');
      }
      const file = result.files[0];
      controller.signal.throwIfAborted();
      const freshRenderId = settled.context.openAttempt;

      const fileName = `${modelName(entryPath)}.gcode.3mf`;
      const hex = await sha256Bytes(file.bytes);
      recordStage('hash');
      // SAFETY: sha256Bytes returns the lowercase hex the digest brand describes.
      const digest = `sha256:${hex}` as MachineArtifactReference['digest'];
      /* Named by its bytes, as job imports are (blueprint D5), so a later slice never rewrites what a request names. */
      controller.signal.throwIfAborted();
      const path = `.tau/artifacts/${hex}/${fileName}`;
      const isHeld = (await fileManager.exists(path)) && (await sha256Bytes(await fileManager.readFile(path))) === hex;
      controller.signal.throwIfAborted();
      if (!isHeld) {
        await fileManager.writeFiles({ [path]: { content: file.bytes } });
      }
      recordStage('artifact');
      const prepared = await printerPreparation.prepare({
        bytes: file.bytes,
        kind: 'container',
        signal: controller.signal,
        retain: false,
      });
      recordStage('prepare');
      const summary = prepared.kind === 'ready' ? prepared.value.summary : prepared.summary;
      if (actor.getSnapshot().context.openAttempt > freshRenderId) {
        throw new Error('The design changed during slicing. Slice the current design again.');
      }
      controller.signal.throwIfAborted();
      performance.clearMeasures('tau.printer.slice-to-summary');
      performance.measure('tau.printer.slice-to-summary', {
        start: started,
        end: performance.now(),
        detail: {
          bytes: file.bytes.byteLength,
          preparationDuration: prepared.preparationDuration,
          stages: prepared.stageDurations,
        },
      });
      const buildVolume = manifest === undefined ? undefined : fffProcessOf(manifest)?.geometry.buildVolume;
      const warnings = result.issues.filter(({ severity }) => severity === 'warning').map(({ message }) => message);
      const defaults =
        provider && entry ? submissionDefaults(provider, entry, { filamentColors: summary.filamentColors }) : {};
      const ownMapping = bambuSubmissionSlots(provider, submission);
      const colorsMatch =
        modelColors.length === 0 ||
        (modelColors.length === summary.filamentColors.length &&
          modelColors.every((color, index) => color === summary.filamentColors[index]));
      const mapping =
        ownMapping.length === Math.max(1, summary.filamentColors.length) && colorsMatch
          ? ownMapping
          : bambuSubmissionSlots(provider, defaults);
      setSlice({
        path,
        fileName,
        digest,
        length: file.bytes.byteLength,
        mimeType: file.mimeType,
        rendering: sliceRendering,
        materialConfiguration: entry === undefined ? {} : withBambuSubmissionSlots(provider, {}, mapping),
        optionsKey,
        summary,
        /* A plate too large to preview has no bounds to check; the printer checks its own. */
        fit:
          buildVolume === undefined || summary.bounds === undefined
            ? undefined
            : fitsPlate({ bounds: summary.bounds, partBounds: summary.partBounds }, buildVolume),
        warnings,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailedSlice({ message: error instanceof Error ? error.message : String(error), rendering: sliceRendering });
      }
    } finally {
      releaseRenderWatch?.();
      if (sliceController.current === activeSlice) {
        sliceController.current = undefined;
        setIsSlicing(false);
      }
      projectRef.send({ type: 'releaseGeometryUnit', claimId });
    }
  }, [
    machineSettings.flush,
    actor,
    entry,
    entryPath,
    fileManager,
    isBambuStudio,
    material,
    rendering,
    kernelClient,
    manifest,
    modelColors,
    optionsKey,
    provider,
    projectRef,
    operationTimeout,
    route,
    sliceOptions,
    submission,
  ]);

  const fileReturn = useFileReturn();
  const openPreview = useCallback((): void => {
    if (!slice) {
      return;
    }
    // The preview's tab offers one way back here; outside a project workspace it opens as any file does.
    if (fileReturn) {
      fileReturn.openFileFrom(slice.path, 'print');
    } else {
      editorRef.send({ type: 'openFile', path: slice.path, source: 'user' });
    }
  }, [editorRef, fileReturn, slice]);

  const chosen =
    provider === undefined ? effectiveSubmission : chosenSubmission(effectiveSubmission, submission, provider);
  const sendConfiguration = slice ? { ...chosen, ...slice.materialConfiguration } : chosen;
  /* The configuration as the host reads it: canonical JSON, so the check below depends on its words, not identity. */
  const configurationKey = JSON.stringify(sendConfiguration);
  const machineId = entry?.machineId;
  /* What the machine holds in each slot: a spool changed after the check is checked again, a reading that changes
   * nothing else is not. */
  const traysKey = JSON.stringify(
    entry === undefined
      ? []
      : observedSlots(entry).map(({ address, state, materialId }) => [address, state, materialId]),
  );
  const checkKey = JSON.stringify([slice?.digest, machineId, configurationKey, traysKey]);
  const [checked, setChecked] = useState<Readonly<{ key: string; check: MachineJobCheck }>>();
  const jobCheck = checked?.key === checkKey ? checked.check : undefined;
  /* Once a fresh slice exists, the machine checks the job (debounced) and completes the configuration from what it
   * reports; the pane shows its checks and sends what it completed. Nothing is recorded until the person sends. */
  useEffect(() => {
    if (slice === undefined || isSliceStale || provider === undefined || machineId === undefined) {
      return;
    }
    const key = JSON.stringify([slice.digest, machineId, configurationKey, traysKey]);
    const refuse = (code: `MACHINE_JOB_${string}`, message: string): void => {
      setChecked({ key, check: { status: 'refused', code, message } });
    };
    const reference = artifactFor({ projectId, slice, provider });
    const configuration: unknown = JSON.parse(configurationKey);
    if ('refusal' in reference) {
      refuse('MACHINE_JOB_ARTIFACT_INVALID', reference.refusal);
      return;
    }
    if (!isSubmissionValue(configuration)) {
      refuse('MACHINE_JOB_CONFIGURATION_INVALID', 'The print settings hold a value the machine cannot read.');
      return;
    }
    const abort = new AbortController();
    const timer = globalThis.setTimeout(() => {
      const ask = async (): Promise<void> => {
        try {
          const check = await client.checkJob({
            machineId,
            artifact: reference.artifact,
            configuration,
            signal: abort.signal,
          });
          if (!abort.signal.aborted) {
            setChecked({ key, check });
          }
        } catch (error) {
          if (!abort.signal.aborted) {
            setChecked({
              key,
              check: { status: 'refused', code: 'MACHINE_PREPARATION_FAILED', message: describePrintError(error) },
            });
          }
        }
      };
      // async-iife: check -- the answer lands in state; a newer configuration aborts this one.
      void ask();
    }, checkDelay);
    return () => {
      globalThis.clearTimeout(timer);
      abort.abort();
    };
  }, [client, configurationKey, isSliceStale, machineId, projectId, provider, slice, traysKey]);

  const sendBlocker = ((): string | undefined => {
    if (machineSettings.blocked) {
      return machineSettings.error ?? 'Loading machine settings…';
    }
    if (!entry || !provider) {
      return 'Choose a machine first.';
    }
    if (!slice) {
      return 'Slice the model first.';
    }
    if (changed !== undefined) {
      return `The ${changed} changed since this slice. Slice again before sending.`;
    }
    if (slice.fit && !slice.fit.fits) {
      return slice.fit.message;
    }
    const unmapped = filamentColors.length > 1 ? slots.indexOf(undefined) : -1;
    if (unmapped >= 0) {
      return `Filament ${String(unmapped + 1)} has no slot. Choose a loaded slot for it before sending.`;
    }
    const blocker = startBlocker(entry);
    if (blocker !== undefined) {
      return blocker;
    }
    if (jobCheck === undefined) {
      return `Checking the job with ${entry.name}…`;
    }
    if (jobCheck.status === 'refused') {
      return jobCheck.message;
    }
    const blocked = jobCheck.checks.find((check) => check.state === 'blocked');
    return jobCheck.status === 'ready'
      ? undefined
      : blocked === undefined
        ? `${entry.name} cannot take this job yet.`
        : [blocked.label, blocked.detail].filter((part) => part !== undefined).join(': ');
  })();

  const send = useCallback(async (): Promise<void> => {
    if (!slice || !entry || !provider || sendBlocker !== undefined || jobCheck?.status !== 'ready') {
      return;
    }
    setIsSending(true);
    setSendError(undefined);
    try {
      await machineSettings.flush();
      const reference = artifactFor({ projectId, slice, provider });
      if ('refusal' in reference) {
        throw new Error(reference.refusal);
      }
      const preferences: MachineSettingsProvenance | undefined = machineSettings.typeId
        ? {
            scope: 'project',
            typeId: machineSettings.typeId,
            profileId: machineSettings.record?.activeProfile ?? 'default',
            configurationVersions: Object.fromEntries(
              Object.entries(
                machineSettings.record?.profiles[machineSettings.record.activeProfile]?.configurations ?? {},
              ).flatMap(([id, block]) => (block ? [[id, block.version]] : [])),
            ),
          }
        : undefined;
      const { configuration } = jobCheck;
      const key = JSON.stringify([slice.digest, entry.machineId, configuration, preferences]);
      if (requestIdRef.current?.key !== key) {
        requestIdRef.current = { key, requestId: randomUuid() };
      }
      const facts: MachineProgramSummary['facts'] =
        fffProcessOf(provider.manifest) === undefined
          ? { process: 'other' }
          : { process: 'fff', layers: slice.summary.layers, filamentLength: slice.summary.filamentLength };
      /* The job waits for the person's review above the stages: its checks, what they vouch for, then Start. It
       * carries the configuration the machine completed when it checked the job. */
      await client.requestJob({
        machineId: entry.machineId,
        artifact: reference.artifact,
        configuration,
        requestedBy: operator,
        program: {
          name: slice.fileName,
          ...(preferences ? { preferences } : {}),
          estimatedDuration: Math.round(slice.summary.estimatedDuration * 1000),
          ...(slice.summary.producer === undefined ? {} : { producer: slice.summary.producer }),
          facts,
        },
        jobId: requestIdRef.current.requestId,
      });
    } catch (error) {
      setSendError(describePrintError(error));
    } finally {
      setIsSending(false);
    }
  }, [client, entry, jobCheck, projectId, provider, sendBlocker, slice, machineSettings]);

  return {
    entryPath,
    entryPaths,
    setEntryPath,
    hasGeometry,
    route,
    studio,
    filamentColors,
    slots,
    selectFilamentSlot,
    selectMaterial,
    isBambuStudio,
    machineSettings,
    sliceBlocker,
    optionsSchema,
    options,
    setOptions,
    submissionSchema,
    submission,
    setSubmission,
    effectiveSubmission,
    plate,
    sendConfiguration,
    jobCheck,
    slice,
    staleReason,
    isSliceStale,
    isSlicing,
    sliceError,
    sliceNow,
    cancelSlice,
    openPreview,
    send,
    isSending,
    sendError,
    sendBlocker,
  };
};

function QualityChoice({
  presets,
  options,
  isModified,
  onSelect,
  onReset,
}: {
  readonly presets: MachineFffProcess['slicing']['presets'];
  readonly options: Record<string, unknown>;
  /** Whether the print intent holds a quality preset. */
  readonly isModified: boolean;
  readonly onSelect: (preset: MachineFffProcess['slicing']['presets'][number]) => void;
  readonly onReset: () => void;
}): React.JSX.Element {
  const active = options['preset'] ?? options['layerHeight'];
  const selected = presets.find((preset) => active === preset.id || active === preset.layerHeight.value)?.id ?? '';
  return (
    <PrintSetupRow label='Quality' isModified={isModified} onReset={onReset}>
      <ParameterSelect
        label='Quality'
        value={selected}
        groups={[
          {
            options: presets.map((preset) => ({
              value: preset.id,
              label: preset.label,
              secondary: formatQuantity(preset.layerHeight),
            })),
          },
        ]}
        onChange={(value) => {
          const preset = presets.find((candidate) => candidate.id === value);
          if (preset) {
            onSelect(preset);
          }
        }}
      />
    </PrintSetupRow>
  );
}

function MaterialSelect({
  entry,
  selected,
  override,
  onSelect,
  isModified,
  onReset,
}: {
  readonly entry: MachineDirectoryEntry;
  /** The slot the print feeds from, when one is chosen. */
  readonly selected: MaterialSlotAddress | undefined;
  /** The Bambu Studio filament preset chosen over the printer's for that slot. */
  readonly override: string | undefined;
  readonly onSelect: (slot: MaterialSlotAddress) => void;
  readonly isModified: boolean;
  readonly onReset: () => void;
}): React.JSX.Element {
  const materials = observedSlots(entry);
  const remaining = materialSystemValue(entry)?.slots;
  if (materials.length === 0) {
    return <p className='text-xs text-muted-foreground'>No material slots observed.</p>;
  }
  // The slot and how it is sliced are one choice; an override set in Advanced settings is named here.
  return (
    <PrintSetupRow
      label='Material'
      description={override === undefined ? undefined : `Sliced as ${shortPresetName(override)}`}
      isModified={isModified}
      onReset={onReset}
    >
      <ParameterSelect
        label='Material'
        value={selected === undefined ? '' : slotKey(selected)}
        groups={[
          {
            options: materials.map((material) => ({
              value: slotKey(material.address),
              label: `${material.label} · ${material.materialId ?? (material.state === 'empty' ? 'Empty' : 'Unknown')}`,
              ...withRemaining(remaining?.find((slot) => sameSlot(slot.slot, material.address))?.remainingPercent),
              ...(material.color === undefined ? {} : { swatch: material.color.slice(0, 7) }),
              disabled: material.state !== 'loaded' || material.materialId === undefined,
            })),
          },
        ]}
        onChange={(value) => {
          const material = materials.find((candidate) => slotKey(candidate.address) === value);
          if (material?.materialId) {
            onSelect(material.address);
          }
        }}
      />
    </PrintSetupRow>
  );
}

/** One material chip row for a one-colour print; a slot per filament for a slice that prints several. */
function MaterialChoice({
  entry,
  filamentColors,
  slots,
  override,
  isModified,
  onSelectMaterial,
  onSelectFilamentSlot,
  onResetMaterial,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly filamentColors: readonly string[];
  /** The slot each filament prints from, in filament order. */
  readonly slots: ReadonlyArray<MaterialSlotAddress | undefined>;
  /** The Bambu Studio filament preset chosen over the printer's for a one-filament print's slot. */
  readonly override: string | undefined;
  readonly isModified: boolean;
  readonly onSelectMaterial: (slot: MaterialSlotAddress) => void;
  readonly onSelectFilamentSlot: (filament: number, slot: MaterialSlotAddress) => void;
  readonly onResetMaterial: () => void;
}): React.JSX.Element {
  if (filamentColors.length < 2) {
    return (
      <div role='group' aria-label='Material'>
        <MaterialSelect
          entry={entry}
          selected={slots[0]}
          override={override}
          isModified={isModified}
          onReset={onResetMaterial}
          onSelect={onSelectMaterial}
        />
      </div>
    );
  }
  const observed = observedSlots(entry);
  // Only a feeder changes filament mid-print; the external spool feeds one-filament prints.
  const feeders = observed.filter(
    (material) => material.state === 'loaded' && material.materialId !== undefined && !material.isExternal,
  );
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <FilamentSlots colors={filamentColors} mapping={slots} slots={feeders} onChange={onSelectFilamentSlot} />
      {observed.some((material) => material.isExternal) ? (
        <p className='text-xs text-muted-foreground'>The external spool feeds one-filament prints only.</p>
      ) : null}
    </div>
  );
}

const formatWeight = (grams: number): string => `${String(Math.round(grams * 10) / 10)} g`;

/** The one decision Prepare offers next: slice, or send a fresh slice. @public */
export type PrepareAction = Readonly<{
  label: string;
  kind: 'slice' | 'send' | 'none';
  /** Why the action waits, shown under its disabled button. */
  blocker?: string;
}>;

/** What {@link prepareAction} reads. @public */
export type PrepareActionFacts = Pick<
  PrintPrepare,
  'slice' | 'isSliceStale' | 'isSlicing' | 'route' | 'sliceBlocker' | 'sendBlocker'
>;

/**
 * Prepare's primary action from its own state. A fresh slice that cannot be sent says why (a busy
 * machine, the wrong spool, no current observation) rather than offering to slice again.
 *
 * @param prepare - The prepare state.
 * @returns The action.
 * @public
 */
export const prepareAction = (prepare: PrepareActionFacts): PrepareAction => {
  if (prepare.isSlicing) {
    return { label: 'Slicing…', kind: 'slice' };
  }
  if (prepare.slice && !prepare.isSliceStale) {
    return {
      label: 'Review print',
      kind: 'send',
      ...(prepare.sendBlocker === undefined ? {} : { blocker: prepare.sendBlocker }),
    };
  }
  if (prepare.route === undefined) {
    return { label: 'Slicing unavailable', kind: 'none' };
  }
  return {
    label: prepare.slice ? 'Slice again' : 'Slice and preview',
    kind: 'slice',
    ...(prepare.sliceBlocker === undefined ? {} : { blocker: prepare.sliceBlocker }),
  };
};

/**
 * Prepare's primary action: the action bar's content, or the end of a folded Prepare. Review print
 * asks the machine for a job, which waits above the stages for the person's review; the machine's checks of the
 * slice and their remedies come first.
 *
 * @param properties - The prepare state and the control remedies are sent through.
 * @returns The actions, or nothing while slicing is unavailable.
 * @public
 */
export function PrepareActions({
  prepare,
  control,
}: {
  readonly prepare: PrintPrepare;
  readonly control: MachineControl;
}): React.JSX.Element | undefined {
  const action = prepareAction(prepare);
  const { isSlicing, isSending, sendError, jobCheck } = prepare;
  if (action.kind === 'none') {
    return undefined;
  }
  if (action.kind === 'send') {
    /* The machine's own checks of this slice, with what clears each; passed ones stay quiet until it is sent. */
    const unmet = jobCheck === undefined || jobCheck.status === 'refused' ? [] : jobCheck.checks;
    return (
      <>
        {sendError ? <PrintNotice tone='error'>{sendError}</PrintNotice> : null}
        {unmet.some((check) => check.state !== 'passed') ? (
          <JobChecks control={control} checks={unmet.filter((check) => check.state !== 'passed')} />
        ) : null}
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <Button type='button' size='sm' variant='outline' onClick={prepare.openPreview}>
            <Eye aria-hidden />
            Preview
          </Button>
          <Button
            type='button'
            size='sm'
            className='ml-auto'
            aria-describedby={action.blocker === undefined ? undefined : 'print-send-blocker'}
            disabled={action.blocker !== undefined || isSending}
            onClick={() => {
              void prepare.send();
            }}
          >
            {isSending ? (
              <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
            ) : (
              <Send aria-hidden />
            )}
            {action.label}
          </Button>
        </div>
        {action.blocker === undefined ? null : (
          <p id='print-send-blocker' className='text-xs text-muted-foreground'>
            {action.blocker}
          </p>
        )}
      </>
    );
  }
  // A Bambu Studio failure is already shown with the presets; the wait is stated only while loading.
  const waiting = prepare.studio.error === undefined ? action.blocker : undefined;
  return (
    <>
      <div className='flex min-w-0 flex-wrap items-center justify-end gap-2'>
        {isSlicing ? (
          <Button type='button' variant='ghost' size='sm' onClick={prepare.cancelSlice}>
            Cancel slicing
          </Button>
        ) : null}
        <Button
          type='button'
          size='sm'
          disabled={isSlicing || !prepare.hasGeometry || action.blocker !== undefined}
          aria-describedby={waiting === undefined ? undefined : 'print-slice-blocker'}
          onClick={prepare.sliceNow}
        >
          {isSlicing ? (
            <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
          ) : (
            <Scissors aria-hidden />
          )}
          {action.label}
        </Button>
      </div>
      {waiting === undefined ? null : (
        <p id='print-slice-blocker' role='status' aria-busy='true' className='text-xs text-muted-foreground'>
          {waiting}
        </p>
      )}
    </>
  );
}

/** The slice's file, estimates, bounds, plate fit and producer, on request. */
function SliceDetails({ slice }: { readonly slice: NonNullable<PrintPrepare['slice']> }): React.JSX.Element {
  const { summary, fit } = slice;
  return (
    <dl className='flex flex-col gap-0.5'>
      <PrintRow label='File'>
        <span className='font-mono break-all'>{slice.fileName}</span>
      </PrintRow>
      <PrintRow label='Time'>
        {formatDuration(summary.estimatedDuration)}
        {summary.isSlicerEstimate
          ? ` (${summary.producer?.name ?? 'slicer'} estimate)`
          : summary.coverageComplete
            ? ''
            : ' (known motion only)'}
      </PrintRow>
      {summary.filamentWeightGrams === undefined ? null : (
        <PrintRow label='Weight'>{formatWeight(summary.filamentWeightGrams)} (slicer estimate)</PrintRow>
      )}
      {summary.bounds === undefined ? null : (
        <>
          <PrintRow label='Part'>
            {summary.partBounds === undefined ? (
              <span className='text-muted-foreground'>Unknown: this G-code does not label walls or infill</span>
            ) : (
              formatSize(summary.partBounds)
            )}
          </PrintRow>
          <PrintRow label='Toolpath'>
            {formatSize(summary.bounds)}{' '}
            <span className='text-muted-foreground'>
              · every nozzle move, including the printer&apos;s start routine
            </span>
          </PrintRow>
        </>
      )}
      {fit?.fits === true ? <PrintRow label='Plate'>{fit.message}</PrintRow> : null}
      {summary.producer ? <PrintRow label='Sliced by'>{formatProducer(summary.producer)}</PrintRow> : null}
    </dl>
  );
}

/** Three numbers people read, with a tick for a passing fit; the rest on request, failures as notices. */
function SliceResult({ prepare }: { readonly prepare: PrintPrepare }): React.JSX.Element | undefined {
  const { slice, staleReason, isSliceStale, isSlicing } = prepare;
  if (!slice) {
    return undefined;
  }
  const { summary, fit, warnings } = slice;
  const weight = summary.filamentWeightGrams === undefined ? undefined : formatWeight(summary.filamentWeightGrams);
  const facts = [
    `${String(summary.layers)} layers`,
    formatDuration(summary.estimatedDuration),
    formatFilament(summary.filamentLength),
    weight,
  ].filter((fact) => fact !== undefined);
  return (
    <div role='group' aria-label='Slice result' className='flex min-w-0 flex-col gap-2'>
      <div className='flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 px-2 pt-1 pb-2'>
        <div className='flex min-h-6 min-w-0 items-center gap-2 text-xs'>
          {fit?.fits === true ? (
            <>
              <Check aria-hidden className='size-3.5 shrink-0 text-success' />
              <span className='sr-only'>{fit.message}. </span>
            </>
          ) : null}
          <span className={cn('min-w-0 flex-1 tabular-nums', isSliceStale && 'text-muted-foreground')}>
            {facts.join(' · ')}
          </span>
          {/* A stale slice's Slice again is the primary action; here it would be a second one. */}
          {isSliceStale ? null : (
            <Button type='button' size='xs' variant='ghost' disabled={isSlicing} onClick={prepare.sliceNow}>
              <Scissors aria-hidden />
              Slice again
            </Button>
          )}
        </div>
        <PrintDisclosure
          title='Details'
          summary={summary.partBounds === undefined ? undefined : formatSize(summary.partBounds)}
        >
          <SliceDetails slice={slice} />
        </PrintDisclosure>
      </div>
      {summary.previewRefusal === undefined ? null : (
        <PrintNotice tone='neutral' role='status'>
          {summary.previewRefusal}
        </PrintNotice>
      )}
      {fit === undefined || fit.fits ? null : <PrintNotice tone='warning'>{fit.message}</PrintNotice>}
      {warnings.map((warning) => (
        <PrintNotice key={warning} tone='warning' role='status'>
          {warning}
        </PrintNotice>
      ))}
      {staleReason === undefined ? null : (
        <PrintNotice tone='neutral' role='status'>
          {staleReason}
        </PrintNotice>
      )}
    </div>
  );
}

function ModelSelect({
  entryPath,
  entryPaths,
  onChange,
}: {
  readonly entryPath: string;
  readonly entryPaths: readonly string[];
  readonly onChange: (entryPath: string) => void;
}): React.JSX.Element | undefined {
  if (entryPaths.length < 2) {
    // One model is not a choice, but it names what will be sliced.
    return entryPath ? (
      <PrintSetupRow label='Model'>
        <span className='min-w-0 flex-1 truncate px-3 font-mono text-xs text-(--param-field-color)'>{entryPath}</span>
      </PrintSetupRow>
    ) : undefined;
  }
  return (
    <PrintSetupRow label='Model'>
      <ParameterSelect
        label='Model'
        value={entryPath}
        groups={[{ options: entryPaths.map((candidate) => ({ value: candidate, label: candidate })) }]}
        onChange={onChange}
      />
    </PrintSetupRow>
  );
}

function PlateSelect({
  plates,
  selected,
  isModified,
  onChange,
  onReset,
}: {
  readonly plates: MachineFffProcess['bed']['plates'];
  readonly selected: unknown;
  /** Whether the print intent holds a plate. */
  readonly isModified: boolean;
  readonly onChange: (plate: string) => void;
  readonly onReset: () => void;
}): React.JSX.Element | undefined {
  if (plates.length === 0) {
    return undefined;
  }
  return (
    <PrintSetupRow label='Plate' isModified={isModified} onReset={onReset}>
      <ParameterSelect
        label='Plate'
        value={typeof selected === 'string' ? selected : ''}
        groups={[{ options: plates.map((plate) => ({ value: plate.id, label: plate.label })) }]}
        onChange={onChange}
      />
    </PrintSetupRow>
  );
}

/** Bambu Studio's presets for the used trays, and what a preset change did to the person's settings. */
function BambuStudioChoices({
  studio,
  mode = 'primary',
}: {
  readonly studio: BambuStudioMode;
  readonly mode?: 'primary' | 'printer';
}): React.JSX.Element {
  return (
    <>
      <BambuStudioPresets studio={studio} trays={studio.trays} mode={mode} />
      {mode === 'primary' && studio.dropped > 0 ? (
        <PrintNotice tone='neutral' role='status'>
          {studio.dropped === 1
            ? '1 changed setting does not exist in these presets and was dropped.'
            : `${String(studio.dropped)} changed settings do not exist in these presets and were dropped.`}
        </PrintNotice>
      ) : null}
      {mode === 'printer' || studio.error === undefined ? null : <PrintNotice tone='error'>{studio.error}</PrintNotice>}
    </>
  );
}

/** Why slicing is unavailable and why the last slice failed; the slice button is Prepare's action. */
function SliceNotices({ prepare }: { readonly prepare: PrintPrepare }): React.JSX.Element | undefined {
  const { route, hasGeometry, sliceError } = prepare;
  if (route === undefined) {
    return (
      <PrintNotice tone='neutral' role='status'>
        {hasGeometry ? 'Slicing is not available for this kernel yet.' : 'Render the model to enable slicing.'}
      </PrintNotice>
    );
  }
  return sliceError ? <PrintNotice tone='error'>{sliceError}</PrintNotice> : undefined;
}

const startOptions = [
  {
    key: 'bedLeveling',
    label: 'Bed levelling',
    short: 'Levelling',
    description: 'Probe the plate before the first layer.',
  },
  {
    key: 'flowCalibration',
    label: 'Flow calibration',
    short: 'Flow',
    description: 'Calibrate flow dynamics for the loaded filament.',
  },
  { key: 'timelapse', label: 'Timelapse', short: 'Timelapse', description: 'Record a frame every layer.' },
] as const;

/**
 * The start options a submission schema declares as booleans. A key of another type (a timelapse mode, say) is not a
 * toggle: it stays in Advanced with the control its schema asks for.
 */
const startOptionsOf = (schema: JSONSchema7 | undefined): ReadonlyArray<(typeof startOptions)[number]> =>
  startOptions.filter(({ key }) => {
    const property = schema?.properties?.[key];
    return typeof property === 'object' && property.type === 'boolean';
  });

/** The host's prestart options, a stage summarised by what is on, preserved in the submission projection. */
function StartOptionsStage({ prepare }: { readonly prepare: PrintPrepare }): React.JSX.Element | undefined {
  const declared = startOptionsOf(prepare.submissionSchema?.schema);
  if (declared.length === 0) {
    return undefined;
  }
  const on = declared.filter(({ key }) => prepare.effectiveSubmission[key] === true).map(({ short }) => short);
  return (
    <PrintStage
      icon={ListChecks}
      title='Start options'
      summary={on.length === 0 ? 'None' : [on[0], ...on.slice(1).map((name) => name.toLowerCase())].join(', ')}
    >
      <fieldset disabled={prepare.machineSettings.blocked} className='contents'>
        <div className='-my-1.5 flex min-w-0 flex-col gap-1'>
          {declared.map(({ key, label, description }) => (
            <PrintSetupRow
              key={key}
              label={label}
              description={description}
              isModified={Object.hasOwn(prepare.submission, key)}
              onReset={() => {
                prepare.setSubmission(
                  Object.fromEntries(Object.entries(prepare.submission).filter(([name]) => name !== key)),
                );
              }}
            >
              <ParametersBoolean
                id={`print-${key}`}
                aria-label={`Toggle for ${label}`}
                value={prepare.effectiveSubmission[key] === true}
                onChange={(value) => {
                  prepare.setSubmission({ ...prepare.submission, [key]: value });
                }}
              />
            </PrintSetupRow>
          ))}
        </div>
      </fieldset>
    </PrintStage>
  );
}

type BambuSettings = NonNullable<BambuStudioMode['settings']>;

const asSchema = (value: unknown): JSONSchema7 | undefined =>
  isRecordObject(value) ? (value as JSONSchema7) : undefined;

/**
 * Bambu Studio's settings as one level of groups, process then filament, for the shared Parameters
 * form: its rows, search and reset marks are the parameters' own.
 *
 * @param settings - The schema and values of the selected presets, nested scope → group → key.
 * @returns The grouped schema with the presets' values as defaults, and each setting's group.
 */
type BambuSettingsFormModel = Readonly<{ resolved: ResolvedSchema; groupOf: ReadonlyMap<string, string> }>;

const bambuSettingsForm = (settings: BambuSettings): BambuSettingsFormModel => {
  const properties: Record<string, JSONSchema7> = {};
  const defaults: Record<string, unknown> = {};
  const groupOf = new Map<string, string>();
  for (const { id, label, scope } of settings.groups) {
    const group = asSchema(asSchema(settings.schema.properties?.[scope])?.properties?.[id]);
    if (group === undefined) {
      continue;
    }
    properties[id] = { ...group, title: scope === 'filament' ? `Filament · ${label}` : label };
    const values = asSchema(settings.values[scope]) as Record<string, unknown> | undefined;
    defaults[id] = values?.[id] ?? {};
    for (const key of Object.keys(group.properties ?? {})) {
      groupOf.set(key, id);
    }
  }
  return { resolved: { schema: { type: 'object', properties }, defaults }, groupOf };
};

/** Bambu Studio's settings for the selected presets, once they have loaded. */
function BambuStudioSettings({
  studio,
  filterTerm,
}: {
  readonly studio: BambuStudioMode;
  readonly filterTerm: string;
}): React.JSX.Element {
  const { settings, overrides, setSettings } = studio;
  const form = useMemo(() => (settings ? bambuSettingsForm(settings) : undefined), [settings]);
  const manifest = useCompiledConfigurationManifest('bambu-studio', 'print/settings', form?.resolved);
  /* Other presets keep the last form on screen until theirs compiles, so open groups stay open. */
  const [shown, setShown] = useState<Readonly<{ form: BambuSettingsFormModel; manifest: ParameterManifest }>>();
  if (form !== undefined && manifest !== undefined && (shown?.form !== form || shown.manifest !== manifest)) {
    setShown({ form, manifest });
  }
  const parameters = useMemo(() => {
    const nested: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(overrides)) {
      const group = shown?.form.groupOf.get(key);
      if (group !== undefined) {
        nested[group] = { ...nested[group], [key]: value };
      }
    }
    return nested;
  }, [shown, overrides]);
  const change = useCallback(
    (modified: Record<string, unknown>) => {
      if (shown === undefined) {
        return;
      }
      const values: Record<string, unknown> = {};
      for (const group of Object.values(modified)) {
        if (isRecordObject(group)) {
          Object.assign(values, group);
        }
      }
      // Only this form's settings: one these presets lack stays in the print intent for presets that have it.
      setSettings(shown.form.groupOf.keys(), values);
    },
    [shown, setSettings],
  );
  return shown ? (
    <div role='group' aria-label='Bambu Studio settings' className='min-w-0'>
      <Parameters
        parameters={parameters}
        defaultParameters={shown.form.resolved.defaults}
        jsonSchema={shown.form.resolved.schema}
        searchPlaceholder='Filter settings'
        filterTerm={filterTerm}
        enableSearch={false}
        presentation='embedded'
        isInitialExpanded={false}
        units={printUnits}
        parameterManifest={shown.manifest}
        parameterEdit={{ kind: 'transient' }}
        emptyMessage='No Bambu Studio settings'
        onParametersChange={change}
      />
    </div>
  ) : (
    <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
      Loading Bambu Studio settings…
    </p>
  );
}

const qualityPresets: ReadonlySet<string> = new Set<BambuQualityPreset>(['fast', 'standard', 'fine']);

/**
 * Which slicer Prepare uses while it is not Bambu Studio working as expected.
 *
 * @param properties - The Bambu Studio mode.
 * @returns The notice, or nothing while Bambu Studio is off or ready.
 */
function EngineStatus({ studio }: { readonly studio: BambuStudioMode }): React.JSX.Element | undefined {
  switch (studio.status) {
    case 'off': {
      return undefined;
    }
    case 'checking': {
      return (
        <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
          Checking for Bambu Studio…
        </p>
      );
    }
    case 'ready': {
      // Working as expected needs no line; the version is in Inspect.
      return undefined;
    }
    default: {
      // Whether the machine takes this slicer's files is its own check, shown once the slice exists.
      return (
        <PrintNotice tone='neutral' role='status'>
          Slicing with Tau&apos;s reference slicer: Bambu Studio is not available here.
        </PrintNotice>
      );
    }
  }
}

/**
 * The slicer Prepare uses, for Inspect.
 *
 * @param studio - The Bambu Studio mode.
 * @returns Its name and version, or nothing while unknown or not a Bambu printer.
 * @public
 */
export const slicerName = (studio: BambuStudioMode): string | undefined => {
  switch (studio.status) {
    case 'ready': {
      return studio.version === undefined ? 'Bambu Studio' : `Bambu Studio ${studio.version}`;
    }
    case 'unavailable': {
      return 'Tau reference slicer';
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The closed Prepare stage's summary: the fresh slice's numbers, else why it waits, else the model.
 *
 * @param prepare - The prepare state.
 * @param deferred - What Prepare is for while a decision or a run owns the pane.
 * @returns A few words.
 */
const prepareSummary = (prepare: PrintPrepare, deferred: string | undefined): string | undefined => {
  const { slice, isSliceStale, isSlicing, entryPath } = prepare;
  if (isSlicing) {
    return 'Slicing…';
  }
  if (slice && !isSliceStale) {
    const weight =
      slice.summary.filamentWeightGrams === undefined ? undefined : formatWeight(slice.summary.filamentWeightGrams);
    return ['Sliced', formatDuration(slice.summary.estimatedDuration), weight]
      .filter((part) => part !== undefined)
      .join(' · ');
  }
  // The model as its row names it ("main.cs"); "main" alone reads as a branch.
  return deferred ?? (slice ? 'Changed since the slice' : entryPath === '' ? undefined : entryPath.split('/').pop());
};

/**
 * Advanced settings: the full slicer form (Bambu Studio's printer and filament overrides and settings, or
 * the kernel's slicer options) and the machine mapping, behind one filter.
 *
 * @param properties - The machine, its provider, and the prepare state.
 * @returns The stage.
 */
function AdvancedSettingsStage({
  entry,
  provider,
  prepare,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
  readonly prepare: PrintPrepare;
}): React.JSX.Element {
  const [advancedFilter, setAdvancedFilter] = useState('');
  const {
    route,
    studio,
    filamentColors,
    isBambuStudio,
    optionsSchema,
    options,
    setOptions,
    submissionSchema,
    submission,
    setSubmission,
    machineSettings,
    jobCheck,
  } = prepare;
  const providerKey = route
    ? route.transcoderId === undefined
      ? String(route.kernelId)
      : `${String(route.kernelId)}+${String(route.transcoderId)}`
    : undefined;
  const optionsManifest = useCompiledConfigurationManifest(providerKey, 'print/options', optionsSchema);
  const submissionManifest = useCompiledConfigurationManifest(provider?.id, 'print/submission', submissionSchema);
  /* The submission schema without the fields Prepare sets itself; the observed diameters are read-only. */
  const advancedSubmissionSchema = useMemo<JSONSchema7 | undefined>(() => {
    if (!submissionSchema) {
      return undefined;
    }
    const { schema } = submissionSchema;
    const prepared = preparedFields(provider);
    const properties = Object.entries(schema.properties ?? {})
      .filter(([key]) => !prepared.has(key))
      .map(([key, field]): [string, JSONSchema7Definition] => [
        key,
        observedDiameterFields.has(key) && typeof field === 'object' ? { ...field, readOnly: true } : field,
      ]);
    const required = schema.required?.filter((key) => !prepared.has(key));
    return {
      ...schema,
      properties: Object.fromEntries(properties),
      ...(required === undefined ? {} : { required }),
    };
  }, [submissionSchema, provider]);

  return (
    <PrintStage icon={Settings2} title='Advanced settings'>
      {/* The stage is the forms' frame, as the catalog card is in Parameters: top-level fields take no inset of
          their own, so their labels line up with the stage's rows; fields inside a group keep the group's. */}
      <fieldset
        disabled={machineSettings.blocked}
        className='contents [&_[data-slot=embedded-form-root]>[data-slot=parameter-field]]:px-0'
      >
        <SearchInput
          aria-label='Filter settings'
          placeholder='Filter settings'
          value={advancedFilter}
          className='h-6 w-full bg-background text-sm'
          onChange={(event) => {
            setAdvancedFilter(event.target.value);
          }}
          onClear={() => {
            setAdvancedFilter('');
          }}
        />
        {isBambuStudio ? <BambuStudioChoices studio={studio} mode='printer' /> : null}
        {isBambuStudio ? (
          <BambuStudioSettings studio={studio} filterTerm={advancedFilter} />
        ) : optionsSchema ? (
          <div className='min-w-0' role='group' aria-label='Slicer options'>
            {optionsManifest ? (
              <Parameters
                parameters={options}
                defaultParameters={optionsSchema.defaults}
                jsonSchema={optionsSchema.schema}
                onParametersChange={setOptions}
                enableSearch={false}
                filterTerm={advancedFilter}
                presentation='embedded'
                units={printUnits}
                parameterManifest={optionsManifest}
                parameterEdit={{ kind: 'transient' }}
                emptyMessage='No slicer options'
              />
            ) : (
              <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
                Preparing slicer options…
              </p>
            )}
          </div>
        ) : (
          <p className='text-xs text-muted-foreground'>The slicer declares no options.</p>
        )}
        {submissionSchema && provider ? (
          <div className='min-w-0' role='group' aria-label='Machine mapping'>
            {submissionManifest ? (
              <Parameters
                parameters={advancedSubmissionValues(provider, submission)}
                defaultParameters={advancedSubmissionValues(provider, {
                  ...submissionDefaults(provider, entry, { filamentColors }),
                  /* What the machine completed when it checked the slice: its model, nozzle, materials. */
                  ...(jobCheck !== undefined && jobCheck.status !== 'refused' && isRecordObject(jobCheck.configuration)
                    ? jobCheck.configuration
                    : {}),
                })}
                jsonSchema={advancedSubmissionSchema}
                onParametersChange={(changed) => {
                  setSubmission({
                    ...Object.fromEntries(
                      Object.entries(submission).filter(([key]) => preparedFields(provider).has(key)),
                    ),
                    ...changed,
                  });
                }}
                enableSearch={false}
                filterTerm={advancedFilter}
                presentation='embedded'
                units={printUnits}
                parameterManifest={submissionManifest}
                parameterEdit={{ kind: 'transient' }}
                emptyMessage='No machine mapping'
              />
            ) : (
              <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
                Preparing machine mapping…
              </p>
            )}
          </div>
        ) : null}
      </fieldset>
    </PrintStage>
  );
}

/**
 * Prepare's three stages. Prepare chooses the model, profile, plate, material and process and reads
 * the slice; Start options sets what the printer does first; Advanced settings holds the full slicer
 * and submission forms. Prepare opens by default; behind a decision or a run it starts closed and
 * ends with its own actions, otherwise the pane's action bar carries them.
 *
 * @param properties - The machine, its manifest, the prepare state and the control remedies are sent through.
 * @returns The stages.
 * @public
 */
export function PrepareStages({
  entry,
  provider,
  manifest,
  prepare,
  control,
  deferred,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
  readonly manifest: MachineManifest | undefined;
  readonly prepare: PrintPrepare;
  readonly control: MachineControl;
  /** While a decision or a run owns the pane, what Prepare is for: "For the next print". */
  readonly deferred?: string;
}): React.JSX.Element {
  const {
    entryPath,
    entryPaths,
    setEntryPath,
    studio,
    filamentColors,
    slots,
    selectFilamentSlot,
    selectMaterial,
    isBambuStudio,
    optionsSchema,
    options,
    setOptions,
    submission,
    setSubmission,
    plate,
    machineSettings,
  } = prepare;
  const { intent, update: updateIntent, reset: resetIntent } = machineSettings;
  const { choosePreset } = studio;
  const selectPreset = useCallback(
    (preset: MachineFffProcess['slicing']['presets'][number]) => {
      if (!isBambuStudio) {
        setOptions(applyPreset(options, preset, optionsSchema?.schema));
      } else if (qualityPresets.has(preset.id)) {
        choosePreset(preset.id as BambuQualityPreset);
      }
    },
    [choosePreset, isBambuStudio, options, optionsSchema, setOptions],
  );
  const selectPlate = useCallback(
    (value: string) => {
      /* Plate ids are the manifest's; the provider's settings form validates the one saved. */
      updateIntent((current) => ({ ...current, plate: value }));
    },
    [updateIntent],
  );
  const resetPlate = useCallback(() => {
    updateIntent(({ plate: _plate, ...rest }) => rest);
  }, [updateIntent]);
  const resetPreset = useCallback(() => {
    updateIntent(({ preset: _preset, ...rest }) => rest);
  }, [updateIntent]);
  const plates = (manifest === undefined ? undefined : fffProcessOf(manifest))?.bed.plates ?? [];
  /* In Bambu Studio mode a chip is active when the selected process has its layer height. */
  const selectedProcess = studio.processes.find((preset) => preset.name === studio.selection?.process);
  const presetState = isBambuStudio ? { layerHeight: selectedProcess?.layerHeight } : options;

  /* Beside the trigger, never inside it: a reset is a button of its own. */
  const reset =
    hasIntentChanges(intent) || Object.keys(machineSettings.machine ?? {}).length > 0 ? (
      <ModifiedIndicator onReset={resetIntent} tooltip='Reset print settings' />
    ) : undefined;

  return (
    <>
      <PrintStage
        icon={Layers}
        title='Prepare'
        summary={prepareSummary(prepare, deferred)}
        aside={reset}
        isDefaultOpen={deferred === undefined}
      >
        <EngineStatus studio={studio} />
        {/* Setup rows pad themselves (PrintSetupRow py-1.5), so the group adds only the row-to-row gap. */}
        <div className='-my-1.5 flex min-w-0 flex-col gap-1'>
          <ModelSelect entryPath={entryPath} entryPaths={entryPaths} onChange={setEntryPath} />
          <MachineProfiles settings={machineSettings} studio={studio} />
          {/* Keep disabled semantics without Chromium's fieldset anonymous layout box around query containers; the
              rows sit in a box of their own, as Chromium stops laying out query containers that are a contents
              fieldset's direct children once an ancestor relayouts. */}
          <fieldset disabled={machineSettings.blocked} className='contents'>
            <div className='flex min-w-0 flex-col gap-1'>
              <PlateSelect
                plates={plates}
                selected={plate}
                isModified={intent?.plate !== undefined}
                onChange={selectPlate}
                onReset={resetPlate}
              />
              <MaterialChoice
                entry={entry}
                filamentColors={filamentColors}
                slots={slots}
                override={isBambuStudio ? chosenBambuFilament(studio.chosen, slots[0]) : undefined}
                isModified={Object.hasOwn(submission, 'amsMapping')}
                onResetMaterial={() => {
                  setSubmission(
                    Object.fromEntries(
                      Object.entries(submission).filter(([key]) => key !== 'amsMapping' && key !== 'expectedMaterials'),
                    ),
                  );
                }}
                onSelectMaterial={selectMaterial}
                onSelectFilamentSlot={selectFilamentSlot}
              />
              {!isBambuStudio && manifest ? (
                <QualityChoice
                  presets={fffProcessOf(manifest)?.slicing.presets ?? []}
                  options={presetState}
                  isModified={intent?.preset !== undefined}
                  onSelect={selectPreset}
                  onReset={resetPreset}
                />
              ) : null}
              {isBambuStudio ? <BambuStudioChoices studio={studio} /> : null}
            </div>
          </fieldset>
        </div>
        <fieldset disabled={machineSettings.blocked} className='contents'>
          <SliceNotices prepare={prepare} />
          <SliceResult prepare={prepare} />
          {deferred === undefined ? null : <PrepareActions prepare={prepare} control={control} />}
        </fieldset>
      </PrintStage>
      <StartOptionsStage prepare={prepare} />
      <AdvancedSettingsStage entry={entry} provider={provider} prepare={prepare} />
    </>
  );
}
