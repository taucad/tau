/**
 * Fixtures for the Print pane tests: a Bambu-shaped provider, one machine, a
 * push-driven `MachineClient` and the project seams the pane reads. Nothing
 * here touches hardware; the simulated machine is the device.
 *
 * @module
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { Topic } from '@taucad/events';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { CapabilitiesManifest, ExportResult } from '@taucad/runtime';
import { createMockRuntimeDocument } from '@taucad/runtime-testing';
import type {
  ComponentObservation,
  MachineCheckJobInput,
  MachineClient,
  MachineDirectoryEntry,
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
  MachineJob,
  MachineProvider,
  MachineRun,
  MaterialSlotSnapshot,
} from '@taucad/runtime/machine';
import type { BambuPresetSummary, BambuStudioSelection, BambuStudioSettings } from '@taucad/slicer/bambu-studio';
import type { RJSFSchema } from '@rjsf/utils';
import type { ParameterManifest } from '@taucad/parameters';
import type * as ParametersModule from '#components/geometry/parameters/parameters.js';
import type * as ChatConverter from '#routes/w.$workspace.$project/chat-converter.js';
import { mergeFormDefaults } from '#components/geometry/parameters/rjsf-utils.js';
import { projectFiles } from '#components/print/testing/project-files.js';
import { formatDisplayLabel } from '#utils/string.utils.js';
import type { PendingAgentHostApproval } from '#components/chat/chat-approval-banner.js';
import type { DesktopBambuStudio } from '#filesystem/desktop-bridge.js';
import type { PendingMachineAction } from '#components/print/machine-action-approval.js';
import type { MachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import { fffProcessOf } from '@taucad/runtime/machine';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
import { observedTrays, toolheadOf } from '#components/print/machine-facts.js';
import {
  bambuContainer,
  fffComponents,
  known,
  machineEntry,
  machineSnapshot,
  providerFor,
  temperature,
  x1cManifest,
} from '#components/print/testing/machines.fixture.js';
import type { SlicedArtifact } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import type { SliceSummary } from '#components/printer/printer-summary.js';

export const timestamp = '2026-09-24T02:00:00.000Z';
export const later = '2026-09-24T02:00:05.000Z';

/** The open project's `tau.json` id, which every artifact the pane records carries (blueprint D5). */
export const projectId = 'proj_000000000000000000001';

export const mockEditorSend = vi.fn();
export const mockProjectSend = vi.fn();
/** Slice writes land in the shared project, so a second slice of the same bytes finds them there. */
export const mockWriteFiles = vi.fn(async (files: Readonly<Record<string, { content: Uint8Array<ArrayBuffer> }>>) => {
  for (const [path, { content }] of Object.entries(files)) {
    projectFiles.write(path, content);
  }
});
/** What a slice the slicer still made warns about; none unless a test says so. */
export const mockExport = vi.fn(
  async (): Promise<ExportResult> => ({
    success: true,
    exportId: 'gcode.3mf',
    evaluationId: 'mock-evaluation',
    files: [
      {
        name: 'main.gcode.3mf',
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        mimeType: 'application/vnd.bambulab.gcode-3mf',
      },
    ],
    issues: [],
  }),
);

const capabilities: CapabilitiesManifest = {
  routes: [
    {
      targetFormat: 'gcode.3mf',
      kernelId: 'replicad',
      sourceFormat: 'glb',
      fidelity: 'mesh',
      transcoderId: 'slicer',
      exportOptions: {
        schema: {
          type: 'object',
          properties: {
            preset: { type: 'string', enum: ['fast', 'standard', 'fine'], default: 'standard' },
            layerHeight: { type: 'number' },
          },
        },
        defaults: { preset: 'standard' },
      },
    },
  ],
} as unknown as CapabilitiesManifest;

/** The one slicing route the fixture kernel offers. */
export const gcodeRoute = capabilities.routes[0]!;

const kernelClient = {
  capabilities,
  bestRouteFor: (format: string) => capabilities.routes.find((route) => route.targetFormat === format),
};
const { document, rendering: initialRendering } = createMockRuntimeDocument();
const runtimeDocument = { ...document, export: mockExport };
let rendering = initialRendering;
const cadRenders = new Topic<void>({ name: 'chat-print-fixture.cad-renders' });
const cadSnapshot = (): { context: Record<string, unknown>; hasTag: () => boolean } => ({
  context: {
    kernelClient,
    activeKernelId: 'replicad',
    capabilities,
    rendering,
    document: runtimeDocument,
    entryPath: 'main.ts',
    latestRenderingOutcome: 'success',
    kernelIssues: new Map(),
  },
  hasTag: () => false,
});
let cadState = cadSnapshot();
const cadActor = {
  getSnapshot: () => cadState,
  subscribe: (observer: { next: () => void }) => ({
    unsubscribe: cadRenders.subscribe(() => {
      observer.next();
    }),
  }),
};
export const settledCadSnapshot = (): ReturnType<typeof cadActor.getSnapshot> => cadActor.getSnapshot();
export const failedCadSnapshot = (): ReturnType<typeof cadActor.getSnapshot> => ({
  ...cadSnapshot(),
  context: {
    ...cadState.context,
    latestRenderingOutcome: 'failure',
    kernelIssues: new Map([
      ['main.ts', [{ message: 'radius must be positive', code: 'RUNTIME', type: 'runtime', severity: 'error' }]],
    ]),
  },
});

