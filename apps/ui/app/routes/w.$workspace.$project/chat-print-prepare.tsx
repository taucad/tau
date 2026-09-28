import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { printIntentPath, printIntentSchema } from '@taucad/slicer/print-intent';
import type { PrintIntent } from '@taucad/slicer/print-intent';
import type { FileExtension } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { sha256Bytes } from '@taucad/utils/hash';
import { randomUuid } from '@taucad/utils/id';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { BambuStudioPresets } from '#components/print/bambu-studio-presets.js';
import type { BambuTray } from '#components/print/bambu-studio-presets.js';
import { FilamentSlots } from '#components/print/filament-slots.js';
import { isRealBambuPrinter, useBambuStudio } from '#components/print/use-bambu-studio.js';
import type { BambuQualityPreset, BambuStudioMode } from '#components/print/use-bambu-studio.js';
import { usePrintIntent } from '#components/print/use-print-intent.js';
import type { PrintIntentHandle } from '#components/print/use-print-intent.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { compileExportConfigurationManifest } from '#routes/w.$workspace.$project/chat-converter.js';
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
const intentOptionKeys: ReadonlySet<string> = new Set(Object.keys(printIntentSchema.shape.options.unwrap().shape));

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
  intent: PrintIntent,
  next: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): PrintIntent => {
  const { preset, options, ...rest } = intent;
  const changed = Object.fromEntries(
    keys.filter((key) => key !== 'preset').map((key): [string, unknown] => [key, next[key]]),
  );
  const merged = Object.fromEntries(
    Object.entries<unknown>({ ...options, ...changed }).filter(([, value]) => value !== undefined),
  );
  // SAFETY: the form checks each value against the slicer's schema, and the serializer validates it again.
  const nextPreset = (keys.includes('preset') ? next['preset'] : preset) as PrintIntent['preset'];
  // SAFETY: as above; only the keys `intentOptionKeys` names reach this record.
  const nextOptions = merged as PrintIntent['options'];
  return {
    ...rest,
    ...(nextPreset === undefined ? {} : { preset: nextPreset }),
    ...(Object.keys(merged).length === 0 ? {} : { options: nextOptions }),
  };
};

/** Whether a print intent holds anything beyond its model. */
const hasIntentChanges = (intent: PrintIntent | undefined): boolean =>
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
 * maps several ({@link defaultFilamentSlots}), `-1` where no free tray of the print's material is left.
 */
