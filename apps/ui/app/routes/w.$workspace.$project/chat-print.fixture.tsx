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
import type { CapabilitiesManifest } from '@taucad/runtime';
import { defineConfiguration } from '@taucad/runtime/configuration';
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
import type { Quantity } from '@taucad/units/quantity';
import type { RJSFSchema } from '@rjsf/utils';
import { mergeFormDefaults } from '#components/geometry/parameters/rjsf-utils.js';
import { formatDisplayLabel } from '#utils/string.utils.js';
import type { PendingAgentHostApproval } from '#components/chat/chat-approval-banner.js';
import type { PrintApprovalBridge } from '#hooks/use-machines-approvals.js';
import type { SlicedArtifact } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import type { SliceSummary } from '#routes/w.$workspace.$project/chat-print-summary.js';

export const timestamp = '2026-09-24T02:00:00.000Z';
export const later = '2026-09-24T02:00:05.000Z';

export const mockEditorSend = vi.fn();
export const mockWriteFiles = vi.fn(async () => undefined);
export const mockSaveRevision = vi.fn(async () => undefined);
export const mockExport = vi.fn(async () => ({
  success: true,
  data: [
    {
      name: 'main.gcode.3mf',
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      mimeType: 'application/vnd.bambulab.gcode-3mf',
    },
  ],
  issues: [],
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
const cadActor = {
  getSnapshot: () => ({ context: { kernelClient, activeKernelId: 'replicad', capabilities, geometry: {} } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};

type ProjectSeam = Readonly<{
  projectId: string;
  geometryUnits: Map<string, typeof cadActor>;
  mainEntryPath: string;
  editorRef: { send: typeof mockEditorSend };
}>;

/** What the pane reads from `useProject`. */
export const projectMock = {
  useProject: (): ProjectSeam => ({
    projectId: 'project-1',
    geometryUnits: new Map([['main.ts', cadActor]]),
    mainEntryPath: 'main.ts',
    editorRef: { send: mockEditorSend },
  }),
};

export const fileManagerMock = {
  useFileManager: (): { writeFiles: typeof mockWriteFiles } => ({ writeFiles: mockWriteFiles }),
};

export const revisionMock = {
  useRevisionClient: (): { saveRevision: typeof mockSaveRevision; status: () => { headRevisionId: string } } => ({
    saveRevision: mockSaveRevision,
    status: () => ({ headRevisionId: 'revision-1' }),
  }),
};

export const converterMock = {
  compileExportConfigurationManifest: async (): Promise<{ entryPath: string; manifest: Record<string, never> }> => ({
    entryPath: 'print',
    manifest: {},
  }),
};

/** The summary the slicer would read from the exported container. */
export const summarizeGcodeContainerMock = (): SliceSummary => ({
  layers: 125,
  estimatedDuration: 2520,
  filamentLength: 3200,
  // Every move: from home along the front-edge purge line to the end lift above the part.
  bounds: { min: [0, 0, 0], max: [236, 153, 35] },
  partBounds: { min: [103, 103, 0], max: [153, 153, 25] },
  coverageComplete: true,
});

/** A quantity as the machine reports it; the pane reads only the value and the unit code. */
const observed = (value: number, code: string): Quantity => {
  const quantity: unknown = { value, unit: { code } };
  // SAFETY: fixtures never convert; only `value` and `unit.code` are read.
  return quantity as Quantity;
};

/**
 * A stand-in for the shared Parameters renderer: shows the draft, offers one
 * edit, and shows each boolean field as the real form does: a switch named
 * "Toggle for <Label>" holding the draft over the defaults.
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
    </div>
  );
}

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
  materialSystem: { units: 1, slotsPerUnit: 4, externalSpool: true, drying: true },
  camera: { stills: true, stream: false },
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
    expectedNozzleDiameter: z.object({ value: z.number(), unit: z.string() }).optional(),
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

export const entry = (overrides: Partial<MachineDirectoryEntry> = {}): MachineDirectoryEntry => ({
  machineId: 'machine-1',
  providerId: 'bambu',
  descriptor: {
    id: 'physical-1',
    name: 'Workshop X1C',
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
        { slot: 0, state: 'loaded', materialId: 'pla-black', color: 'black' },
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
  workspaceId: 'workspace-1',
  generation: 'generation-1',
  position: 1,
  revision: 1,
};

/** A well-formed branded digest for fixtures: `sha256:` plus 64 hex characters of one fill. */
const digestOf = (fill: string): PrintRequest['artifact']['digest'] =>
  // SAFETY: the brand names exactly this shape; fixtures never verify bytes.
  `sha256:${fill.repeat(64)}` as PrintRequest['artifact']['digest'];

export const artifact: PrintRequest['artifact'] = {
  revision: {
    authorityId: 'authority-1',
    workspaceId: 'workspace-1',
    revisionId: 'revision-1' as PrintRequest['artifact']['revision']['revisionId'],
    treeDigest: digestOf('a'),
  },
  path: 'exports/pyramid.gcode.3mf',
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
    expectedNozzleDiameter: { value: 0.4, unit: 'mm' },
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
    listProviders: async () => [provider],
    async *discover() {
      yield* [];
    },
    beginBinding: async () => ({ status: 'operator-action-required', ceremonyId: 'ceremony-1' }),
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
    listPrintRequests: async ({ machineId }) =>
      [...records.values()].filter((record) => machineId === undefined || record.machineId === machineId),
    watchPrintRequests: ({ signal }) => requestFrames.iterate(signal),
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
  const goStale = (): void => {
    directory.push({
      type: 'event',
      cursor: { ...cursor, position: 9, revision: 9 },
      event: {
        type: 'machine-directory-stale',
        hostId: 'host-1',
        authorityId: 'authority-1',
        workspaceId: 'workspace-1',
        revision: 9,
      },
    });
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
  path: 'exports/main.gcode.3mf',
  fileName: 'main.gcode.3mf',
  digest: digestOf('d'),
  length: 4,
  mimeType: accepted.mediaType,
  optionsKey: '{}',
  summary: summarizeGcodeContainerMock(),
  fit: { fits: true },
};