/** The kernel renders the model again, as after an edit; `glb` is the model it renders, the placeholder by default. */
export const renderGeometry = (glb?: Uint8Array<ArrayBuffer>): void => {
  rendering = {
    ...initialRendering,
    ...(glb === undefined ? {} : { artifact: { mimeType: 'model/gltf-binary', content: glb } }),
    requestId: `${rendering.requestId}-next`,
  };
  cadState = cadSnapshot();
  cadRenders.emit();
};

type ProjectSeam = Readonly<{
  projectId: string;
  geometryUnits: Map<string, typeof cadActor>;
  viewRecords: ReadonlyMap<string, { entryPath: string }>;
  mainEntryPath: string;
  entriesRecord: { entries: Record<string, { renderTimeout?: number }> };
  editorRef: {
    send: typeof mockEditorSend;
    getSnapshot: () => {
      context: {
        unitSettings: Record<string, { operationTimeout?: number }>;
        viewSettings: Record<string, { entryPath: string }>;
      };
    };
    subscribe: () => { unsubscribe: () => void };
  };
  projectRef: {
    send: typeof mockProjectSend;
    getSnapshot: () => { context: { geometryUnits: Map<string, typeof cadActor> } };
    subscribe: () => { unsubscribe: () => void };
  };
}>;

const viewSettings: Record<string, { entryPath: string }> = {};
export const setRestoredPrintEntryPath = (entryPath: string | undefined): void => {
  if (entryPath) {
    viewSettings['parked'] = { entryPath };
  } else {
    delete viewSettings['parked'];
  }
};
const geometryUnits = new Map([['main.ts', cadActor]]);
const editorSnapshot = { context: { unitSettings: {}, viewSettings } };
const editorRef = {
  send: mockEditorSend,
  getSnapshot: () => editorSnapshot,
  subscribe: () => ({ unsubscribe: () => undefined }),
};
const projectSnapshot = { context: { geometryUnits } };
const projectRef = {
  send: mockProjectSend,
  getSnapshot: () => projectSnapshot,
  subscribe: () => ({ unsubscribe: () => undefined }),
};

/** What the pane reads from `useProject`. */
export const projectMock = {
  useProject: (): ProjectSeam => ({
    projectId,
    geometryUnits,
    viewRecords: new Map(Object.entries(viewSettings)),
    mainEntryPath: 'main.ts',
    entriesRecord: { entries: {} },
    editorRef,
    projectRef,
  }),
};

type ProjectFilesSeam = (typeof projectFiles)['fileManager'];

/** What the pane reads from `useFileManager`: the shared project its slices and print intent live in. */
export const fileManagerMock = {
  useFileManager: (): {
    writeFiles: typeof mockWriteFiles;
    exists: ProjectFilesSeam['parameterFiles']['exists'];
    readFile: ProjectFilesSeam['parameterFiles']['readFile'];
  } & ProjectFilesSeam => ({
    writeFiles: mockWriteFiles,
    exists: projectFiles.fileManager.parameterFiles.exists,
    readFile: projectFiles.fileManager.parameterFiles.readFile,
    ...projectFiles.fileManager,
  }),
};

/**
 * The converter the pane reads. Bambu Studio and machine submission settings compile for real so the
 * shared Parameters form exercises their schema; slicer options use `ParametersFake`.
 *
 * @param actual - The real module.
 * @returns The mocked module.
 */
export const converterMock = (actual: typeof ChatConverter): typeof ChatConverter => ({
  ...actual,
  async compileExportConfigurationManifest(provider, configuration, resolved) {
    if (provider === 'bambu-studio' || configuration === 'print/submission') {
      return actual.compileExportConfigurationManifest(provider, configuration, resolved);
    }
    const empty: unknown = {};
    // SAFETY: `ParametersFake` stands in wherever this empty manifest is used and never reads it.
    return { entryPath: 'print', manifest: empty as ParameterManifest };
  },
});

/** The summary read from the exported container; a test names its producer with `mockReturnValueOnce`. */
export const baseSliceSummary: SliceSummary = {
  layers: 125,
  estimatedDuration: 2520,
  isSlicerEstimate: false,
  producer: undefined,
  filamentLength: 3200,
  filamentWeightGrams: undefined,
  // Every move: from home along the front-edge purge line to the end lift above the part.
  bounds: { min: [0, 0, 0], max: [236, 153, 35] },
  partBounds: { min: [103, 103, 0], max: [153, 153, 25] },
  coverageComplete: true,
  filamentColors: [],
  previewRefusal: undefined,
};

/** The summary the slicer would read from the exported container. */
export const summarizeGcodeContainerMock = vi.fn((): SliceSummary => baseSliceSummary);

