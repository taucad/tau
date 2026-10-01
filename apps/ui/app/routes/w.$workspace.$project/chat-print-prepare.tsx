import type { MachineSettingsProvenance } from '@taucad/runtime/machine/settings';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { defaultFilamentSlots, machineSliceOptions } from '@taucad/agent-tools/registry';
import type { RJSFSchema } from '@rjsf/utils';
import { Check, Eye, LoaderCircle, Scissors, Send } from 'lucide-react';
import type { JSONSchema7 } from '@taucad/json-schema';
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
import { Button } from '@taucad/ui/components/button';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { sha256Bytes } from '@taucad/utils/hash';
import { randomUuid } from '@taucad/utils/id';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { ParameterGroupCard } from '#components/geometry/parameters/parameter-group-card.js';
import { BambuStudioPresets } from '#components/print/bambu-studio-presets.js';
import type { BambuTray } from '#components/print/bambu-studio-presets.js';
import { FilamentSlots } from '#components/print/filament-slots.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { SearchInput } from '#components/search-input.js';
import { isRealBambuPrinter, useBambuStudio } from '#components/print/use-bambu-studio.js';
import type { BambuQualityPreset, BambuStudioMode } from '#components/print/use-bambu-studio.js';
import { useMachineSettings } from '#components/print/use-machine-settings.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { compileExportConfigurationManifest } from '#routes/w.$workspace.$project/chat-converter.js';
import { listGeometryEntryPaths } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import { selectCadFailureIssues } from '#machines/cad.machine.js';
import {
  PrintDisclosure,
  PrintNotice,
  PrintSection,
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
  summarizeGcodeContainer,
} from '#routes/w.$workspace.$project/chat-print-summary.js';
import type { PlateFit, SliceSummary } from '#routes/w.$workspace.$project/chat-print-summary.js';
import { bestRouteForActiveKernel, exportWithRuntimeValidatedInput } from '#utils/export-formats.utils.js';

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
  /** The rendered geometry it was sliced from, compared by identity: a new render makes the slice stale. */
  geometry: unknown;
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
  const renderTimeout = entriesRecord?.entries[entryPath]?.renderTimeout;
  useEffect(() => {
    if (!isShown || !entryPath) {
      return;
    }
    const claimId = randomUuid();
    projectRef.send({ type: 'claimGeometryUnit', claimId, entryPath, renderTimeout });
    return () => {
      projectRef.send({ type: 'releaseGeometryUnit', claimId });
    };
  }, [entryPath, isShown, projectRef, renderTimeout]);
  const actor = useSelector(projectRef, (state) => state.context.geometryUnits.get(entryPath));
  const kernelClient = useSelector(actor, (state) => state?.context.kernelClient);
  const activeKernelId = useSelector(actor, (state) => state?.context.activeKernelId);
  const capabilities = useSelector(actor, (state) => state?.context.capabilities);
  const geometry: unknown = useSelector(actor, (state) => state?.context.geometry);
  const hasGeometry = geometry !== undefined;

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
  /* Kept with the geometry it described, so a new render retires it (a failure on an empty model must not outlive it). */
  const [failedSlice, setFailedSlice] = useState<Readonly<{ message: string; geometry: unknown }>>();
  const sliceError = failedSlice !== undefined && failedSlice.geometry === geometry ? failedSlice.message : undefined;
  const [isSending, setIsSending] = useState(false);
  const [isConfirmingSend, setIsConfirmingSend] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const requestIdRef = useRef<{ readonly key: string; readonly requestId: string }>(undefined);
  const operationIdsRef = useRef(
    new Map<string, { readonly uploadOperationId: string; readonly startOperationId: string }>(),
  );

  const modelColors = useMemo(() => {
    if (
      typeof geometry !== 'object' ||
      geometry === null ||
      !('format' in geometry) ||
      geometry.format !== 'gltf' ||
      !('content' in geometry) ||
      !(geometry.content instanceof Uint8Array) ||
      !(geometry.content.buffer instanceof ArrayBuffer)
    ) {
      return noColors;
    }
    try {
      const components = buildGltfComponentManifest(geometry.content as Uint8Array<ArrayBuffer>);
      const materials = components.nodesById[components.rootId]?.appearance?.materials ?? [];
      return [...new Set(materials.flatMap(({ color }) => (color?.startsWith('#') ? [color.toUpperCase()] : [])))];
    } catch {
      return noColors;
    }
  }, [geometry]);
  const filamentColors =
    slice !== undefined && slice.geometry === geometry ? slice.summary.filamentColors : modelColors;
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
      slice?.geometry !== geometry ||
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
  }, [entry, filamentColors, intent, manifest, modelColors, provider, slice?.geometry, submission]);
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
  const sliceBlocker = ((): string | undefined => {
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
    if (slice.geometry !== geometry) {
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
    const claimId = randomUuid();
    projectRef.send({ type: 'claimGeometryUnit', claimId, entryPath, renderTimeout });
    setIsSlicing(true);
    setFailedSlice(undefined);
    let sliceGeometry = geometry;
    try {
      await machineSettings.flush();
      const settled = await awaitFreshRender(actor);
      const failedIssues = selectCadFailureIssues(settled);
      if (failedIssues) {
        throw new Error(failedIssues.map((issue) => issue.message).join('; ') || 'The selected CAD render failed');
      }
      if (settled.context.latestGeometryOutcome !== 'success') {
        throw new Error(`No current successful geometry is available for ${entryPath}`);
      }
      sliceGeometry = settled.context.geometry;
      const freshKernelClient = settled.context.kernelClient;
      const freshKernelId = settled.context.activeKernelId;
      const freshRoute = freshKernelClient
        ? bestRouteForActiveKernel(freshKernelClient, gcodeContainerFormat, freshKernelId)
        : undefined;
      if (!freshKernelClient || !freshRoute) {
        throw new Error('The selected CAD runtime is unavailable');
      }
      const result = await exportWithRuntimeValidatedInput(freshKernelClient, freshRoute, {
        exportOptions: sliceOptions,
      });
      if (!result.success) {
        throw new Error(result.issues.map((issue) => issue.message).join('; ') || 'Slicing failed.');
      }
      const file = result.data[0];
      if (!file) {
        throw new Error('The slicer produced no file.');
      }
      const fileName = `${modelName(entryPath)}.gcode.3mf`;
      const hex = await sha256Bytes(file.bytes);
      // SAFETY: sha256Bytes returns the lowercase hex the digest brand describes.
      const digest = `sha256:${hex}` as MachineArtifactReference['digest'];
      /* Named by its bytes, as job imports are (blueprint D5), so a later slice never rewrites what a request names. */
      const path = `.tau/artifacts/${hex}/${fileName}`;
      const isHeld = (await fileManager.exists(path)) && (await sha256Bytes(await fileManager.readFile(path))) === hex;
      if (!isHeld) {
        await fileManager.writeFiles({ [path]: { content: file.bytes } });
      }
      const summary = summarizeGcodeContainer(file.bytes);
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
        geometry: sliceGeometry,
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
      setFailedSlice({ message: error instanceof Error ? error.message : String(error), geometry: sliceGeometry });
    } finally {
      setIsSlicing(false);
      projectRef.send({ type: 'releaseGeometryUnit', claimId });
    }
  }, [
    machineSettings.flush,
    actor,
    entry,
    entryPath,
    fileManager,
    geometry,
    kernelClient,
    manifest,
    modelColors,
    optionsKey,
    provider,
    projectRef,
    renderTimeout,
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
      <ToggleGroup
        type='single'
        variant='outline'
        size='sm'
        aria-label='Quality'
        className='h-(--param-field-h) rounded-(--param-field-radius) border border-border/50 bg-muted p-0'
        value={selected}
        onValueChange={(value) => {
          const preset = presets.find((candidate) => candidate.id === value);
          if (preset) {
            onSelect(preset);
          }
        }}
      >
        {presets.map((preset) => (
          <ToggleGroupItem
            key={preset.id}
            value={preset.id}
            aria-label={`${preset.label} ${formatQuantity(preset.layerHeight)}`}
            className='h-full min-w-0 rounded-(--param-field-radius) px-2 text-xs font-normal text-(--param-field-color) data-[state=on]:bg-background data-[state=on]:text-foreground'
          >
            {preset.label}
            <span className='text-muted-foreground'>{formatQuantity(preset.layerHeight)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </PrintSetupRow>
  );
}

function MaterialSelect({
  entry,
  manifest,
  submission,
  onSelect,
  isModified,
  onReset,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly submission: Record<string, unknown>;
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
  return (
    <PrintSetupRow label='Material' isModified={isModified} onReset={onReset}>
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
  onSelectMaterial,
  onSelectFilamentSlot,
  onResetMaterial,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly filamentColors: readonly string[];
  readonly submission: Record<string, unknown>;
  readonly ownSubmission: Record<string, unknown>;
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

function SliceResult({
  prepare,
  entry,
  manifest,
}: {
  readonly prepare: PrintPrepare;
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
}): React.JSX.Element | undefined {
  const {
    slice,
    staleReason,
    openPreview,
    confirmSend,
    cancelSend,
    isConfirmingSend,
    send,
    isSending,
    sendError,
    sendBlocker,
  } = prepare;
  if (!slice) {
    return undefined;
  }
  const machineName = entry.name;
  const { summary, fit, warnings } = slice;
  return (
    <div className='flex min-w-0 flex-col gap-2' aria-label='Slice result'>
      {summary.producer ? (
        <p className='text-xs text-muted-foreground'>Sliced by {formatProducer(summary.producer)}</p>
      ) : null}
      <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
        <dt className='text-muted-foreground'>File</dt>
        <dd className='truncate font-mono'>{slice.fileName}</dd>
        <dt className='text-muted-foreground'>Layers</dt>
        <dd className='tabular-nums'>{summary.layers}</dd>
        <dt className='text-muted-foreground'>Time</dt>
        <dd className='tabular-nums'>
          {formatDuration(summary.estimatedDuration)}
          {summary.isSlicerEstimate
            ? ` (${summary.producer?.name ?? 'slicer'} estimate)`
            : summary.coverageComplete
              ? ''
              : ' (known motion only)'}
        </dd>
        <dt className='text-muted-foreground'>Filament</dt>
        <dd className='tabular-nums'>{formatFilament(summary.filamentLength)}</dd>
        <dt className='text-muted-foreground'>Weight</dt>
        <dd className='tabular-nums'>
          {summary.filamentWeightGrams === undefined
            ? 'Unknown'
            : `${String(Math.round(summary.filamentWeightGrams * 10) / 10)} g (slicer estimate)`}
        </dd>
        {summary.bounds === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Part</dt>
            <dd className='tabular-nums'>
              {summary.partBounds === undefined ? (
                <span className='text-muted-foreground'>Unknown: this G-code does not label walls or infill</span>
              ) : (
                formatSize(summary.partBounds)
              )}
            </dd>
            <dt className='text-muted-foreground'>Toolpath</dt>
            <dd className='tabular-nums'>
              {formatSize(summary.bounds)}{' '}
              <span className='text-muted-foreground'>
                · every nozzle move, including the printer&apos;s start routine
              </span>
            </dd>
          </>
        )}
      </dl>
      {summary.previewRefusal === undefined ? null : (
        <PrintNotice tone='neutral' role='status'>
          {summary.previewRefusal}
        </PrintNotice>
      )}
      {fit === undefined ? null : fit.fits ? (
        <p className='flex items-center gap-1.5 text-xs'>
          <Check aria-hidden className='size-3.5 text-success' />
          {fit.message}
        </p>
      ) : (
        <PrintNotice tone='warning'>{fit.message}</PrintNotice>
      )}
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
      {isConfirmingSend ? (
        <StartConfirmationCard
          digest={slice.digest}
          confirmations={describeStartConfirmations(prepare.sendConfiguration, entry, manifest)}
          machineName={machineName}
          blocker={sendBlocker}
          isBusy={isSending}
          error={sendError}
          onConfirm={() => {
            void send();
          }}
          onBack={cancelSend}
        />
      ) : (
        <>
          {sendError ? <PrintNotice tone='destructive'>{sendError}</PrintNotice> : null}
          <div className='flex flex-wrap gap-2'>
            <Button type='button' size='sm' variant='outline' onClick={openPreview}>
              <Eye aria-hidden />
              Open printer preview
            </Button>
            <Button
              type='button'
              size='sm'
              disabled={sendBlocker !== undefined}
              aria-describedby={sendBlocker === undefined ? undefined : 'print-send-blocker'}
              onClick={confirmSend}
            >
              <Send aria-hidden />
              {`Send to ${machineName}`}
            </Button>
          </div>
          {sendBlocker === undefined ? null : (
            <p id='print-send-blocker' className='text-xs text-muted-foreground'>
              {sendBlocker}
            </p>
          )}
        </>
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
    return undefined;
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
      {mode === 'printer' || studio.error === undefined ? null : (
        <PrintNotice tone='destructive'>{studio.error}</PrintNotice>
      )}
    </>
  );
}

/** The slice button, why it waits and why the last slice failed. */
function SliceControls({ prepare }: { readonly prepare: PrintPrepare }): React.JSX.Element {
  const { route, hasGeometry, isSlicing, slice, sliceNow, sliceError, studio } = prepare;
  // A Bambu Studio failure is already shown with the presets; the wait is stated only while loading.
  const waiting = studio.error === undefined ? prepare.sliceBlocker : undefined;
  if (route === undefined) {
    return (
      <PrintNotice tone='neutral' role='status'>
        {hasGeometry ? 'Slicing is not available for this kernel yet.' : 'Render the model to enable slicing.'}
      </PrintNotice>
    );
  }
  return (
    <>
      <Button
        type='button'
        size='sm'
        className='self-start'
        disabled={isSlicing || !hasGeometry || prepare.sliceBlocker !== undefined}
        aria-describedby={waiting === undefined ? undefined : 'print-slice-blocker'}
        onClick={sliceNow}
      >
        {isSlicing ? (
          <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
        ) : (
          <Scissors aria-hidden />
        )}
        {isSlicing ? 'Slicing…' : slice ? 'Slice again' : 'Slice and preview'}
      </Button>
      {waiting === undefined ? null : (
        <p id='print-slice-blocker' role='status' aria-busy='true' className='text-xs text-muted-foreground'>
          {waiting}
        </p>
      )}
      {sliceError ? <PrintNotice tone='destructive'>{sliceError}</PrintNotice> : null}
    </>
  );
}

/** The host's prestart defaults, visible before Slice and preserved in the submission projection. */
function BeforeStarting({ prepare }: { readonly prepare: PrintPrepare }): React.JSX.Element | undefined {
  const [isOpen, setIsOpen] = useState(true);
  const rows = [
    { key: 'bedLeveling', label: 'Bed levelling', description: 'Probe the plate before the first layer.' },
    {
      key: 'flowCalibration',
      label: 'Flow calibration',
      description: 'Calibrate flow dynamics for the loaded filament.',
    },
    { key: 'timelapse', label: 'Timelapse', description: 'Record a frame every layer.' },
  ] as const;
  const declared = rows.filter(({ key }) => Object.hasOwn(prepare.submissionSchema?.schema.properties ?? {}, key));
  if (declared.length === 0) {
    return undefined;
  }
  const changed = declared.filter(({ key }) => Object.hasOwn(prepare.submission, key)).length;
  return (
    <ParameterGroupCard
      title='Before starting'
      isOpen={isOpen}
      trailing={
        <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
          {changed === 0 ? `(${String(declared.length)})` : `(${String(changed)} changed)`}
        </span>
      }
      onOpenChange={setIsOpen}
    >
      {declared.map(({ key, label, description }) => (
        <PrintSetupRow
          key={key}
          label={label}
          description={description}
          className='px-2.5'
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
    </ParameterGroupCard>
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
        jsonSchema={shown.form.resolved.schema as RJSFSchema}
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
      return (
        <p role='status' className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
          <Check aria-hidden className='size-3.5 shrink-0 text-success' />
          {studio.version === undefined ? 'Slicing with Bambu Studio' : `Slicing with Bambu Studio ${studio.version}`}
        </p>
      );
    }
    default: {
      return isRealBambuPrinter(provider) ? (
        <PrintNotice tone='warning' role='status'>
          {bambuStudioRequired}
        </PrintNotice>
      ) : (
        <p role='status' className='text-xs text-muted-foreground'>
          Slicing with Tau&apos;s reference slicer: Bambu Studio is not available here.
        </p>
      );
    }
  }
}

/**
 * Prepare: choose a preset, material and plate, slice, read the result, open
 * the preview or send. Advanced holds the full slicer and submission forms.
 *
 * @param properties - The machine, its manifest and the prepare state.
 * @returns The section.
 * @public
 */
export function PrepareSection({
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
  const [moreSettingsFilter, setMoreSettingsFilter] = useState('');
  const {
    entryPath,
    entryPaths,
    setEntryPath,
    route,
    studio,
    filamentColors,
    selectFilamentSlot,
    isBambuStudio,
    optionsSchema,
    options,
    setOptions,
    submissionSchema,
    submission,
    setSubmission,
    effectiveSubmission,
    machineSettings,
  } = prepare;
  const { intent, update: updateIntent, reset: resetIntent } = machineSettings;
  const providerKey = route
    ? route.transcoderId === undefined
      ? String(route.kernelId)
      : `${String(route.kernelId)}+${String(route.transcoderId)}`
    : undefined;
  const optionsManifest = useCompiledConfigurationManifest(providerKey, 'print/options', optionsSchema);
  const submissionManifest = useCompiledConfigurationManifest(provider?.id, 'print/submission', submissionSchema);
  const advancedSubmissionSchema = useMemo<RJSFSchema | undefined>(() => {
    if (!submissionSchema) {
      return undefined;
    }
    const schema = submissionSchema.schema as RJSFSchema;
    return {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties ?? {})
          .filter(([key]) => !prepareSubmissionFields.has(key))
          .map(([key, field]) => [
            key,
            observedDiameterFields.has(key) && typeof field === 'object' ? { ...field, readOnly: true } : field,
          ]),
      ),
      required: schema.required?.filter((key) => !prepareSubmissionFields.has(key)),
    };
  }, [submissionSchema]);
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

  return (
    <PrintSection
      title='Prepare'
      aside={
        /* Beside the heading, never inside a trigger: a reset is a button of its own. */
        hasIntentChanges(intent) || Object.keys(machineSettings.machine ?? {}).length > 0 ? (
          <ModifiedIndicator onReset={resetIntent} tooltip='Reset print settings' />
        ) : undefined
      }
    >
      <ModelSelect entryPath={entryPath} entryPaths={entryPaths} onChange={setEntryPath} />
      <EngineStatus studio={studio} provider={provider} />
      <MachineProfiles settings={machineSettings} studio={studio} />
      {/* Keep disabled semantics without Chromium's fieldset anonymous layout box around query containers. */}
      <fieldset disabled={machineSettings.blocked} className='contents'>
        <div className='flex min-w-0 flex-col gap-3'>
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
          <BeforeStarting prepare={prepare} />
          <SliceControls prepare={prepare} />
          <SliceResult prepare={prepare} entry={entry} manifest={manifest} />
          <PrintDisclosure title='More settings'>
            <SearchInput
              aria-label='Filter settings'
              placeholder='Filter settings'
              value={moreSettingsFilter}
              className='h-6 w-full bg-background text-sm'
              onChange={(event) => {
                setMoreSettingsFilter(event.target.value);
              }}
              onClear={() => {
                setMoreSettingsFilter('');
              }}
            />
            {isBambuStudio ? (
              <BambuStudioChoices studio={studio} entry={entry} manifest={manifest} mode='printer' />
            ) : null}
            {isBambuStudio ? (
              <BambuStudioSettings studio={studio} filterTerm={moreSettingsFilter} />
            ) : optionsSchema ? (
              <div className='min-w-0' role='group' aria-label='Slicer options'>
                {optionsManifest ? (
                  <Parameters
                    parameters={options}
                    defaultParameters={optionsSchema.defaults}
                    jsonSchema={optionsSchema.schema as RJSFSchema}
                    onParametersChange={setOptions}
                    enableSearch={false}
                    filterTerm={moreSettingsFilter}
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
                    filterTerm={moreSettingsFilter}
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
          </PrintDisclosure>
        </div>
      </fieldset>
    </PrintSection>
  );
}
