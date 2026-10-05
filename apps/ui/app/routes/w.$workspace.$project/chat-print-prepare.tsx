import type { MachineSettingsProvenance } from '@taucad/runtime/machine/settings';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
import { printerPreparation } from '#components/printer/printer-preparation.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { defaultFilamentSlots, machineSliceOptions } from '@taucad/agent-tools/registry';
import { Check, Eye, Layers, ListChecks, LoaderCircle, Scissors, Send, Settings2 } from 'lucide-react';
import type { JSONSchema7, JSONSchema7Definition } from '@taucad/json-schema';
import type { ParameterManifest } from '@taucad/parameters';
import type {
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryEntry,
  MachineManifest,
  MachineProvider,
  MachineRequestPrintInput,
} from '@taucad/runtime/machine';
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
import type { BambuTray } from '#components/print/bambu-studio-presets.js';
import { FilamentSlots } from '#components/print/filament-slots.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { SearchInput } from '#components/search-input.js';
import { isRealBambuPrinter, useBambuStudio } from '#components/print/use-bambu-studio.js';
import type { BambuQualityPreset, BambuStudioChosen, BambuStudioMode } from '#components/print/use-bambu-studio.js';
import { useMachineSettings } from '#components/print/use-machine-settings.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { compileExportConfigurationManifest } from '#routes/w.$workspace.$project/chat-converter.js';
import { listGeometryEntryPaths } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import { selectCadDisplay, selectCadFailureIssues } from '#machines/cad.machine.js';
import {
  PrintDisclosure,
  PrintNotice,
  PrintRow,
  PrintStage,
  operator,
} from '#routes/w.$workspace.$project/chat-print-section.js';
import {
  StartConfirmationCard,
  bambuStudioRequired,
  describeStartConfirmations,
  describePrintError,
  startBlocker,
} from '#routes/w.$workspace.$project/chat-print-send.js';
import {
  fitsPlate,
  formatDuration,
  formatFilament,
  formatProducer,
  formatQuantity,
  formatSize,
  materialSlotLabel,
} from '#routes/w.$workspace.$project/chat-print-summary.js';
import type { PlateFit } from '#routes/w.$workspace.$project/chat-print-summary.js';
import type { SliceSummary } from '#components/printer/printer-summary.js';
import { bestRouteForActiveKernel, exportDocumentWithValidatedInput } from '#utils/export-formats.utils.js';

/** The export target every print goes through (blueprint D3). */
const gcodeContainerFormat: FileExtension = 'gcode.3mf';
const printUnits = { length: { displaySymbol: 'mm' } } as const;

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

const schemaConstant = (schema: JSONSchema7 | boolean | undefined): unknown => {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  return schema.const ?? (Array.isArray(schema.enum) && schema.enum.length === 1 ? schema.enum[0] : undefined);
};

const noColors: readonly string[] = [];
/** Values owned by the machine or the visible Prepare controls, not separate Advanced choices. */
const prepareSubmissionFields = new Set([
  'amsMapping',
  'expectedMaterials',
  'expectedBedType',
  'expectedModel',
  'operatorConfirmedBedType',
  'bedLeveling',
  'flowCalibration',
  'timelapse',
]);
const observedDiameterFields = new Set(['expectedFilamentDiameter', 'expectedNozzleDiameter']);

const advancedSubmissionValues = (values: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values).filter(([key]) => !prepareSubmissionFields.has(key)));

/**
 * Each mapped filament's slot with the material the machine reports there, in filament order; a filament
 * without a slot is left out, and sending waits until it has one.
 *
 * @param mapping - The slot each filament prints from; `-1` for none.
 * @param entry - The machine as observed.
 * @returns The materials the request expects.
 */
const expectedMaterialsFor = (
  mapping: readonly number[],
  entry: MachineDirectoryEntry,
): ReadonlyArray<Readonly<{ slot: number; materialId: string }>> =>
  mapping.flatMap((slot) => {
    const tray = entry.snapshot.setup.materials.find((material) => material.slot === slot);
    return tray?.materialId === undefined ? [] : [{ slot, materialId: tray.materialId }];
  });

/**
 * The slot each filament prints from unless someone chooses: the first loaded tray for one, as the agent's planner
 * maps several over the trays that can change filament mid-print ({@link defaultFilamentSlots}), `-1` where no free
 * tray of the print's material is left.
 */