/** What Bambu Studio's own archive reads as: its producer and its header estimate. */
export const bambuStudioSliceSummary: SliceSummary = {
  ...baseSliceSummary,
  estimatedDuration: 1703,
  isSlicerEstimate: true,
  producer: { name: 'Bambu Studio', version: '02.08.02.61' },
};

/**
 * A stand-in for the shared Parameters renderer: shows the draft, offers a
 * slicer option, a machine option and one field reset, and shows each boolean
 * field as the real form does: a switch named "Toggle for <Label>" holding the
 * draft over the defaults.
 */
export function ParametersFake({
  parameters,
  defaultParameters,
  jsonSchema,
  onParametersChange,
}: {
  readonly parameters: Record<string, unknown>;
  readonly defaultParameters: Record<string, unknown>;
  readonly jsonSchema: RJSFSchema;
  readonly onParametersChange: (value: Record<string, unknown>) => void;
}): React.JSX.Element {
  const shown = mergeFormDefaults(jsonSchema, defaultParameters, parameters);
  const toggles = Object.entries(jsonSchema.properties ?? {}).filter(
    ([, property]) => typeof property === 'object' && property.type === 'boolean',
  );
  return (
    <div>
      <output data-testid='parameters'>{JSON.stringify(parameters)}</output>
      {toggles.map(([key]) => (
        <input
          key={key}
          type='checkbox'
          role='switch'
          aria-label={`Toggle for ${formatDisplayLabel(key)}`}
          aria-checked={shown[key] === true}
          checked={shown[key] === true}
          readOnly
        />
      ))}
      <button
        type='button'
        onClick={() => {
          onParametersChange({ ...parameters, layerHeight: 0.16 });
        }}
      >
        Set layer height
      </button>
      <button
        type='button'
        onClick={() => {
          onParametersChange({ ...parameters, nozzleDiameter: 0.6 });
        }}
      >
        Set nozzle diameter
      </button>
      <button
        type='button'
        onClick={() => {
          const { layerHeight: _layerHeight, ...rest } = parameters;
          onParametersChange(rest);
        }}
      >
        Reset layer height
      </button>
    </div>
  );
}

/**
 * What the pane reads from the Parameters module: the fake wherever the manifest is the converter
 * mock's empty one, and the real form for Bambu Studio's settings, whose manifest compiles.
 *
 * @param actual - The real module.
 * @returns The mocked module.
 */
export const parametersMock = (actual: typeof ParametersModule): typeof ParametersModule => ({
  ...actual,
  Parameters(properties) {
    return Object.keys(properties.parameterManifest).length === 0 ? (
      <ParametersFake
        parameters={properties.parameters}
        defaultParameters={properties.defaultParameters}
        jsonSchema={properties.jsonSchema ?? {}}
        onParametersChange={properties.onParametersChange}
      />
    ) : (
      <actual.Parameters {...properties} />
    );
  },
});

export const provider: MachineProvider = {
  ...providerFor('bambu', x1cManifest),
  name: 'Bambu LAN',
  /* As the Bambu provider declares it: the project's Bambu preferences live under this form's source id. */
  settingsConfiguration: bambuSettingsConfiguration.manifest,
};

/** The simulator: the same printer shape on a simulated transport, and it accepts files from any slicer (P3). */
export const simulatorProvider: MachineProvider = {
  ...provider,
  id: 'bambu-simulator',
  name: 'Bambu simulator',
  manifest: {
    ...x1cManifest,
    qualifications: x1cManifest.qualifications.map((profile) => ({ ...profile, environment: 'simulation' })),
  },
};

type Fields = Readonly<Record<string, MachineCheckJobInput['configuration']>>;

const isFields = (value: MachineCheckJobInput['configuration']): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The start form completed as the Bambu provider completes it: the machine's model and nozzle, the filament
 * diameter, the material in each mapped slot, Bambu Studio's start defaults; what the caller gave wins.
 *
 * @param machine - The machine as the directory reports it.
 * @param configuration - The partial form the pane sent.
 * @returns The completed form.
 */
const completeConfiguration = (
  machine: MachineDirectoryEntry | undefined,
  configuration: MachineCheckJobInput['configuration'],
): Fields => {
  const given = isFields(configuration) ? configuration : {};
  const mapping = Array.isArray(given['amsMapping'])
    ? given['amsMapping'].filter((slot): slot is number => typeof slot === 'number')
    : [];
  const trays = machine === undefined ? [] : observedTrays(machine);
  const nozzle = machine === undefined ? undefined : toolheadOf(machine.descriptor.capabilities)?.nozzles[0];
  const filament = machine === undefined ? undefined : fffProcessOf(machine.descriptor.capabilities)?.filamentDiameter;
  return {
    ...(machine === undefined ? {} : { expectedModel: machine.descriptor.model }),
    ...(nozzle === undefined ? {} : { expectedNozzleDiameter: nozzle.diameter.value }),
    ...(filament === undefined ? {} : { expectedFilamentDiameter: filament.value }),
    expectedMaterials: mapping.flatMap((slot) => {
      const materialId = trays.find((tray) => tray.slot === slot)?.materialId;
      return materialId === undefined ? [] : [{ slot, materialId }];
    }),
    bedLeveling: true,
    flowCalibration: true,
    timelapse: false,
    ...given,
  };
};