const defaultMapping = (
  entry: MachineDirectoryEntry,
  loaded: MachineDirectoryEntry['snapshot']['setup']['materials'][number] | undefined,
  filamentColors: readonly string[],
): readonly number[] => {
  if (loaded?.materialId === undefined) {
    return [];
  }
  return filamentColors.length > 1
    ? defaultFilamentSlots(filamentColors, entry.snapshot.setup.materials, loaded.materialId).map((slot) => slot ?? -1)
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
  const mapping = defaultMapping(entry, loaded, filamentColors);
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
  /** The project's print settings in `.tau/machines/printer.json`. */
  printIntent: PrintIntentHandle;
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
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry | undefined;
  readonly provider: MachineProvider | undefined;
  readonly manifest: MachineManifest | undefined;
}): PrintPrepare => {
  const { projectId, geometryUnits, mainEntryPath, editorRef } = useProject();
  const fileManager = useFileManager();
  const [chosenEntryPath, setEntryPath] = useState<string>();
  const entryPath =
    chosenEntryPath !== undefined && geometryUnits.has(chosenEntryPath) ? chosenEntryPath : mainEntryPath;
  const entryPaths = useMemo(() => [...geometryUnits.keys()], [geometryUnits]);
  const actor = geometryUnits.get(entryPath);
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

  const printIntent = usePrintIntent(manifest?.identity.model);
  const { intent, update: updateIntent } = printIntent;
  /* Reference options no print intent may hold (the machine's nozzle, bed and plate, the engine) stay on screen. */
  const [screenOptions, setScreenOptions] = useState<Record<string, unknown>>({});
  const [submission, setSubmission] = useState<Record<string, unknown>>({});
  const [slice, setSlice] = useState<SlicedArtifact>();
  const [isSlicing, setIsSlicing] = useState(false);
  /* Kept with the geometry it described, so a new render retires it (a failure on an empty model must not outlive it). */
  const [failedSlice, setFailedSlice] = useState<Readonly<{ message: string; geometry: unknown }>>();
  const sliceError = failedSlice !== undefined && failedSlice.geometry === geometry ? failedSlice.message : undefined;
  const [isSending, setIsSending] = useState(false);
  const [isConfirmingSend, setIsConfirmingSend] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const requestIdRef = useRef<{ readonly digest: string; readonly requestId: string }>(undefined);
  const operationIdsRef = useRef(
    new Map<string, { readonly uploadOperationId: string; readonly startOperationId: string }>(),
  );

  const filamentColors = slice?.summary.filamentColors ?? noColors;
  const effectiveSubmission = useMemo(() => {
    if (!provider || !entry) {
      return submission;
    }
    /* A mapping made for another number of filaments (a material picked before the slice showed several colours)
     * gives way to the defaults for this slice's filaments. */
    const { amsMapping: ownMapping, expectedMaterials: _ownMaterials, ...own } = submission;
    const isOwnMapping =
      filamentColors.length < 2 || !Array.isArray(ownMapping) || ownMapping.length === filamentColors.length;
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
  }, [entry, filamentColors, intent, manifest, provider, submission]);
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
    [entry, slots, submission],
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
  const optionsKey = JSON.stringify(sliceOptions ?? null);
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
    if (!kernelClient || !route || sliceOptions === undefined) {
      return;
    }
    setIsSlicing(true);
    setFailedSlice(undefined);
    try {
      const result = await exportWithRuntimeValidatedInput(kernelClient, route, { exportOptions: sliceOptions });
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
      setSlice({
        path,
        fileName,
        digest,
        length: file.bytes.byteLength,
        mimeType: file.mimeType,
        geometry,
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
      setFailedSlice({ message: error instanceof Error ? error.message : String(error), geometry });
    } finally {
      setIsSlicing(false);
    }
  }, [entryPath, fileManager, geometry, kernelClient, manifest, optionsKey, route, sliceOptions]);

  const openPreview = useCallback((): void => {
    if (slice) {
      editorRef.send({ type: 'openFile', path: slice.path, source: 'user' });
    }
  }, [editorRef, slice]);

  const sendBlocker = ((): string | undefined => {
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
    return startBlocker(effectiveSubmission, entry, manifest);
  })();

  const send = useCallback(async (): Promise<void> => {
    if (!slice || !entry || !provider || sendBlocker !== undefined) {
      return;
    }
    setIsSending(true);
    setSendError(undefined);
    try {
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
      if (requestIdRef.current?.digest !== slice.digest) {
        requestIdRef.current = { digest: slice.digest, requestId: randomUuid() };
      }
      const record = await client.requestPrint({
        machineId: entry.machineId,
        artifact,
        configuration: effectiveSubmission as MachineRequestPrintInput['configuration'],
        requestedBy: operator,
        summary: {
          fileName: slice.fileName,
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
  }, [client, effectiveSubmission, entry, projectId, provider, sendBlocker, slice]);

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
    printIntent,
    sliceBlocker,
    optionsSchema,
    options,
    setOptions,
    submissionSchema,
    submission,
    setSubmission,
    effectiveSubmission,
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

const chipClass = (isSelected: boolean): string =>
  cn('justify-start', isSelected && 'border-border bg-accent text-accent-foreground hover:bg-accent');

function PresetChips({
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
  return (
    <div className='flex min-w-0 items-center gap-1.5'>
      <div role='group' aria-label='Quality preset' className='flex flex-wrap gap-1.5'>
        {presets.map((preset) => {
          const isSelected = active === preset.id || active === preset.layerHeight.value;
          return (
            <Button
              key={preset.id}
              type='button'
              size='xs'
              variant='outline'
              aria-pressed={isSelected}
              className={chipClass(isSelected)}
              onClick={() => {
                onSelect(preset);
              }}
            >
              {isSelected ? <Check aria-hidden className='size-3' /> : null}
              {preset.label}
              <span className='text-muted-foreground'>{formatQuantity(preset.layerHeight)}</span>
            </Button>
          );
        })}
      </div>
      {isModified ? <ModifiedIndicator onReset={onReset} tooltip='Reset Quality preset' /> : null}
    </div>
  );
}

function MaterialChips({
  entry,
  manifest,
  submission,
  onSelect,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly submission: Record<string, unknown>;
  readonly onSelect: (slot: number, materialId: string) => void;
}): React.JSX.Element {
  const mapping = submission['amsMapping'];
  const selectedSlot: unknown = Array.isArray(mapping) ? mapping[0] : undefined;
  const { materials } = entry.snapshot.setup;
  if (materials.length === 0) {
    return <p className='text-xs text-muted-foreground'>No material slots observed.</p>;
  }
  return (
    <div role='group' aria-label='Material' className='flex flex-wrap gap-1.5'>
      {materials.map((material) => {
        const label = materialSlotLabel(material.slot, manifest);
        const isLoaded = material.state === 'loaded' && material.materialId !== undefined;
        const isSelected = selectedSlot === material.slot;
        return (
          <Button
            key={material.slot}
            type='button'
            size='xs'
            variant='outline'
            aria-pressed={isSelected}
            disabled={!isLoaded}
            className={chipClass(isSelected)}
            onClick={() => {
              if (material.materialId !== undefined) {
                onSelect(material.slot, material.materialId);
              }
            }}
          >
            <span className='font-mono'>{label}</span>
            {isLoaded ? material.materialId : material.state === 'empty' ? 'Empty' : 'Unknown'}
            {material.color ? (
              <span
                aria-hidden
                className='size-2.5 rounded-full border border-border/70'
                // Observed filament color is user data, not chrome (ui-policy §5).
                style={{ backgroundColor: material.color }}
              />
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

/** One material chip row for a one-colour print; a slot per filament for a slice that prints several. */
function MaterialChoice({
  entry,
  manifest,
  filamentColors,
  submission,
  onSelectMaterial,
  onSelectFilamentSlot,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly filamentColors: readonly string[];
  readonly submission: Record<string, unknown>;
  readonly onSelectMaterial: (slot: number, materialId: string) => void;
  readonly onSelectFilamentSlot: (filament: number, slot: number) => void;
}): React.JSX.Element {
  if (filamentColors.length < 2) {
    return <MaterialChips entry={entry} manifest={manifest} submission={submission} onSelect={onSelectMaterial} />;
  }
  const trays = entry.snapshot.setup.materials.flatMap((material): BambuTray[] =>
    material.state === 'loaded' && material.materialId !== undefined
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
    <FilamentSlots
      colors={filamentColors}
      mapping={mappingOf(submission)}
      trays={trays}
      onChange={onSelectFilamentSlot}
    />
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
          confirmations={describeStartConfirmations(prepare.effectiveSubmission, entry, manifest)}
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
    <label className='flex min-w-0 flex-col gap-1 text-xs text-muted-foreground'>
      Model
      <select
        className='h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground'
        value={entryPath}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {entryPaths.map((candidate) => (
          <option key={candidate} value={candidate}>
            {candidate}
          </option>
        ))}
      </select>
    </label>
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
  readonly onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  readonly onReset: () => void;
}): React.JSX.Element | undefined {
  const id = useId();
  if (plates.length === 0) {
    return undefined;
  }
  return (
    <div className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
      <label htmlFor={id} className={cn(isModified && 'font-medium text-foreground')}>
        Plate
      </label>
      {isModified ? <ModifiedIndicator onReset={onReset} tooltip='Reset Plate' /> : null}
      <select
        id={id}
        aria-label='Plate'
        className='h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground'
        value={typeof selected === 'string' ? selected : ''}
        onChange={onChange}
      >
        {plates.map((plate) => (
          <option key={plate.id} value={plate.id}>
            {plate.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Bambu Studio's presets for the used trays, and what a preset change did to the person's settings. */
function BambuStudioChoices({
  studio,
  entry,
  manifest,
}: {
  readonly studio: BambuStudioMode;
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
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
      <BambuStudioPresets studio={studio} trays={trays} />
      {studio.dropped > 0 ? (
        <PrintNotice tone='neutral' role='status'>
          {studio.dropped === 1
            ? '1 changed setting does not exist in these presets and was dropped.'
            : `${String(studio.dropped)} changed settings do not exist in these presets and were dropped.`}
        </PrintNotice>
      ) : null}
      {studio.error === undefined ? null : <PrintNotice tone='destructive'>{studio.error}</PrintNotice>}
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
function BambuStudioSettings({ studio }: { readonly studio: BambuStudioMode }): React.JSX.Element {
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
    <div
      role='group'
      aria-label='Bambu Studio settings'
      className='overflow-hidden rounded-lg border border-border/70 bg-card'
    >
      <Parameters
        parameters={parameters}
        defaultParameters={shown.form.resolved.defaults}
        jsonSchema={shown.form.resolved.schema as RJSFSchema}
        searchPlaceholder='Filter settings'
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
function PrintIntentNotice({
  printIntent,
  model,
  machineName,
}: {
  readonly printIntent: PrintIntentHandle;
  readonly model: string | undefined;
  readonly machineName: string;
}): React.JSX.Element {
  const { file, error, reset } = printIntent;
  const isInvalid = file.status === 'invalid';
  const otherModel = file.status === 'current' && file.intent.model !== model ? file.intent.model : undefined;
  const isElsewhere = model !== undefined && (isInvalid || otherModel !== undefined);
  return (
    <>
      {isElsewhere ? (
        <PrintNotice tone={isInvalid ? 'warning' : 'neutral'} role={isInvalid ? 'alert' : 'status'}>
          <p>
            {isInvalid
              ? `This project's print settings file (${printIntentPath}) cannot be read, so ${machineName} uses its defaults and changes here are not saved.`
              : `This project's print settings are for another printer model (${String(otherModel)}), so ${machineName} uses its defaults. Changing a setting here replaces them.`}
          </p>
          <Button type='button' size='xs' variant='outline' className='mt-2' onClick={reset}>
            Reset print settings
          </Button>
        </PrintNotice>
      ) : null}
      {error === undefined ? null : <PrintNotice tone='warning'>{error}</PrintNotice>}
    </>
  );
}

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
    printIntent,
  } = prepare;
  const { intent, update: updateIntent, reset: resetIntent } = printIntent;
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
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const { value } = event.target;
      // The plate picked here replaces one set under Advanced, which would otherwise keep winning.
      const { expectedBedType: _advanced, ...rest } = submission;
      setSubmission(rest);
      // SAFETY: plate ids are the manifest's; the serializer refuses one Bambu Studio does not name.
      updateIntent((current) => ({ ...current, plate: value as PrintIntent['plate'] }));
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
        hasIntentChanges(intent) ? (
          <ModifiedIndicator onReset={resetIntent} tooltip='Reset print settings' />
        ) : undefined
      }
    >
      <ModelSelect entryPath={entryPath} entryPaths={entryPaths} onChange={setEntryPath} />
      <EngineStatus studio={studio} provider={provider} />
      <PrintIntentNotice printIntent={printIntent} model={manifest?.identity.model} machineName={entry.name} />
      {manifest ? (
        <PresetChips
          presets={manifest.slicing.presets}
          options={presetState}
          isModified={intent?.preset !== undefined}
          onSelect={selectPreset}
          onReset={resetPreset}
        />
      ) : null}
      <MaterialChoice
        entry={entry}
        manifest={manifest}
        filamentColors={filamentColors}
        submission={effectiveSubmission}
        onSelectMaterial={selectMaterial}
        onSelectFilamentSlot={selectFilamentSlot}
      />
      <PlateSelect
        plates={plates}
        selected={selectedPlate}
        isModified={intent?.plate !== undefined}
        onChange={selectPlate}
        onReset={resetPlate}
      />
      {isBambuStudio ? <BambuStudioChoices studio={studio} entry={entry} manifest={manifest} /> : null}
      <SliceControls prepare={prepare} />
      <SliceResult prepare={prepare} entry={entry} manifest={manifest} />
      <PrintDisclosure title='Advanced'>
        {isBambuStudio ? (
          <BambuStudioSettings studio={studio} />
        ) : optionsSchema ? (
          <div className='overflow-hidden rounded-lg border border-border/70 bg-card' aria-label='Slicer options'>
            {optionsManifest ? (
              <Parameters
                parameters={options}
                defaultParameters={optionsSchema.defaults}
                jsonSchema={optionsSchema.schema as RJSFSchema}
                onParametersChange={setOptions}
                enableSearch={false}
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
          <div className='overflow-hidden rounded-lg border border-border/70 bg-card' aria-label='Machine mapping'>
            {submissionManifest ? (
              <Parameters
                parameters={advancedSubmissionValues(submission)}
                defaultParameters={advancedSubmissionValues(
                  submissionDefaults(provider, entry, { manifest, filamentColors }),
                )}
                jsonSchema={advancedSubmissionSchema}
                onParametersChange={(changed) =>
                  setSubmission({
                    ...Object.fromEntries(
                      Object.entries(submission).filter(([key]) => prepareSubmissionFields.has(key)),
                    ),
                    ...changed,
                  })
                }
                enableSearch={false}
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
    </PrintSection>
  );
}