const defaultMapping = (
  trays: MachineDirectoryEntry['snapshot']['setup']['materials'],
  loaded: MachineDirectoryEntry['snapshot']['setup']['materials'][number] | undefined,
  filamentColors: readonly string[],
): readonly number[] => {
  if (loaded?.materialId === undefined) {
    return [];
  }
  return filamentColors.length > 1
    ? defaultFilamentSlots(filamentColors, trays, loaded.materialId).map((slot) => slot ?? -1)
    : [loaded.slot];
};

/** The slot numbers of a configuration's `amsMapping`, in filament order. */
const mappingOf = (configuration: Readonly<Record<string, unknown>>): readonly number[] => {
  const mapping = configuration['amsMapping'];
  return Array.isArray(mapping) ? mapping.filter((slot): slot is number => typeof slot === 'number') : [];
};

/**
 * The submission configuration a provider needs: the schema's own defaults,
 * then the provider's declared defaults, then what the machine reports and the
 * manifest declares. Only keys the provider's schema names are written, so a
 * provider without an AMS never receives a mapping. A slice of several
 * filaments maps each to a loaded slot as the agent's planner does
 * ({@link defaultFilamentSlots}); `-1` marks one no free tray can take.
 *
 * @param provider - The provider that owns the submission schema.
 * @param entry - The machine as observed.
 * @param known - The machine's manifest, when the provider carries one, and the colours of the filaments the
 *   last slice prints, in filament order.
 * @returns The defaults the Advanced form and the request start from.
 * @public
 */
