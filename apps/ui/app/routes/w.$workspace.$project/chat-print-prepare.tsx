import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { RJSFSchema } from '@rjsf/utils';
import { Check, Eye, LoaderCircle, Scissors, Send } from 'lucide-react';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { ParameterManifest } from '@taucad/parameters';
import type {
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryCursor,
  MachineDirectoryEntry,
  MachineManifest,
  MachineProvider,
  MachineRequestPrintInput,
} from '@taucad/runtime/machine';
import type { FileExtension } from '@taucad/types';
import { quantityKinds } from '@taucad/units/quantity';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { sha256Bytes } from '@taucad/utils/hash';
import { randomUuid } from '@taucad/utils/id';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionClient } from '#hooks/use-revision-status.js';
import { compileExportConfigurationManifest } from '#routes/w.$workspace.$project/chat-converter.js';
import {
  PrintDisclosure,
  PrintNotice,
  PrintSection,
  operator,
} from '#routes/w.$workspace.$project/chat-print-section.js';
import {
  StartConfirmationCard,
  describeStartConfirmations,
  startBlocker,
} from '#routes/w.$workspace.$project/chat-print-send.js';
import {
  fitsBuildVolume,
  formatDuration,
  formatFilament,
  formatQuantity,
  formatSize,
  materialSlotLabel,
  summarizeGcodeContainer,
} from '#routes/w.$workspace.$project/chat-print-summary.js';
import type { BuildVolumeFit, SliceSummary } from '#routes/w.$workspace.$project/chat-print-summary.js';
import { bestRouteForActiveKernel, exportWithRuntimeValidatedInput } from '#utils/export-formats.utils.js';

/** The export target every print goes through (blueprint D3). */
const gcodeContainerFormat: FileExtension = 'gcode.3mf';
const printUnits = { length: { displaySymbol: 'mm' } } as const;

/** A draft-7 schema and the defaults its owner declares. @public */
export type ResolvedSchema = Readonly<{ schema: JSONSchema7; defaults: Record<string, unknown> }>;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
  summary: SliceSummary;
  fit: BuildVolumeFit | undefined;
}>;

const schemaConstant = (schema: JSONSchema7 | boolean | undefined): unknown => {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  return schema.const ?? (Array.isArray(schema.enum) && schema.enum.length === 1 ? schema.enum[0] : undefined);
};

/**
 * The submission configuration a provider needs: the schema's own defaults,
 * then the provider's declared defaults, then what the machine reports and the
 * manifest declares. Only keys the provider's schema names are written, so a
 * provider without an AMS never receives a mapping.
 *
 * @param provider - The provider that owns the submission schema.
 * @param entry - The machine as observed.
 * @param manifest - The machine's manifest, when the provider carries one.
 * @returns The defaults the Advanced form and the request start from.
 * @public
 */