/** What the idle X1C reports: the shared FFF readings, with the textured PEI plate observed on the bed. */
const idleComponents = (): readonly ComponentObservation[] =>
  fffComponents().map((observation) =>
    observation.componentId === 'bed' && observation.knowledge === 'known' && observation.value.kind === 'readings'
      ? {
          ...observation,
          value: {
            ...observation.value,
            values: [...observation.value.values, { id: 'plate', label: 'Plate', value: 'textured-pei' }],
          },
        }
      : observation,
  );

/**
 * A machine as the directory reports it. The simulator by default, so the reference-engine
 * flow can send; a test of the real printer's refusal answers `checkJob` with its blocked producer check.
 */
export const entry = (overrides: Partial<MachineDirectoryEntry> = {}): MachineDirectoryEntry => {
  const base = machineEntry({ manifest: x1cManifest, snapshot: machineSnapshot(idleComponents()) });
  return {
    ...base,
    /* The device reports its own name and model; every surface shows the name the person gave it (blueprint D3). */
    descriptor: { ...base.descriptor, name: 'X1C-00M09A350100123', model: 'X1C' },
    ...overrides,
  };
};

/**
 * One component's observation replaced, the rest as observed.
 *
 * @param components - What the machine reports.
 * @param next - The replacement, matched by component id.
 * @returns The components.
 */
export const withComponent = (
  components: readonly ComponentObservation[],
  next: ComponentObservation,
): readonly ComponentObservation[] => [
  ...components.filter((observation) => observation.componentId !== next.componentId),
  next,
];

/**
 * The material slots replaced on an entry's material system, everything else as observed.
 *
 * @param current - The entry.
 * @param slots - The slots it now reports.
 * @returns The entry.
 */
export const withSlots = (
  current: MachineDirectoryEntry,
  slots: readonly MaterialSlotSnapshot[],
  inUse?: MaterialSlotSnapshot['slot'],
): MachineDirectoryEntry => {
  const system = current.snapshot.components.find((observation) => observation.componentId === 'filament');
  if (system?.knowledge !== 'known' || system.value.kind !== 'material-system') {
    return current;
  }
  const routes = inUse === undefined ? system.value.routes : [{ toolheadId: 'tool-0', current: inUse, target: null }];
  return {
    ...current,
    snapshot: {
      ...current.snapshot,
      components: withComponent(current.snapshot.components, { ...system, value: { ...system.value, slots, routes } }),
    },
  };
};

/**
 * A slot a person set: loaded with a material, editable.
 *
 * @param address - `unitId/slotId`, such as `ams-a/a2` or `external/spool`.
 * @param materialType - The material, such as `PETG`.
 * @param material - The colour and preset; black Bambu PLA by default.
 * @returns The slot.
 */
export const loadedSlot = (
  address: string,
  materialType: string,
  { color = '#000000FF', profileId = 'GFA01' }: Readonly<{ color?: string; profileId?: string }> = {},
): MaterialSlotSnapshot => {
  const [unitId = '', slotId = ''] = address.split('/');
  return {
    slot: { unitId, slotId },
    state: 'loaded',
    identifiedBy: 'person',
    material: {
      materialType,
      color,
      preset: { profileId, settingId: `${profileId}S` },
      calibration: { type: 'default' },
    },
    editing: { allowed: true, duringRun: false },
  };
};

/**
 * A slot with nothing in it.
 *
 * @param address - `unitId/slotId`.
 * @returns The slot.
 */
export const emptySlot = (address: string): MaterialSlotSnapshot => {
  const [unitId = '', slotId = ''] = address.split('/');
  return {
    slot: { unitId, slotId },
    state: 'empty',
    identifiedBy: 'unset',
    editing: { allowed: true, duringRun: false },
  };
};

/** A Tau run 42 layers into 125, nine minutes left, its heaters at their targets. */
export const printingRun = {
  runId: 'provider-run-1',
  origin: 'tau',
  delivery: 'stored',
  state: 'running',
  program: { name: 'pyramid.gcode.3mf' },
  progress: {
    basis: 'executed',
    fraction: 0.42,
    remaining: 540_000,
    counters: [{ id: 'layer', label: 'Layer', current: 42, total: 125 }],
  },
} as const satisfies MachineRun;

export const printing = (): MachineDirectoryEntry => {
  const idle = entry();
  let { components } = idle.snapshot;
  components = withComponent(
    components,
    known('tool-0', 'temperature', { kind: 'readings', values: [temperature('nozzle', 219.5, 220)] }),
  );
  components = withComponent(
    components,
    known('bed', 'temperature', {
      kind: 'readings',
      values: [temperature('bed', 55, 55), { id: 'plate', label: 'Plate', value: 'textured-pei' }],
    }),
  );
  components = withComponent(components, known('part-fan', 'accessories', { kind: 'level', ratio: 1 }));
  components = withComponent(components, known('chamber-light', 'accessories', { kind: 'switch', on: true }));
  return entry({
    snapshot: { ...idle.snapshot, state: { status: 'active' }, run: printingRun, components },
  });
};