export const submissionDefaults = (
  provider: MachineProvider,
  entry: MachineDirectoryEntry,
  {
    manifest,
    filamentColors = noColors,
  }: Readonly<{ manifest: MachineManifest | undefined; filamentColors?: readonly string[] }>,
): Record<string, unknown> => {
  const projection = provider.submissionConfiguration.parameters.input;
  const declared = projection.status === 'usable' ? { ...projection.declaration.defaults } : {};
  const schema = provider.submissionConfiguration.legacyProjection.inputSchema as JSONSchema7;
  const properties = schema.properties ?? {};
  // A provider whose required fields are observed cannot declare partial defaults, so its optional flags keep
  // theirs only in the schema (Bambu: bed leveling and flow calibration on). Sending them explicitly equals what
  // validation would apply, so a request from the agent, which omits them, starts the same way.
  const schemaDefaults = Object.fromEntries(
    Object.entries(properties).flatMap(([key, property]) =>
      typeof property === 'object' && property.default !== undefined ? [[key, property.default] as const] : [],
    ),
  );
  const observed: Record<string, unknown> = {};
  const loaded = entry.snapshot.setup.materials.find(
    (material) => material.state === 'loaded' && material.materialId !== undefined,
  );
  const nozzle = manifest?.toolhead.nozzles[0];
  // Only the AMS changes filament mid-print; the external spool feeds one-filament prints.
  const trays = entry.snapshot.setup.materials.filter(
    (material) => material.slot !== manifest?.materialSystem.externalSpoolSlot,
  );
  const mapping = defaultMapping(trays, loaded, filamentColors);
  // ponytail: named keys are the Bambu submission vocabulary; a second provider gets its own mapping here.
  if ('expectedBedType' in properties) {
    observed['expectedBedType'] = entry.snapshot.setup.bedType ?? manifest?.bed.plates[0]?.id;
  }
  if ('expectedMaterials' in properties && mapping.length > 0) {
    observed['expectedMaterials'] = expectedMaterialsFor(mapping, entry);
  }
  if ('amsMapping' in properties && mapping.length > 0) {
    observed['amsMapping'] = mapping;
  }
  if ('expectedNozzleDiameter' in properties && nozzle) {
    observed['expectedNozzleDiameter'] = nozzle.diameter.value;
  }
  if ('expectedFilamentDiameter' in properties && manifest) {
    observed['expectedFilamentDiameter'] = manifest.toolhead.filamentDiameter.value;
  }
  if ('expectedModel' in properties) {
    observed['expectedModel'] = schemaConstant(properties['expectedModel']) ?? entry.descriptor.model;
  }
  return Object.fromEntries(
    Object.entries({ ...schemaDefaults, ...declared, ...observed }).filter(([, value]) => value !== undefined),
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
  preset: MachineManifest['slicing']['presets'][number],
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
      } catch {
        /* The form stays in its preparing state; the slice still runs on the values entered so far. */
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
  /** Print one filament from another slot; a filament already there takes this one's slot. */
  selectFilamentSlot: (filament: number, slot: number) => void;
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
  sendConfiguration: Record<string, unknown>;
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
  confirmSend: () => void;
  cancelSend: () => void;
  isConfirmingSend: boolean;
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
  const activeKernelId = useSelector(
    actor,
    (state) => state?.context.publishedAssembly ?? state?.context.activeKernelId,
  );
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
    const projection = provider.submissionConfiguration.parameters.input;
    return {
      schema: provider.submissionConfiguration.legacyProjection.inputSchema as JSONSchema7,
      defaults: projection.status === 'usable' ? { ...projection.declaration.defaults } : {},
    };
  }, [provider]);

  const machineSettings = useMachineSettings(manifest);
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
  const [isConfirmingSend, setIsConfirmingSend] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const requestIdRef = useRef<{ readonly key: string; readonly requestId: string }>(undefined);
  const operationIdsRef = useRef(
    new Map<string, { readonly uploadOperationId: string; readonly startOperationId: string }>(),
  );

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
    const preferences = machineSettings.machine;
    const { material, plate: _plate, ...flags } = preferences ?? {};
    const fallback =
      entry && provider ? mappingOf(submissionDefaults(provider, entry, { manifest, filamentColors })) : [];
    const mapping =
      filamentColors.length > 1
        ? material?.slotsByColor
          ? filamentColors.map((color, index) => material.slotsByColor?.[color.toLowerCase()] ?? fallback[index] ?? -1)
          : undefined
        : material?.defaultSlot === undefined
          ? undefined
          : [material.defaultSlot];
    return {
      ...flags,
      ...(mapping
        ? {
            amsMapping: mapping,
            ...(entry ? { expectedMaterials: expectedMaterialsFor(mapping, entry) } : {}),
          }
        : {}),
      ...(transientSubmission?.key === preferenceKey ? transientSubmission.values : {}),
    };
  }, [machineSettings.machine, filamentColors, entry, provider, manifest, transientSubmission, preferenceKey]);
  const setSubmission = useCallback(
    (next: Record<string, unknown>): void => {
      setTransientSubmission({
        key: preferenceKey,
        values: Object.fromEntries(
          Object.entries(next).filter(
            ([key]) =>
              ![
                'bedLeveling',
                'flowCalibration',
                'timelapse',
                'amsMapping',
                'expectedMaterials',
                'expectedBedType',
              ].includes(key),
          ),
        ),
      });
      machineSettings.updateMachine((prior) => {
        const { material: _material, bedLeveling: _bed, flowCalibration: _flow, timelapse: _time, ...rest } = prior;
        const flags = Object.fromEntries(
          ['bedLeveling', 'flowCalibration', 'timelapse'].flatMap((key) =>
            typeof next[key] === 'boolean' ? [[key, next[key]]] : [],
          ),
        );
        const mapping = Array.isArray(next['amsMapping'])
          ? next['amsMapping'].map((slot): number | undefined =>
              typeof slot === 'number' && slot >= 0 ? slot : undefined,
            )
          : [];
        const material = mapping.every((slot) => slot === undefined)
          ? undefined
          : filamentColors.length > 1
            ? {
                ...prior.material,
                slotsByColor: {
                  ...prior.material?.slotsByColor,
                  ...Object.fromEntries(
                    filamentColors.flatMap((color, index) =>
                      mapping[index] === undefined ? [] : [[color.toLowerCase(), mapping[index]]],
                    ),
                  ),
                },
              }
            : { ...prior.material, defaultSlot: mapping[0] };
        const plate = typeof next['expectedBedType'] === 'string' ? next['expectedBedType'] : prior.plate;
        return bambuSettingsConfiguration.schema.parse({
          ...rest,
          ...flags,
          ...(plate ? { plate } : {}),
          ...(material ? { material } : {}),
        });
      });
    },
    [machineSettings.updateMachine, preferenceKey, filamentColors],
  );

  const effectiveSubmission = useMemo(() => {
    if (!provider || !entry) {
      return submission;
    }
    /* A mapping made for another number of filaments (a material picked before the slice showed several colours)
     * gives way to the defaults for this slice's filaments. */
    const { amsMapping: ownMapping, expectedMaterials: _ownMaterials, ...own } = submission;
    const colorsConfirmed =
      slice?.rendering !== rendering ||
      modelColors.length === 0 ||
      (modelColors.length === filamentColors.length &&
        modelColors.every((color, index) => color === filamentColors[index]));
    const isOwnMapping =
      (filamentColors.length < 2 || !Array.isArray(ownMapping) || ownMapping.length === filamentColors.length) &&
      colorsConfirmed;
    const effective: Record<string, unknown> = {
      ...submissionDefaults(provider, entry, { manifest, filamentColors }),
      ...(intent?.plate === undefined ? {} : { expectedBedType: intent.plate }),
      ...(isOwnMapping ? submission : own),
    };
    // The plate picked here is what the person says is installed when the machine cannot report it.
    if (entry.snapshot.setup.bedType === undefined && typeof effective['expectedBedType'] === 'string') {
      effective['operatorConfirmedBedType'] = effective['expectedBedType'];
    }
    return effective;
  }, [entry, filamentColors, intent, manifest, modelColors, provider, slice?.rendering, submission]);
  const plate =
    typeof effectiveSubmission['expectedBedType'] === 'string' ? effectiveSubmission['expectedBedType'] : undefined;
  const slotsKey = mappingOf(effectiveSubmission).join(',');
  const slots = useMemo(() => (slotsKey === '' ? [] : slotsKey.split(',').map(Number)), [slotsKey]);
  const studio = useBambuStudio({ provider, entry, manifest, plate, mapping: slots, intent, update: updateIntent });
  const selectFilamentSlot = useCallback(
    (filament: number, slot: number) => {
      if (!entry) {
        return;
      }
      /* Slots stay one filament's each: the filament that held this slot takes the one given up. */
      const previous = slots[filament] ?? -1;
      const next = slots.map((current, index) => (index === filament ? slot : current === slot ? previous : current));
      setSubmission({ ...submission, amsMapping: next, expectedMaterials: expectedMaterialsFor(next, entry) });
    },
    [entry, slots, submission, setSubmission],
  );
  const isBambuStudio = studio.status === 'ready' || studio.status === 'checking';
  /* The machine's own slicer options under the person's, so the Advanced form and the slice agree. */
  const machineOptions = useMemo(
    () => (manifest && plate ? machineSliceOptions(manifest, plate) : {}),
    [manifest, plate],
  );
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
  const qualityPreset = manifest?.slicing.presets.find(({ id }) => id === intent?.preset);
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
      const display = selectCadDisplay(settled);
      const assemblyDisplay = display && 'admitted' in display ? display : undefined;
      const freshKernelId = settled.context.publishedAssembly ?? settled.context.activeKernelId;
      const freshRoute = freshKernelClient
        ? bestRouteForActiveKernel(freshKernelClient, gcodeContainerFormat, freshKernelId)
        : undefined;
      if (!freshKernelClient || !freshRoute || (!freshDocument && !assemblyDisplay)) {
        throw new Error('The selected CAD runtime is unavailable');
      }
      const result = assemblyDisplay
        ? await assemblyDisplay.document.exportPublished({
            format: gcodeContainerFormat,
            publishedAssembly: { root: assemblyDisplay.root },
            exportOptions: sliceOptions,
            signal: controller.signal,
          })
        : freshDocument
          ? await exportDocumentWithValidatedInput(freshDocument, freshRoute, {
              options: sliceOptions,
              signal: controller.signal,
            })
          : undefined;
      if (!result) {
        throw new Error('The selected CAD document is unavailable');
      }
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
      const warnings = result.issues.filter(({ severity }) => severity === 'warning').map(({ message }) => message);
      const defaults =
        provider && entry
          ? submissionDefaults(provider, entry, { manifest, filamentColors: summary.filamentColors })
          : {};
      const ownMapping = mappingOf(submission);
      const colorsMatch =
        modelColors.length === 0 ||
        (modelColors.length === summary.filamentColors.length &&
          modelColors.every((color, index) => color === summary.filamentColors[index]));
      const mapping =
        Array.isArray(submission['amsMapping']) &&
        ownMapping.length === Math.max(1, summary.filamentColors.length) &&
        colorsMatch
          ? ownMapping
          : mappingOf(defaults);
      const submissionProperties = (
        provider?.submissionConfiguration.legacyProjection.inputSchema as JSONSchema7 | undefined
      )?.properties;
      setSlice({
        path,
        fileName,
        digest,
        length: file.bytes.byteLength,
        mimeType: file.mimeType,
        rendering: sliceRendering,
        materialConfiguration:
          entry === undefined
            ? {}
            : {
                ...('amsMapping' in (submissionProperties ?? {}) ? { amsMapping: mapping } : {}),
                ...('expectedMaterials' in (submissionProperties ?? {})
                  ? { expectedMaterials: expectedMaterialsFor(mapping, entry) }
                  : {}),
              },
        optionsKey,
        summary,
        /* A plate too large to preview has no bounds to check; the printer checks its own. */
        fit:
          manifest === undefined || summary.bounds === undefined
            ? undefined
            : fitsPlate({ bounds: summary.bounds, partBounds: summary.partBounds }, manifest.geometry.buildVolume),
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

  const openPreview = useCallback((): void => {
    if (slice) {
      editorRef.send({ type: 'openFile', path: slice.path, source: 'user' });
    }
  }, [editorRef, slice]);

  const sendConfiguration = slice ? { ...effectiveSubmission, ...slice.materialConfiguration } : effectiveSubmission;

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
    // The real printer refuses anything Bambu Studio did not slice (blueprint P3); the simulator takes both.
    if (isRealBambuPrinter(provider) && slice.summary.producer?.name !== 'Bambu Studio') {
      return bambuStudioRequired;
    }
    const unmapped = filamentColors.length > 1 ? slots.indexOf(-1) : -1;
    if (unmapped >= 0) {
      return `Filament ${String(unmapped + 1)} has no slot. Choose a loaded slot for it before sending.`;
    }
    return startBlocker(sendConfiguration, entry, manifest);
  })();

  const send = useCallback(async (): Promise<void> => {
    if (!slice || !entry || !provider || sendBlocker !== undefined) {
      return;
    }
    setIsSending(true);
    setSendError(undefined);
    try {
      await machineSettings.flush();
      const accepted =
        provider.accepts.find((container) => container.mediaType === slice.mimeType) ?? provider.accepts[0];
      if (!accepted) {
        throw new Error(`${provider.name} does not declare an accepted container.`);
      }
      /* The host finds the project by its `tau.json` id and re-verifies the bytes by digest on every use. */
      const artifact: MachineArtifactReference = {
        projectId,
        path: slice.path,
        digest: slice.digest,
        length: slice.length,
        mediaType: accepted.mediaType,
        contract: accepted.contract,
        selectedMember: accepted.requiredMembers[0] ?? 'Metadata/plate_1.gcode',
      };
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
      const key = JSON.stringify([slice.digest, entry.machineId, sendConfiguration, preferences]);
      if (requestIdRef.current?.key !== key) {
        requestIdRef.current = { key, requestId: randomUuid() };
      }
      const record = await client.requestPrint({
        machineId: entry.machineId,
        artifact,
        configuration: sendConfiguration as MachineRequestPrintInput['configuration'],
        requestedBy: operator,
        summary: {
          fileName: slice.fileName,
          ...(preferences ? { preferences } : {}),
          layers: slice.summary.layers,
          estimatedDuration: slice.summary.estimatedDuration,
          filamentLength: slice.summary.filamentLength,
          ...(slice.summary.producer === undefined ? {} : { producer: slice.summary.producer }),
        },
        requestId: requestIdRef.current.requestId,
      });
      if (record.state === 'awaiting-approval') {
        const ids = operationIdsRef.current.get(record.requestId) ?? {
          uploadOperationId: randomUuid(),
          startOperationId: randomUuid(),
        };
        operationIdsRef.current.set(record.requestId, ids);
        await client.resolvePrintRequest({
          requestId: record.requestId,
          decision: 'approve',
          resolvedBy: operator,
          ...ids,
        });
      }
      setIsConfirmingSend(false);
    } catch (error) {
      setSendError(describePrintError(error));
    } finally {
      setIsSending(false);
    }
  }, [client, entry, projectId, provider, sendBlocker, sendConfiguration, slice, machineSettings]);

  const confirmSend = useCallback(() => {
    setSendError(undefined);
    setIsConfirmingSend(true);
  }, []);
  const cancelSend = useCallback(() => {
    setIsConfirmingSend(false);
  }, []);

  return {
    entryPath,
    entryPaths,
    setEntryPath,
    hasGeometry,
    route,
    studio,
    filamentColors,
    selectFilamentSlot,
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
    sendConfiguration,
    slice,
    staleReason,
    isSliceStale,
    isSlicing,
    sliceError,
    sliceNow,
    cancelSlice,
    openPreview,
    confirmSend,
    cancelSend,
    isConfirmingSend,
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
  readonly presets: MachineManifest['slicing']['presets'];
  readonly options: Record<string, unknown>;
  /** Whether the print intent holds a quality preset. */
  readonly isModified: boolean;
  readonly onSelect: (preset: MachineManifest['slicing']['presets'][number]) => void;
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
  manifest,
  submission,
  filamentPresets,
  onSelect,
  isModified,
  onReset,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly submission: Record<string, unknown>;
  /** Bambu Studio filament presets chosen over the printer's, by tray. */
  readonly filamentPresets: BambuStudioChosen['filaments'];
  readonly onSelect: (slot: number, materialId: string) => void;
  readonly isModified: boolean;
  readonly onReset: () => void;
}): React.JSX.Element {
  const mapping = submission['amsMapping'];
  const selectedSlot: unknown = Array.isArray(mapping) ? mapping[0] : undefined;
  const { materials } = entry.snapshot.setup;
  if (materials.length === 0) {
    return <p className='text-xs text-muted-foreground'>No material slots observed.</p>;
  }
  // The tray and how it is sliced are one choice; an override set in Advanced settings is named here.
  const override = typeof selectedSlot === 'number' ? filamentPresets?.[selectedSlot] : undefined;
  return (
    <PrintSetupRow
      label='Material'
      description={override === undefined ? undefined : `Sliced as ${shortPresetName(override)}`}
      isModified={isModified}
      onReset={onReset}
    >
      <ParameterSelect
        label='Material'
        value={typeof selectedSlot === 'number' ? String(selectedSlot) : ''}
        groups={[
          {
            options: materials.map((material) => ({
              value: String(material.slot),
              label: `${materialSlotLabel(material.slot, manifest)} · ${material.materialId ?? (material.state === 'empty' ? 'Empty' : 'Unknown')}`,
              ...(material.remainingPercent === undefined
                ? {}
                : { secondary: `${String(material.remainingPercent)} %` }),
              ...(material.color === undefined ? {} : { swatch: material.color }),
              disabled: material.state !== 'loaded' || material.materialId === undefined,
            })),
          },
        ]}
        onChange={(value) => {
          const material = materials.find((candidate) => candidate.slot === Number(value));
          if (material?.materialId) {
            onSelect(material.slot, material.materialId);
          }
        }}
      />
    </PrintSetupRow>
  );
}

