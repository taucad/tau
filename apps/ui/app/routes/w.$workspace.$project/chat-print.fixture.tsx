/**
 * Fixtures for the Print pane tests: a Bambu-shaped provider, one machine, a
 * push-driven `MachineClient` and the project seams the pane reads. Nothing
 * here touches hardware; the simulated machine is the device.
 *
 * @module
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { z } from 'zod';
import { Topic } from '@taucad/events';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { CapabilitiesManifest, KernelIssue } from '@taucad/runtime';
import { defineConfiguration } from '@taucad/runtime/configuration';
import { quantity } from '@taucad/runtime/configuration/zod';
import { parseMachineManifest } from '@taucad/runtime/machine';
import type {
  MachineClient,
  MachineDirectoryEntry,
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
  MachineOperationReceipt,
  MachineProvider,
  PrintRequest,
} from '@taucad/runtime/machine';
import type { BambuPresetSummary, BambuStudioSelection, BambuStudioSettings } from '@taucad/slicer/bambu-studio';
import { quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import type { RJSFSchema } from '@rjsf/utils';
import type { ParameterManifest } from '@taucad/parameters';
import type * as ParametersModule from '#components/geometry/parameters/parameters.js';
import type * as ChatConverter from '#routes/w.$workspace.$project/chat-converter.js';
import { mergeFormDefaults } from '#components/geometry/parameters/rjsf-utils.js';
import { projectFiles } from '#components/print/testing/project-files.js';
import { formatDisplayLabel } from '#utils/string.utils.js';
import type { PendingAgentHostApproval } from '#components/chat/chat-approval-banner.js';
import type { DesktopBambuStudio } from '#filesystem/desktop-bridge.js';
import type { PrintApprovalBridge } from '#hooks/use-machines-approvals.js';
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
const noIssues: KernelIssue[] = [];
export const mockExport = vi.fn(async () => ({
  success: true,
  data: [
    {
      name: 'main.gcode.3mf',
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      mimeType: 'application/vnd.bambulab.gcode-3mf',
    },
  ],
  issues: noIssues,
}));

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
  export: mockExport,
};
const cadRenders = new Topic<void>({ name: 'chat-print-fixture.cad-renders' });
const cadSnapshot = (): { context: Record<string, unknown>; hasTag: () => boolean } => ({
  context: {
    kernelClient,
    activeKernelId: 'replicad',
    capabilities,
    geometry: {},
    entryPath: 'main.ts',
    latestGeometryOutcome: 'success',
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
    latestGeometryOutcome: 'failure',
    kernelIssues: new Map([
      ['main.ts', [{ message: 'radius must be positive', code: 'RUNTIME', type: 'runtime', severity: 'error' }]],
    ]),
  },
});

/** The kernel renders the model again: a new geometry, as after an edit. */
export const renderGeometry = (): void => {
  cadState = cadSnapshot();
  cadRenders.emit();
};