const cursor = {
  hostId: 'host-1',
  authorityId: 'authority-1',
  generation: 'generation-1',
  position: 1,
  revision: 1,
};

/** A well-formed branded digest for fixtures: `sha256:` plus 64 hex characters of one fill. */
const digestOf = (fill: string): MachineJob['artifact']['digest'] =>
  // SAFETY: the brand names exactly this shape; fixtures never verify bytes.
  `sha256:${fill.repeat(64)}` as MachineJob['artifact']['digest'];

export const artifact: MachineJob['artifact'] = {
  projectId,
  path: `.tau/artifacts/${'b'.repeat(64)}/pyramid.gcode.3mf`,
  digest: digestOf('b'),
  length: 4,
  mediaType: bambuContainer.mediaType,
  contract: bambuContainer.contract,
  selectedMember: 'Metadata/plate_1.gcode',
};

/** The agent's requester. */
export const agent = { kind: 'agent', id: 'agent-1', label: 'Tau agent' } as const;

export const agentJob = (overrides: Partial<MachineJob> = {}): MachineJob => ({
  version: 1,
  jobId: 'job-agent-1',
  machineId: 'machine-1',
  artifact,
  configuration: {
    expectedBedType: 'textured-pei',
    expectedMaterials: [{ slot: 0, materialId: 'PLA' }],
    expectedNozzleDiameter: 0.4,
  },
  requestedBy: agent,
  program: {
    name: 'pyramid.gcode.3mf',
    estimatedDuration: 2_520_000,
    facts: { process: 'fff', layers: 125, filamentLength: 3200 },
  },
  checks: [],
  state: 'awaiting-approval',
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

/** A push channel: every `iterate` call drains its own queue until its signal aborts. */
const channel = <T,>() => {
  const topic = new Topic<T>({ name: 'print-fixture' });
  return {
    push(value: T): void {
      topic.emit(value);
    },
    iterate(signal?: AbortSignal): AsyncIterable<T> {
      const queue: T[] = [];
      const waiters: Array<(result: IteratorResult<T, undefined>) => void> = [];
      const unsubscribe = topic.subscribe(
        (value) => {
          const waiter = waiters.shift();
          if (waiter) {
            waiter({ value, done: false });
          } else {
            queue.push(value);
          }
        },
        { signal },
      );
      const finish = (): void => {
        unsubscribe();
        for (const waiter of waiters.splice(0)) {
          waiter({ value: undefined, done: true });
        }
      };
      signal?.addEventListener('abort', finish, { once: true });
      const next = async (): Promise<IteratorResult<T, undefined>> => {
        const value = queue.shift();
        if (value !== undefined) {
          return { value, done: false };
        }
        if (signal?.aborted) {
          return { value: undefined, done: true };
        }
        return new Promise((resolve) => {
          waiters.push(resolve);
        });
      };
      const stop = async (): Promise<IteratorResult<T, undefined>> => {
        finish();
        return { value: undefined, done: true };
      };
      return { [Symbol.asyncIterator]: () => ({ next, return: stop }) };
    },
  };
};

/** The push-driven client and the spies the tests read. */
export type PrintClientFixture = Readonly<{
  client: MachineClient;
  applyAction: Mock<MachineClient['applyAction']>;
  approveAction: Mock<MachineClient['approveAction']>;
  beginHold: Mock<MachineClient['beginHold']>;
  checkJob: Mock<MachineClient['checkJob']>;
  endHold: Mock<MachineClient['endHold']>;
  goStale: () => void;
  journal: (record: MachineJob) => void;
  observe: (next: MachineDirectoryEntry) => void;
  reconcileOperation: Mock<MachineClient['reconcileOperation']>;
  renewHold: Mock<MachineClient['renewHold']>;
  requestJob: Mock<MachineClient['requestJob']>;
  resolveJob: Mock<MachineClient['resolveJob']>;
  stop: Mock<MachineClient['stop']>;
  withdrawJob: Mock<MachineClient['withdrawJob']>;
}>;

/**
 * A `MachineClient` over one in-memory jobs journal. Approving a job journals it straight to `started`; the pane
 * never transfers or starts anything itself.
 *
 * @param input - The initial directory entries and jobs.
 * @returns The client, its spies and the telemetry pushers.
 */
export const createFixture = ({
  entries = [entry()],
  jobs = [],
}: {
  readonly entries?: readonly MachineDirectoryEntry[];
  readonly jobs?: readonly MachineJob[];
} = {}): PrintClientFixture => {
  const directory = channel<MachineDirectoryFrame>();
  const jobFrames = channel<MachineJob>();
  const records = new Map(jobs.map((job) => [job.jobId, job]));
  let snapshot: MachineDirectorySnapshot = { cursor, entries };
  const settle = (job: MachineJob): MachineJob => {
    records.set(job.jobId, job);
    jobFrames.push(job);
    return job;
  };
  const known = (jobId: string): MachineJob => {
    const current = records.get(jobId);
    if (!current) {
      throw new Error('MACHINE_JOB_UNKNOWN');
    }
    return current;
  };

  /* The host records the person's decision as given. */
  const approveAction = vi.fn<MachineClient['approveAction']>(async ({ decision, operationId }) =>
    decision === 'approve' ? { status: 'approved', operationId, expiresAt: later } : { status: 'denied', operationId },
  );
  /* Ready, with the form completed from what the machine reports, as the provider answers a job check. */
  const checkJob = vi.fn<MachineClient['checkJob']>(async (input) => ({
    status: 'ready',
    program: { name: input.artifact.path, facts: { process: 'other' } },
    checks: [],
    configuration: completeConfiguration(
      snapshot.entries.find((candidate) => candidate.machineId === input.machineId),
      input.configuration,
    ),
  }));
  const requestJob = vi.fn<MachineClient['requestJob']>(async (input) =>
    settle({
      version: 1,
      jobId: input.jobId,
      machineId: input.machineId,
      artifact: input.artifact,
      configuration: input.configuration,
      requestedBy: input.requestedBy,
      program: { name: input.artifact.path, facts: { process: 'other' }, ...input.program },
      checks: [],
      state: 'awaiting-approval',
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  const resolveJob = vi.fn<MachineClient['resolveJob']>(async (input) =>
    settle({
      ...known(input.jobId),
      state: input.decision === 'approve' ? 'started' : 'denied',
      resolvedBy: input.resolvedBy,
      ...(input.transferOperationId === undefined ? {} : { transferOperationId: input.transferOperationId }),
      ...(input.startOperationId === undefined ? {} : { startOperationId: input.startOperationId }),
      ...(input.attended === undefined ? {} : { attended: input.attended }),
      ...(input.attestations === undefined
        ? {}
        : { attestations: input.attestations.map((id) => ({ id, by: input.resolvedBy, at: later })) }),
      updatedAt: later,
    }),
  );
  const withdrawJob = vi.fn<MachineClient['withdrawJob']>(async (input) =>
    settle({ ...known(input.jobId), state: 'withdrawn', resolvedBy: input.resolvedBy, updatedAt: later }),
  );
  const reconcileOperation = vi.fn<MachineClient['reconcileOperation']>(async (input) => ({
    operationId: input.operationId,
    machineId: input.machineId,
    kind: 'start',
    inputDigest: digestOf('c'),
    state: 'accepted',
    updatedAt: later,
    receipt: {
      operationId: input.operationId,
      machineId: input.machineId,
      kind: 'start',
      status: 'accepted',
      runId: 'provider-run-9',
      observedAt: later,
    },
  }));
  const applyAction = vi.fn<MachineClient['applyAction']>(async (input) => ({
    operationId: input.operationId,
    machineId: input.machineId,
    kind: 'action',
    status: 'accepted',
    observedAt: later,
  }));
  const stop = vi.fn<MachineClient['stop']>(async (input) => ({
    operationId: input.operationId ?? 'stop-1',
    machineId: input.machineId,
    kind: 'stop',
    status: 'accepted',
    observedAt: later,
  }));
  const beginHold = vi.fn<MachineClient['beginHold']>(async () => ({ status: 'held', holdId: 'hold-1', lease: 100 }));
  const renewHold = vi.fn<MachineClient['renewHold']>(async () => ({ status: 'held' }));
  const endHold = vi.fn<MachineClient['endHold']>(async (input) => ({
    operationId: input.holdId,
    machineId: 'machine-1',
    kind: 'hold',
    status: 'accepted',
    observedAt: later,
  }));

  const client: MachineClient = {
    listProviders: async () => [provider, simulatorProvider],
    async *discover() {
      yield* [];
    },
    beginBinding: async () => ({ status: 'operator-action-required', ceremonyId: 'ceremony-1' }),
    removeBinding: async () => {
      throw new Error('not used');
    },
    captureStill: async () => {
      throw new Error('not used');
    },
    list: async () => snapshot,
    get: async ({ machineId }) => {
      const found = snapshot.entries.find((candidate) => candidate.machineId === machineId);
      if (!found) {
        throw new Error('MACHINE_UNKNOWN');
      }
      return found;
    },
    watch: ({ signal }) => directory.iterate(signal),
    approveAction,
    checkJob,
    requestJob,
    /* Filtered as the host filters: by machine, and by the project the artifact names when one is given. */
    listJobs: async ({ machineId, projectId: project }) =>
      [...records.values()].filter(
        (record) =>
          (machineId === undefined || record.machineId === machineId) &&
          (project === undefined || record.artifact.projectId === project),
      ),
    async *watchJobs({ projectId: project, signal }) {
      for await (const record of jobFrames.iterate(signal)) {
        if (project === undefined || record.artifact.projectId === project) {
          yield record;
        }
      }
    },
    resolveJob,
    withdrawJob,
    applyAction,
    stop,
    beginHold,
    renewHold,
    endHold,
    reconcileOperation,
    setTesting: async () => {
      throw new Error('not used');
    },
  };

  const observe = (next: MachineDirectoryEntry): void => {
    snapshot = {
      cursor: { ...cursor, position: cursor.position + 1, revision: cursor.revision + 1 },
      entries: [next, ...snapshot.entries.filter((candidate) => candidate.machineId !== next.machineId)],
    };
    directory.push({ type: 'snapshot', snapshot });
  };
  /* The host lost its sessions: each machine is listed again from its last observation, marked stale. */
  const goStale = (): void => {
    for (const current of snapshot.entries) {
      directory.push({
        type: 'event',
        cursor: { ...cursor, position: 9, revision: 9 },
        event: {
          type: 'machine-directory-upserted',
          hostId: 'host-1',
          authorityId: 'authority-1',
          revision: 9,
          entry: { ...current, freshness: 'stale' },
        },
      });
    }
  };

  return {
    client,
    applyAction,
    approveAction,
    beginHold,
    checkJob,
    endHold,
    goStale,
    journal: settle,
    observe,
    reconcileOperation,
    renewHold,
    requestJob,
    resolveJob,
    stop,
    withdrawJob,
  };
};

/**
 * A chat bridge with at most one job interrupt and any number of action interrupts pending.
 *
 * @param pending - The interrupt a paused job request waits on, if any.
 * @param actions - The machine actions paused agent calls wait on.
 * @returns The bridge and its spies.
 */
export const createBridge = (
  pending?: PendingAgentHostApproval,
  actions: readonly PendingMachineAction[] = [],
): Readonly<{
  bridge: MachineApprovalBridge;
  pendingForJob: Mock<MachineApprovalBridge['pendingForJob']>;
  respond: Mock<MachineApprovalBridge['respond']>;
}> => {
  const pendingForJob = vi.fn<MachineApprovalBridge['pendingForJob']>(() => pending);
  const respond = vi.fn<MachineApprovalBridge['respond']>(async () => undefined);
  const bridge: MachineApprovalBridge = { pendingForJob, pendingActions: () => actions, respond };
  return { bridge, pendingForJob, respond };
};

/** A slice already written for `main.ts`, for orientation tests that need one without exporting. */
export const sliceFixture: SlicedArtifact = {
  path: `.tau/artifacts/${'d'.repeat(64)}/main.gcode.3mf`,
  fileName: 'main.gcode.3mf',
  digest: digestOf('d'),
  length: 4,
  mimeType: bambuContainer.mediaType,
  optionsKey: '{}',
  rendering: undefined,
  materialConfiguration: {},
  summary: baseSliceSummary,
  fit: { fits: true, message: 'The part fits the plate' },
  warnings: [],
};

/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio setting keys and filament ids are fixed names. */

/** Bambu Studio's version on the fake desktop host. */
export const bambuStudioVersion = '02.08.02.61';

const x1c = 'Bambu Lab X1 Carbon 0.4 nozzle';
const processByPreset = {
  fast: '0.28mm Extra Draft @BBL X1C',
  standard: '0.20mm Standard @BBL X1C',
  fine: '0.12mm Fine @BBL X1C',
} as const;
const layerHeights: Readonly<Record<string, number>> = {
  [processByPreset.fast]: 0.28,
  [processByPreset.standard]: 0.2,
  [processByPreset.fine]: 0.12,
  '0.20mm Standard Gyroid PETG @BBL X1C': 0.2,
};
const filamentByProfile: Readonly<Record<string, string>> = {
  GFA01: 'Bambu PLA Matte @BBL X1C',
  GFG00: 'Bambu PETG Basic @BBL X1C',
};

/**
 * The settings Bambu Studio's presets resolve to, shaped as lane B's schema: scope → group → key.
 * Fine drops ironing, so an override of it no longer applies after switching to Fine.
 */
export const bambuSettingsFor = (
  selection: Pick<BambuStudioSelection, 'printer' | 'process' | 'filaments'>,
): BambuStudioSettings => {
  const hasIroning = selection.process !== processByPreset.fine;
  const nozzleTemperature = selection.filaments[0] === filamentByProfile['GFG00'] ? 255 : 220;
  const group = (title: string, properties: Record<string, JSONSchema7>): JSONSchema7 => ({
    type: 'object',
    title,
    properties,
  });
  // Lane B's annotations sit beside the draft-7 keywords, which the JSONSchema7 type does not list.
  const annotated = (schema: JSONSchema7, annotations: Record<string, unknown>): JSONSchema7 =>
    Object.assign(annotations, schema);
  return {
    schema: {
      type: 'object',
      properties: {
        process: {
          type: 'object',
          properties: {
            quality: group('Quality', {
              layer_height: annotated(
                { type: 'number', title: 'Layer height', description: 'Height of each printed layer.', minimum: 0.04 },
                { 'x-tau-unit': 'mm' },
              ),
              ...(hasIroning
                ? { ironing_speed: annotated({ type: 'number', title: 'Ironing speed' }, { 'x-tau-unit': 'mm/s' }) }
                : {}),
            }),
            strength: group('Strength', {
              wall_loops: { type: 'integer', title: 'Wall loops', minimum: 0 },
              sparse_infill_pattern: {
                type: 'string',
                title: 'Sparse infill pattern',
                oneOf: [
                  { const: 'grid', title: 'Grid' },
                  { const: 'gyroid', title: 'Gyroid' },
                ],
              },
            }),
            support: group('Support', { enable_support: { type: 'boolean', title: 'Enable support' } }),
            'process-all': group('All other settings', {
              bridge_flow: {
                type: ['number', 'string'],
                title: 'Bridge flow',
                pattern: '^-?(?:\\d+\\.?\\d*|\\.\\d+)%$',
              },
            }),
          },
        },
        filament: {
          type: 'object',
          properties: {
            'filament-temperatures': group('Temperatures', {
              nozzle_temperature: annotated({ type: 'integer', title: 'Nozzle temperature' }, { 'x-tau-unit': 'Cel' }),
            }),
          },
        },
      },
    },
    values: {
      process: {
        quality: { layer_height: layerHeights[selection.process] ?? 0.2, ...(hasIroning ? { ironing_speed: 30 } : {}) },
        strength: { wall_loops: 2, sparse_infill_pattern: 'grid' },
        support: { enable_support: false },
        'process-all': { bridge_flow: 1 },
      },
      filament: { 'filament-temperatures': { nozzle_temperature: nozzleTemperature } },
    },
    groups: [
      { id: 'quality', label: 'Quality', scope: 'process' },
      { id: 'strength', label: 'Strength', scope: 'process' },
      { id: 'support', label: 'Support', scope: 'process' },
      { id: 'process-all', label: 'All other settings', scope: 'process' },
      { id: 'filament-temperatures', label: 'Temperatures', scope: 'filament' },
    ],
  };
};

/* eslint-enable @typescript-eslint/naming-convention -- End of Bambu Studio keys. */

/** A fake desktop Bambu Studio: the X1C 0.4 catalog, selection by hints and the settings above. */
export type BambuStudioFake = Readonly<{
  [Key in keyof DesktopBambuStudio]: Mock<DesktopBambuStudio[Key]>;
}>;

/**
 * Create the fake Bambu Studio the desktop host would answer with.
 *
 * @param available - Whether Bambu Studio is installed.
 * @returns The fake, whose calls the tests read.
 */
export const createBambuStudio = (available = true): BambuStudioFake => ({
  status: vi.fn<DesktopBambuStudio['status']>(async () =>
    available
      ? { available: true, version: bambuStudioVersion, executable: '/Applications/BambuStudio.app' }
      : { available: false, reason: 'Bambu Studio is not installed.' },
  ),
  catalog: vi.fn<DesktopBambuStudio['catalog']>(async () => ({
    installation: {
      executable: '/Applications/BambuStudio.app',
      version: bambuStudioVersion,
      resourcesDir: '/Applications/BambuStudio.app/Contents/Resources',
    },
    printers: [
      { name: x1c, kind: 'machine', source: 'system', printerModel: 'Bambu Lab X1 Carbon', nozzleDiameter: 0.4 },
      { name: 'My X1C', kind: 'machine', source: 'user', printerModel: 'Bambu Lab X1 Carbon', nozzleDiameter: 0.4 },
    ],
    processes: [
      ...Object.values(processByPreset).map(
        (name): BambuPresetSummary => ({
          name,
          kind: 'process',
          source: 'system',
          layerHeight: layerHeights[name]!,
          compatiblePrinters: [x1c],
        }),
      ),
      { name: '0.20mm Standard Gyroid PETG @BBL X1C', kind: 'process', source: 'user', layerHeight: 0.2 },
      { name: '0.20mm Standard @BBL P1P', kind: 'process', source: 'system', compatiblePrinters: ['P1P'] },
    ],
    filaments: Object.entries(filamentByProfile).map(
      ([filamentId, name]): BambuPresetSummary => ({
        name,
        kind: 'filament',
        source: 'system',
        filamentId,
        compatiblePrinters: [x1c],
      }),
    ),
    plates: [
      { id: 'cool', bambuName: 'Cool Plate' },
      { id: 'textured-pei', bambuName: 'Textured PEI Plate' },
    ],
  })),
  resolveSelection: vi.fn<DesktopBambuStudio['resolveSelection']>(async ({ hints, partial }) => ({
    printer: partial?.printer ?? x1c,
    process: partial?.process ?? processByPreset[hints.preset ?? 'standard'],
    filaments:
      partial?.filaments ??
      hints.materials.map((material) => filamentByProfile[material.profileId ?? ''] ?? 'Generic PLA @BBL X1C'),
    plate: partial?.plate ?? hints.plate ?? 'textured-pei',
  })),
  settings: vi.fn<DesktopBambuStudio['settings']>(async (selection) => bambuSettingsFor(selection)),
});

/** The Bambu Studio the fake desktop bridge hands the pane; `undefined` is the web build. */
export const desktopHost: { bambuStudio: BambuStudioFake | undefined } = { bambuStudio: undefined };

/** What the pane reads from `#filesystem/desktop-bridge.js`. */
export const desktopBridgeMock = {
  desktopBridge: (): { slicers: { bambuStudio: BambuStudioFake } } | undefined =>
    desktopHost.bambuStudio === undefined ? undefined : { slicers: { bambuStudio: desktopHost.bambuStudio } },
};