/** One material chip row for a one-colour print; a slot per filament for a slice that prints several. */
function MaterialChoice({
  entry,
  manifest,
  filamentColors,
  submission,
  ownSubmission,
  filamentPresets,
  onSelectMaterial,
  onSelectFilamentSlot,
  onResetMaterial,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly filamentColors: readonly string[];
  readonly submission: Record<string, unknown>;
  readonly ownSubmission: Record<string, unknown>;
  readonly filamentPresets: BambuStudioChosen['filaments'];
  readonly onSelectMaterial: (slot: number, materialId: string) => void;
  readonly onSelectFilamentSlot: (filament: number, slot: number) => void;
  readonly onResetMaterial: () => void;
}): React.JSX.Element {
  if (filamentColors.length < 2) {
    return (
      <div role='group' aria-label='Material'>
        <MaterialSelect
          entry={entry}
          manifest={manifest}
          submission={submission}
          filamentPresets={filamentPresets}
          isModified={Object.hasOwn(ownSubmission, 'amsMapping')}
          onReset={onResetMaterial}
          onSelect={onSelectMaterial}
        />
      </div>
    );
  }
  const externalSpoolSlot = manifest?.materialSystem.externalSpoolSlot;
  // Only the AMS changes filament mid-print; the external spool feeds one-filament prints.
  const trays = entry.snapshot.setup.materials.flatMap((material): BambuTray[] =>
    material.state === 'loaded' && material.materialId !== undefined && material.slot !== externalSpoolSlot
      ? [
          {
            slot: material.slot,
            label: materialSlotLabel(material.slot, manifest),
            materialId: material.materialId,
            ...(material.color === undefined ? {} : { color: material.color }),
          },
        ]
      : [],
  );
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <FilamentSlots
        colors={filamentColors}
        mapping={mappingOf(submission)}
        trays={trays}
        onChange={onSelectFilamentSlot}
      />
      {entry.snapshot.setup.materials.some((material) => material.slot === externalSpoolSlot) ? (
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
 * @param machineName - The printer's name, for the send label.
 * @returns The action.
 * @public
 */
export const prepareAction = (prepare: PrepareActionFacts, machineName: string): PrepareAction => {
  if (prepare.isSlicing) {
    return { label: 'Slicing…', kind: 'slice' };
  }
  if (prepare.slice && !prepare.isSliceStale) {
    return {
      label: `Send to ${machineName}`,
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
 * Prepare's primary action: the action bar's content, or the end of a folded Prepare. Send opens
 * the start confirmation in its place.
 *
 * @param properties - The machine, its manifest and the prepare state.
 * @returns The actions, or nothing while slicing is unavailable.
 * @public
 */
export function PrepareActions({
  entry,
  manifest,
  prepare,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly prepare: PrintPrepare;
}): React.JSX.Element | undefined {
  const action = prepareAction(prepare, entry.name);
  const { slice, isSlicing, isSending, sendError } = prepare;
  if (action.kind === 'none') {
    return undefined;
  }
  if (action.kind === 'send' && slice && prepare.isConfirmingSend) {
    return (
      <StartConfirmationCard
        digest={slice.digest}
        confirmations={describeStartConfirmations(prepare.sendConfiguration, entry, manifest)}
        machineName={entry.name}
        blocker={prepare.sendBlocker}
        isBusy={isSending}
        error={sendError}
        onConfirm={() => {
          void prepare.send();
        }}
        onBack={prepare.cancelSend}
      />
    );
  }
  if (action.kind === 'send') {
    return (
      <>
        {sendError ? <PrintNotice tone='error'>{sendError}</PrintNotice> : null}
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <Button type='button' size='sm' variant='outline' onClick={prepare.openPreview}>
            <Eye aria-hidden />
            Preview
          </Button>
          <Button
            type='button'
            size='sm'
            className='ml-auto'
            disabled={action.blocker !== undefined}
            aria-describedby={action.blocker === undefined ? undefined : 'print-send-blocker'}
            onClick={prepare.confirmSend}
          >
            <Send aria-hidden />
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
  readonly plates: MachineManifest['bed']['plates'];
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
  entry,
  manifest,
  mode = 'primary',
}: {
  readonly studio: BambuStudioMode;
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly mode?: 'primary' | 'printer';
}): React.JSX.Element {
  const trays = studio.slots.map((slot): BambuTray => {
    const tray = entry.snapshot.setup.materials.find((material) => material.slot === slot);
    return {
      slot,
      label: materialSlotLabel(slot, manifest),
      ...(tray?.materialId === undefined ? {} : { materialId: tray.materialId }),
      ...(tray?.color === undefined ? {} : { color: tray.color }),
    };
  });
  return (
    <>
      <BambuStudioPresets studio={studio} trays={trays} mode={mode} />
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

/** The host's prestart options, a stage summarised by what is on, preserved in the submission projection. */
function StartOptionsStage({ prepare }: { readonly prepare: PrintPrepare }): React.JSX.Element | undefined {
  const declared = startOptions.filter(({ key }) =>
    Object.hasOwn(prepare.submissionSchema?.schema.properties ?? {}, key),
  );
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
 * Why the project's print settings file does not apply to this printer, with the one way to take
 * it over, and why the last change to it was not saved.
 *
 * @param properties - The print intent, the selected printer's model and its name.
 * @returns The notices; empty while the file applies or is absent and the last change saved.
 */
function EngineStatus({
  studio,
  provider,
}: {
  readonly studio: BambuStudioMode;
  readonly provider: MachineProvider | undefined;
}): React.JSX.Element | undefined {
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
      return isRealBambuPrinter(provider) ? (
        <PrintNotice tone='warning' role='status'>
          {bambuStudioRequired}
        </PrintNotice>
      ) : (
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
  return deferred ?? (slice ? 'Changed since the slice' : entryPath === '' ? undefined : modelName(entryPath));
};

/**
 * Advanced settings: the full slicer form (Bambu Studio's printer and filament overrides and settings, or
 * the kernel's slicer options) and the machine mapping, behind one filter.
 *
 * @param properties - The machine, its provider and manifest, and the prepare state.
 * @returns The stage.
 */
function AdvancedSettingsStage({
  entry,
  provider,
  manifest,
  prepare,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
  readonly manifest: MachineManifest | undefined;
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
    const properties = Object.entries(schema.properties ?? {})
      .filter(([key]) => !prepareSubmissionFields.has(key))
      .map(([key, field]): [string, JSONSchema7Definition] => [
        key,
        observedDiameterFields.has(key) && typeof field === 'object' ? { ...field, readOnly: true } : field,
      ]);
    const required = schema.required?.filter((key) => !prepareSubmissionFields.has(key));
    return {
      ...schema,
      properties: Object.fromEntries(properties),
      ...(required === undefined ? {} : { required }),
    };
  }, [submissionSchema]);

  return (
    <PrintStage icon={Settings2} title='Advanced settings'>
      <fieldset disabled={machineSettings.blocked} className='contents'>
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
        {isBambuStudio ? <BambuStudioChoices studio={studio} entry={entry} manifest={manifest} mode='printer' /> : null}
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
              <p role='status' aria-busy='true' className='p-2 text-xs text-muted-foreground'>
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
                parameters={advancedSubmissionValues(submission)}
                defaultParameters={advancedSubmissionValues(
                  submissionDefaults(provider, entry, { manifest, filamentColors }),
                )}
                jsonSchema={advancedSubmissionSchema}
                onParametersChange={(changed) => {
                  setSubmission({
                    ...Object.fromEntries(
                      Object.entries(submission).filter(([key]) => prepareSubmissionFields.has(key)),
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
              <p role='status' aria-busy='true' className='p-2 text-xs text-muted-foreground'>
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
 * @param properties - The machine, its manifest and the prepare state.
 * @returns The stages.
 * @public
 */
export function PrepareStages({
  entry,
  provider,
  manifest,
  prepare,
  deferred,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
  readonly manifest: MachineManifest | undefined;
  readonly prepare: PrintPrepare;
  /** While a decision or a run owns the pane, what Prepare is for: "For the next print". */
  readonly deferred?: string;
}): React.JSX.Element {
  const {
    entryPath,
    entryPaths,
    setEntryPath,
    studio,
    filamentColors,
    selectFilamentSlot,
    isBambuStudio,
    optionsSchema,
    options,
    setOptions,
    submission,
    setSubmission,
    effectiveSubmission,
    machineSettings,
  } = prepare;
  const { intent, update: updateIntent, reset: resetIntent } = machineSettings;
  const { choosePreset } = studio;
  const selectPreset = useCallback(
    (preset: MachineManifest['slicing']['presets'][number]) => {
      if (!isBambuStudio) {
        setOptions(applyPreset(options, preset, optionsSchema?.schema));
      } else if (qualityPresets.has(preset.id)) {
        choosePreset(preset.id as BambuQualityPreset);
      }
    },
    [choosePreset, isBambuStudio, options, optionsSchema, setOptions],
  );
  const selectMaterial = useCallback(
    (slot: number, materialId: string) => {
      setSubmission({ ...submission, expectedMaterials: [{ slot, materialId }], amsMapping: [slot] });
    },
    [setSubmission, submission],
  );
  const selectPlate = useCallback(
    (value: string) => {
      // The plate picked here replaces one set under Advanced, which would otherwise keep winning.
      const { expectedBedType: _advanced, ...rest } = submission;
      setSubmission(rest);
      // SAFETY: plate ids are the manifest's; the serializer refuses one Bambu Studio does not name.
      updateIntent((current) => ({ ...current, plate: value as PrintPreferences['plate'] }));
    },
    [setSubmission, submission, updateIntent],
  );
  const resetPlate = useCallback(() => {
    updateIntent(({ plate: _plate, ...rest }) => rest);
  }, [updateIntent]);
  const resetPreset = useCallback(() => {
    updateIntent(({ preset: _preset, ...rest }) => rest);
  }, [updateIntent]);
  const plates = manifest?.bed.plates ?? [];
  const selectedPlate = effectiveSubmission['expectedBedType'];
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
        <EngineStatus studio={studio} provider={provider} />
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
                selected={selectedPlate}
                isModified={intent?.plate !== undefined}
                onChange={selectPlate}
                onReset={resetPlate}
              />
              <MaterialChoice
                entry={entry}
                manifest={manifest}
                filamentColors={filamentColors}
                submission={effectiveSubmission}
                ownSubmission={submission}
                filamentPresets={isBambuStudio ? studio.chosen.filaments : undefined}
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
                  presets={manifest.slicing.presets}
                  options={presetState}
                  isModified={intent?.preset !== undefined}
                  onSelect={selectPreset}
                  onReset={resetPreset}
                />
              ) : null}
              {isBambuStudio ? <BambuStudioChoices studio={studio} entry={entry} manifest={manifest} /> : null}
            </div>
          </fieldset>
        </div>
        <fieldset disabled={machineSettings.blocked} className='contents'>
          <SliceNotices prepare={prepare} />
          <SliceResult prepare={prepare} />
          {deferred === undefined ? null : <PrepareActions entry={entry} manifest={manifest} prepare={prepare} />}
        </fieldset>
      </PrintStage>
      <StartOptionsStage prepare={prepare} />
      <AdvancedSettingsStage entry={entry} provider={provider} manifest={manifest} prepare={prepare} />
    </>
  );
}