type ProjectSeam = Readonly<{
  projectId: string;
  geometryUnits: Map<string, typeof cadActor>;
  mainEntryPath: string;
  viewRecords: Record<string, { entryPath: string }>;
  entriesRecord: { entries: Record<string, { renderTimeout?: number }> };
  editorRef: {
    send: typeof mockEditorSend;
    getSnapshot: () => {
      context: {
        unitSettings: Record<string, { renderTimeout?: number }>;
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
    mainEntryPath: 'main.ts',
    viewRecords: viewSettings,
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

/** A quantity as the machine reports it; the pane reads only the value and the unit code. */
const observed = (value: number, code: string): Quantity => {
  const quantity: unknown = { value, unit: { code } };
  // SAFETY: fixtures never convert; only `value` and `unit.code` are read.
  return quantity as Quantity;
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

const millimetres = (value: number) => ({ value, unit: 'mm' });
const celsius = (value: number) => ({ value, unit: 'Cel' });
export const manifest = parseMachineManifest({
  version: 1,
  identity: { vendor: 'Bambu Lab', model: 'x1c', displayName: 'X1 Carbon', qualifiedFirmware: ['01.08.02.00'] },
  technology: 'additive.fff',
  geometry: {
    unit: 'mm',
    buildVolume: { x: 256, y: 256, z: 256 },
    enclosure: { outer: { x: 389, y: 389, z: 457 }, enclosed: true, doors: ['front'] },
    kinematics: 'corexy',
    bedMotion: 'z',
    origin: 'front-left',
    toolheadHome: { x: 1, y: 1, z: 256 },
    materialSystemMount: 'top',
  },
  toolhead: {
    filamentDiameter: millimetres(1.75),
    nozzles: [{ id: 'nozzle-0.4', diameter: millimetres(0.4), maximumTemperature: celsius(300), material: 'hardened' }],
  },
  bed: {
    maximumTemperature: celsius(120),
    plates: [
      { id: 'cool', label: 'Cool plate' },
      { id: 'textured-pei', label: 'Textured PEI plate' },
    ],
  },
  chamber: { enclosed: true, heated: false, light: true, fans: [{ id: 'part', label: 'Part cooling fan' }] },
  materialSystem: { units: 1, slotsPerUnit: 4, externalSpool: true, externalSpoolSlot: 254, drying: true },
  camera: { stills: true },
  storage: { removable: true },
  network: { lanMode: true, cloud: false },
  speedProfiles: [],
  actions: [
    { id: 'print.start', label: 'Start print', effect: 'print', qualification: 'qualified' },
    { id: 'run.pause', label: 'Pause', effect: 'print', qualification: 'qualified' },
    { id: 'run.urgent-stop', label: 'Urgent stop', effect: 'print', qualification: 'qualified' },
    { id: 'light.set', label: 'Chamber light', effect: 'none', qualification: 'designed' },
    { id: 'storage.format', label: 'Format storage', effect: 'storage', qualification: 'unsupported' },
  ],
  observations: [
    { group: 'run', label: 'Run', staleAfter: 15_000 },
    { group: 'thermal', label: 'Temperatures', staleAfter: 15_000 },
  ],
  slicing: {
    recommended: {
      layerHeight: millimetres(0.2),
      walls: 2,
      infillPercent: 15,
      nozzleTemperature: celsius(250),
      bedTemperature: celsius(70),
    },
    presets: [
      { id: 'fast', label: 'Fast', layerHeight: millimetres(0.28) },
      { id: 'standard', label: 'Standard', layerHeight: millimetres(0.2) },
      { id: 'fine', label: 'Fine', layerHeight: millimetres(0.12) },
    ],
  },
});

const bindingConfiguration = defineConfiguration({
  id: 'fixture.binding',
  version: '1',
  schema: z.object({ logicalId: z.string().min(1).max(64) }),
  ui: { version: 1, rjsf: {} },
});
const submissionConfiguration = defineConfiguration({
  id: 'fixture.submission',
  version: '1',
  schema: z.object({
    amsMapping: z.array(z.number().int()).default([]),
    // Mirrors `bambu.machine.submission` (packages/plugins/bambu/src/bambu.machine.ts): both flags default on,
    // and only the schema says so; apps/ui does not depend on @taucad/bambu.
    bedLeveling: z.boolean().default(true),
    flowCalibration: z.boolean().default(true),
    expectedBedType: z.string().min(1),
    expectedMaterials: z.array(z.object({ slot: z.number().int(), materialId: z.string() })).default([]),
    expectedFilamentDiameter: quantity({
      unit: 'mm',
      quantityKind: quantityKinds.diameter,
      space: 'linear',
    }).positive(),
    expectedNozzleDiameter: quantity({ unit: 'mm', quantityKind: quantityKinds.diameter, space: 'linear' }).positive(),
    expectedModel: z.literal('X1C'),
    timelapse: z.boolean().default(false),
  }),
  ui: { version: 1, rjsf: {} },
});
export const accepted = {
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  requiredMembers: ['Metadata/plate_1.gcode'],
  payloadSelection: 'plate',
  technology: 'additive.fff',
} as const;
export const provider: MachineProvider = {
  id: 'bambu',
  name: 'Bambu LAN',
  version: '1',
  protocolVersion: 1,
  vendor: 'Bambu Lab',
  technologies: ['additive.fff'],
  accepts: [accepted],
  manifest,
  bindingConfiguration: bindingConfiguration.manifest,
  submissionConfiguration: submissionConfiguration.manifest,
  queries: {},
};

/** The simulator: the same printer shape, and it accepts files from any slicer (blueprint P3). */
export const simulatorProvider: MachineProvider = { ...provider, id: 'bambu-simulator', name: 'Bambu simulator' };

/**
 * A machine as the directory reports it. The simulator by default, so the reference-engine
 * flow can send; the real printer (`providerId: 'bambu'`) takes only Bambu Studio archives.
 */
export const entry = (overrides: Partial<MachineDirectoryEntry> = {}): MachineDirectoryEntry => ({
  machineId: 'machine-1',
  /* The name the person gave it, which every surface shows (blueprint D3); the device reports its own. */
  name: 'Workshop X1C',
  providerId: 'bambu-simulator',
  descriptor: {
    id: 'physical-1',
    name: 'X1C-00M09A350100123',
    vendor: 'Bambu Lab',
    model: 'X1C',
    technology: 'additive.fff',
    firmware: '01.08.02.00',
    accepts: [accepted],
    operations: ['start', 'pause', 'resume', 'cancel', 'urgent-stop', 'still'],
    ratedEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
    printableEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
    tools: [],
    materialSystem: { kind: 'ams', slotCount: 4 },
    bedTypes: ['textured-pei'],
  },
  snapshot: {
    connection: 'connected',
    readiness: 'idle',
    observedAt: timestamp,
    setup: {
      toolId: '0.4mm',
      bedType: 'textured-pei',
      materials: [
        { slot: 0, state: 'loaded', materialId: 'pla-black', profileId: 'GFA01', color: 'black' },
        { slot: 1, state: 'empty' },
      ],
    },
    run: { state: 'idle' },
    temperatures: { nozzle: observed(28, 'Cel') },
  },
  freshness: 'current',
  ...overrides,
});

export const printing = (): MachineDirectoryEntry =>
  entry({
    snapshot: {
      ...entry().snapshot,
      readiness: 'busy',
      activeRunId: 'provider-run-1',
      run: {
        state: 'printing',
        progress: 42,
        remainingSeconds: 540,
        currentLayer: 42,
        totalLayers: 125,
        file: 'pyramid.gcode.3mf',
      },
      temperatures: {
        nozzle: observed(219.5, 'Cel'),
        nozzleTarget: observed(220, 'Cel'),
        bed: observed(55, 'Cel'),
        bedTarget: observed(55, 'Cel'),
      },
      fans: { part: 100 },
      lights: { chamber: 'on' },
      network: { wifiSignalDbm: -52 },
    },
  });

const cursor = {
  hostId: 'host-1',
  authorityId: 'authority-1',
  generation: 'generation-1',
  position: 1,
  revision: 1,
};

/** A well-formed branded digest for fixtures: `sha256:` plus 64 hex characters of one fill. */
const digestOf = (fill: string): PrintRequest['artifact']['digest'] =>
  // SAFETY: the brand names exactly this shape; fixtures never verify bytes.
  `sha256:${fill.repeat(64)}` as PrintRequest['artifact']['digest'];

export const artifact: PrintRequest['artifact'] = {
  projectId,
  path: `.tau/artifacts/${'b'.repeat(64)}/pyramid.gcode.3mf`,
  digest: digestOf('b'),
  length: 4,
  mediaType: accepted.mediaType,
  contract: accepted.contract,
  selectedMember: 'Metadata/plate_1.gcode',
};

export const agentRequest = (overrides: Partial<PrintRequest> = {}): PrintRequest => ({
  requestId: 'request-agent-1',
  machineId: 'machine-1',
  artifact,
  configuration: {
    expectedBedType: 'textured-pei',
    expectedMaterials: [{ slot: 0, materialId: 'pla-black' }],
    expectedNozzleDiameter: 0.4,
  },
  requestedBy: { kind: 'agent', id: 'agent-1', label: 'Tau agent' },
  summary: { fileName: 'pyramid.gcode.3mf', layers: 125, estimatedDuration: 2520, filamentLength: 3200 },
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
  controlRun: Mock<MachineClient['controlRun']>;
  goStale: () => void;
  journal: (record: PrintRequest) => void;
  observe: (next: MachineDirectoryEntry) => void;
  reconcileOperation: Mock<MachineClient['reconcileOperation']>;
  requestPrint: Mock<MachineClient['requestPrint']>;
  resolvePrintRequest: Mock<MachineClient['resolvePrintRequest']>;
  startPrint: Mock<MachineClient['startPrint']>;
  uploadPrint: Mock<MachineClient['uploadPrint']>;
  withdrawPrintRequest: Mock<MachineClient['withdrawPrintRequest']>;
}>;

/**
 * A `MachineClient` over one in-memory journal. Approving a request journals it
 * straight to `started`; the pane never uploads or starts anything itself.
 *
 * @param input - The initial directory entries and print requests.
 * @returns The client, its spies and the telemetry pushers.
 */
export const createFixture = ({
  entries = [entry()],
  requests = [],
}: {
  readonly entries?: readonly MachineDirectoryEntry[];
  readonly requests?: readonly PrintRequest[];
} = {}): PrintClientFixture => {
  const directory = channel<MachineDirectoryFrame>();
  const requestFrames = channel<PrintRequest>();
  const records = new Map(requests.map((request) => [request.requestId, request]));
  let snapshot: MachineDirectorySnapshot = { cursor, entries };

  const uploadPrint = vi.fn<MachineClient['uploadPrint']>(async () => {
    throw new Error('the pane never uploads');
  });
  const startPrint = vi.fn<MachineClient['startPrint']>(async () => {
    throw new Error('the pane never starts');
  });
  const requestPrint = vi.fn<MachineClient['requestPrint']>(async (input) => {
    const record: PrintRequest = {
      requestId: input.requestId,
      machineId: input.machineId,
      artifact: input.artifact,
      configuration: input.configuration,
      requestedBy: input.requestedBy,
      summary: input.summary ?? { fileName: input.artifact.path },
      state: 'awaiting-approval',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    records.set(record.requestId, record);
    requestFrames.push(record);
    return record;
  });
  const resolvePrintRequest = vi.fn<MachineClient['resolvePrintRequest']>(async (input) => {
    const current = records.get(input.requestId);
    if (!current) {
      throw new Error('MACHINE_PRINT_REQUEST_UNKNOWN');
    }
    const record: PrintRequest = {
      ...current,
      state: input.decision === 'approve' ? 'started' : 'denied',
      resolvedBy: input.resolvedBy,
      ...(input.uploadOperationId === undefined ? {} : { uploadOperationId: input.uploadOperationId }),
      ...(input.startOperationId === undefined ? {} : { startOperationId: input.startOperationId }),
      updatedAt: later,
    };
    records.set(record.requestId, record);
    requestFrames.push(record);
    return record;
  });
  const withdrawPrintRequest = vi.fn<MachineClient['withdrawPrintRequest']>(async (input) => {
    const current = records.get(input.requestId);
    if (!current) {
      throw new Error('MACHINE_PRINT_REQUEST_UNKNOWN');
    }
    const record: PrintRequest = { ...current, state: 'withdrawn', resolvedBy: input.resolvedBy, updatedAt: later };
    records.set(record.requestId, record);
    requestFrames.push(record);
    return record;
  });
  const reconcileOperation = vi.fn<MachineClient['reconcileOperation']>(async (input) => ({
    operationId: input.operationId,
    machineId: input.machineId,
    kind: 'start',
    inputDigest: digestOf('c'),
    status: 'accepted',
    updatedAt: later,
    receipt: {
      operationId: input.operationId,
      machineId: input.machineId,
      kind: 'start',
      status: 'accepted',
      providerRunId: 'provider-run-9',
      observedAt: later,
    },
  }));
  const controlRun = vi.fn<MachineClient['controlRun']>(
    async (input): Promise<MachineOperationReceipt> => ({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: input.command,
      status: 'accepted',
      providerRunId: input.expectedProviderRunId,
      observedAt: later,
    }),
  );

  const client: MachineClient = {
    listProviders: async () => [provider, simulatorProvider],
    async *discover() {
      yield* [];
    },
    beginBinding: async () => ({ status: 'operator-action-required', ceremonyId: 'ceremony-1' }),
    removeBinding: async () => {
      throw new Error('not used');
    },
    preparePrint: async () => {
      throw new Error('not used');
    },
    uploadPrint,
    startPrint,
    reconcileOperation,
    controlRun,
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
    requestPrint,
    /* Filtered as the host filters: by machine, and by the project the artifact names. */
    listPrintRequests: async ({ machineId, projectId: project }) =>
      [...records.values()].filter(
        (record) =>
          (machineId === undefined || record.machineId === machineId) &&
          (project === undefined || record.artifact.projectId === project),
      ),
    async *watchPrintRequests({ projectId: project, signal }) {
      for await (const record of requestFrames.iterate(signal)) {
        if (project === undefined || record.artifact.projectId === project) {
          yield record;
        }
      }
    },
    resolvePrintRequest,
    withdrawPrintRequest,
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
  const journal = (record: PrintRequest): void => {
    records.set(record.requestId, record);
    requestFrames.push(record);
  };

  return {
    client,
    controlRun,
    goStale,
    journal,
    observe,
    reconcileOperation,
    requestPrint,
    resolvePrintRequest,
    startPrint,
    uploadPrint,
    withdrawPrintRequest,
  };
};

/**
 * A chat bridge that either has one interrupt pending or none.
 *
 * @param pending - The interrupt a paused run is waiting on, if any.
 * @returns The bridge and its spies.
 */
export const createBridge = (
  pending?: PendingAgentHostApproval,
): Readonly<{
  bridge: PrintApprovalBridge;
  pendingFor: Mock<PrintApprovalBridge['pendingFor']>;
  respond: Mock<PrintApprovalBridge['respond']>;
}> => {
  const pendingFor = vi.fn<PrintApprovalBridge['pendingFor']>(() => pending);
  const respond = vi.fn<PrintApprovalBridge['respond']>(async () => undefined);
  const bridge: PrintApprovalBridge = { pendingFor, respond };
  return { bridge, pendingFor, respond };
};

/** A slice already written for `main.ts`, for orientation tests that need one without exporting. */
export const sliceFixture: SlicedArtifact = {
  path: `.tau/artifacts/${'d'.repeat(64)}/main.gcode.3mf`,
  fileName: 'main.gcode.3mf',
  digest: digestOf('d'),
  length: 4,
  mimeType: accepted.mediaType,
  optionsKey: '{}',
  geometry: {},
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