export const submissionDefaults = (
  provider: MachineProvider,
  entry: MachineDirectoryEntry,
  manifest: MachineManifest | undefined,
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
  // ponytail: named keys are the Bambu submission vocabulary; a second provider gets its own mapping here.
  if ('expectedBedType' in properties) {
    observed['expectedBedType'] = entry.snapshot.setup.bedType ?? manifest?.bed.plates[0]?.id;
  }
  if ('expectedMaterials' in properties && loaded?.materialId !== undefined) {
    observed['expectedMaterials'] = [{ slot: loaded.slot, materialId: loaded.materialId }];
  }
  if ('amsMapping' in properties && loaded) {
    observed['amsMapping'] = [loaded.slot];
  }
  if ('expectedNozzleDiameter' in properties && nozzle) {
    observed['expectedNozzleDiameter'] = {
      value: nozzle.diameter.value,
      unit: nozzle.diameter.unit,
      kind: quantityKinds.diameter,
      space: 'linear',
    };
  }
  if ('expectedFilamentDiameter' in properties && manifest) {
    observed['expectedFilamentDiameter'] = {
      value: manifest.toolhead.filamentDiameter.value,
      unit: manifest.toolhead.filamentDiameter.unit,
      kind: quantityKinds.diameter,
      space: 'linear',
    };
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
  optionsSchema: ResolvedSchema | undefined;
  options: Record<string, unknown>;
  setOptions: (options: Record<string, unknown>) => void;
  submissionSchema: ResolvedSchema | undefined;
  submission: Record<string, unknown>;
  setSubmission: (submission: Record<string, unknown>) => void;
  effectiveSubmission: Record<string, unknown>;
  slice: SlicedArtifact | undefined;
  isSliceStale: boolean;
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
 * @param input - The machine, its provider and the directory cursor the artifact is scoped to.
 * @returns The prepare state and its actions.
 * @public
 */
export const usePrintPrepare = ({
  client,
  entry,
  provider,
  manifest,
  cursor,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry | undefined;
  readonly provider: MachineProvider | undefined;
  readonly manifest: MachineManifest | undefined;
  readonly cursor: MachineDirectoryCursor | undefined;
}): PrintPrepare => {
  const { geometryUnits, mainEntryPath, editorRef } = useProject();
  const fileManager = useFileManager();
  const revisionClient = useRevisionClient();
  const [chosenEntryPath, setEntryPath] = useState<string>();
  const entryPath =
    chosenEntryPath !== undefined && geometryUnits.has(chosenEntryPath) ? chosenEntryPath : mainEntryPath;
  const entryPaths = useMemo(() => [...geometryUnits.keys()], [geometryUnits]);
  const actor = geometryUnits.get(entryPath);
  const kernelClient = useSelector(actor, (state) => state?.context.kernelClient);
  const activeKernelId = useSelector(actor, (state) => state?.context.activeKernelId);
  const capabilities = useSelector(actor, (state) => state?.context.capabilities);
  const hasGeometry = useSelector(actor, (state) => state?.context.geometry !== undefined);

  const route = useMemo(
    () =>
      kernelClient && activeKernelId && capabilities
        ? bestRouteForActiveKernel(kernelClient, gcodeContainerFormat, activeKernelId)
        : undefined,
    [activeKernelId, capabilities, kernelClient],
  );
  const optionsSchema = useMemo<ResolvedSchema | undefined>(
    () =>
      route && Object.keys(route.exportOptions.schema).length > 0
        ? {
            schema: route.exportOptions.schema,
            defaults: isRecordObject(route.exportOptions.defaults) ? route.exportOptions.defaults : {},
          }
        : undefined,
    [route],
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

  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [submission, setSubmission] = useState<Record<string, unknown>>({});
  const [slice, setSlice] = useState<SlicedArtifact>();
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceError, setSliceError] = useState<string>();
  const [isSending, setIsSending] = useState(false);
  const [isConfirmingSend, setIsConfirmingSend] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const requestIdRef = useRef<{ readonly digest: string; readonly requestId: string }>(undefined);
  const operationIdsRef = useRef(
    new Map<string, { readonly uploadOperationId: string; readonly startOperationId: string }>(),
  );

  const effectiveSubmission = useMemo(
    () => (provider && entry ? { ...submissionDefaults(provider, entry, manifest), ...submission } : submission),
    [entry, manifest, provider, submission],
  );
  const optionsKey = JSON.stringify(options);
  const isSliceStale = slice !== undefined && slice.optionsKey !== optionsKey;

  const sliceNow = useCallback(async (): Promise<void> => {
    if (!kernelClient || !route) {
      return;
    }
    setIsSlicing(true);
    setSliceError(undefined);
    try {
      const result = await exportWithRuntimeValidatedInput(kernelClient, route, { exportOptions: options });
      if (!result.success) {
        throw new Error(result.issues.map((issue) => issue.message).join('; ') || 'Slicing failed.');
      }
      const file = result.data[0];
      if (!file) {
        throw new Error('The slicer produced no file.');
      }
      const fileName = `${modelName(entryPath)}.gcode.3mf`;
      const path = `exports/${fileName}`;
      await fileManager.writeFiles({ [path]: { content: file.bytes } });
      const summary = summarizeGcodeContainer(file.bytes);
      // SAFETY: sha256Bytes returns the lowercase hex the digest brand describes.
      const digest = `sha256:${await sha256Bytes(file.bytes)}` as MachineArtifactReference['digest'];
      setSlice({
        path,
        fileName,
        digest,
        length: file.bytes.byteLength,
        mimeType: file.mimeType,
        optionsKey,
        summary,
        fit: manifest ? fitsBuildVolume(summary.bounds, manifest.geometry.buildVolume) : undefined,
      });
    } catch (error) {
      setSliceError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSlicing(false);
    }
  }, [entryPath, fileManager, kernelClient, manifest, options, optionsKey, route]);

  const openPreview = useCallback((): void => {
    if (slice) {
      editorRef.send({ type: 'openFile', path: slice.path, source: 'user' });
    }
  }, [editorRef, slice]);

  const sendBlocker = ((): string | undefined => {
    if (!entry || !provider || !cursor) {
      return 'Choose a machine first.';
    }
    if (!slice) {
      return 'Slice the model first.';
    }
    if (isSliceStale) {
      return 'The options changed since this slice. Slice again before sending.';
    }
    if (slice.fit && !slice.fit.fits) {
      return `The toolpath does not fit the plate: ${slice.fit.reason}.`;
    }
    return startBlocker(effectiveSubmission, entry, manifest);
  })();

  const send = useCallback(async (): Promise<void> => {
    if (!slice || !entry || !provider || !cursor || sendBlocker !== undefined) {
      return;
    }
    setIsSending(true);
    setSendError(undefined);
    try {
      if (!revisionClient) {
        throw new Error('Revisions are unavailable, so the artifact cannot be recorded before sending.');
      }
      await revisionClient.saveRevision('save');
      const headRevisionId = revisionClient.status()?.headRevisionId;
      if (headRevisionId === undefined) {
        throw new Error('No revision holds this artifact yet. Save a revision, then send again.');
      }
      const accepted =
        provider.accepts.find((container) => container.mediaType === slice.mimeType) ?? provider.accepts[0];
      if (!accepted) {
        throw new Error(`${provider.name} does not declare an accepted container.`);
      }
      const artifact: MachineArtifactReference = {
        revision: {
          authorityId: cursor.authorityId,
          workspaceId: cursor.workspaceId,
          // SAFETY: the revision store hands out its own branded ids as plain strings.
          revisionId: headRevisionId as MachineArtifactReference['revision']['revisionId'],
          // ponytail: the status projection exposes no tree digest; the artifact digest identifies the bytes the host verifies.
          treeDigest: slice.digest,
        },
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
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSending(false);
    }
  }, [client, cursor, effectiveSubmission, entry, provider, revisionClient, sendBlocker, slice]);

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
    optionsSchema,
    options,
    setOptions,
    submissionSchema,
    submission,
    setSubmission,
    effectiveSubmission,
    slice,
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
  onSelect,
}: {
  readonly presets: MachineManifest['slicing']['presets'];
  readonly options: Record<string, unknown>;
  readonly onSelect: (preset: MachineManifest['slicing']['presets'][number]) => void;
}): React.JSX.Element {
  const active = options['preset'] ?? options['layerHeight'];
  return (
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
    isSliceStale,
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
  const machineName = entry.descriptor.name;
  const { summary, fit } = slice;
  return (
    <div className='flex min-w-0 flex-col gap-2' aria-label='Slice result'>
      <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
        <dt className='text-muted-foreground'>File</dt>
        <dd className='truncate font-mono'>{slice.fileName}</dd>
        <dt className='text-muted-foreground'>Layers</dt>
        <dd className='tabular-nums'>{summary.layers}</dd>
        <dt className='text-muted-foreground'>Time</dt>
        <dd className='tabular-nums'>
          {formatDuration(summary.estimatedDuration)}
          {summary.coverageComplete ? '' : ' (known motion only)'}
        </dd>
        <dt className='text-muted-foreground'>Filament</dt>
        <dd className='tabular-nums'>{formatFilament(summary.filamentLength)}</dd>
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
          {formatSize(summary.bounds)} <span className='text-muted-foreground'>· every nozzle move</span>
        </dd>
      </dl>
      {fit === undefined ? null : fit.fits ? (
        <p className='flex items-center gap-1.5 text-xs'>
          <Check aria-hidden className='size-3.5 text-success' />
          The toolpath fits the plate
        </p>
      ) : (
        <PrintNotice tone='warning'>The toolpath does not fit the plate: {fit.reason}.</PrintNotice>
      )}
      {isSliceStale ? (
        <PrintNotice tone='neutral' role='status'>
          Options changed since this slice. Slice again to send the current settings.
        </PrintNotice>
      ) : null}
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
  onChange,
}: {
  readonly plates: MachineManifest['bed']['plates'];
  readonly selected: unknown;
  readonly onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}): React.JSX.Element | undefined {
  if (plates.length === 0) {
    return undefined;
  }
  return (
    <label className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
      Plate
      <select
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
    </label>
  );
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
    hasGeometry,
    route,
    optionsSchema,
    options,
    setOptions,
    submissionSchema,
    submission,
    setSubmission,
    effectiveSubmission,
    isSlicing,
    sliceError,
    sliceNow,
    slice,
  } = prepare;
  const providerKey = route
    ? route.transcoderId === undefined
      ? String(route.kernelId)
      : `${String(route.kernelId)}+${String(route.transcoderId)}`
    : undefined;
  const optionsManifest = useCompiledConfigurationManifest(providerKey, 'print/options', optionsSchema);
  const submissionManifest = useCompiledConfigurationManifest(provider?.id, 'print/submission', submissionSchema);
  const selectPreset = useCallback(
    (preset: MachineManifest['slicing']['presets'][number]) => {
      setOptions(applyPreset(options, preset, optionsSchema?.schema));
    },
    [options, optionsSchema, setOptions],
  );
  const selectMaterial = useCallback(
    (slot: number, materialId: string) => {
      setSubmission({ ...submission, expectedMaterials: [{ slot, materialId }], amsMapping: [slot] });
    },
    [setSubmission, submission],
  );
  const selectPlate = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setSubmission({ ...submission, expectedBedType: event.target.value });
    },
    [setSubmission, submission],
  );
  const plates = manifest?.bed.plates ?? [];
  const selectedPlate = effectiveSubmission['expectedBedType'];
  const modifiedCount = Object.keys(options).length + Object.keys(submission).length;

  return (
    <PrintSection title='Prepare'>
      <ModelSelect entryPath={entryPath} entryPaths={entryPaths} onChange={setEntryPath} />
      {manifest ? <PresetChips presets={manifest.slicing.presets} options={options} onSelect={selectPreset} /> : null}
      <MaterialChips entry={entry} manifest={manifest} submission={effectiveSubmission} onSelect={selectMaterial} />
      <PlateSelect plates={plates} selected={selectedPlate} onChange={selectPlate} />
      {route === undefined ? (
        <PrintNotice tone='neutral' role='status'>
          {hasGeometry ? 'Slicing is not available for this kernel yet.' : 'Render the model to enable slicing.'}
        </PrintNotice>
      ) : (
        <Button type='button' size='sm' className='self-start' disabled={isSlicing || !hasGeometry} onClick={sliceNow}>
          {isSlicing ? (
            <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
          ) : (
            <Scissors aria-hidden />
          )}
          {isSlicing ? 'Slicing…' : slice ? 'Slice again' : 'Slice and preview'}
        </Button>
      )}
      {sliceError ? <PrintNotice tone='destructive'>{sliceError}</PrintNotice> : null}
      <SliceResult prepare={prepare} entry={entry} manifest={manifest} />
      <PrintDisclosure title='Advanced' summary={modifiedCount > 0 ? `${String(modifiedCount)} changed` : 'Defaults'}>
        {optionsSchema ? (
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
                parameters={submission}
                defaultParameters={submissionDefaults(provider, entry, manifest)}
                jsonSchema={submissionSchema.schema as RJSFSchema}
                onParametersChange={setSubmission}
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
