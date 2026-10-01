import type { MachineTypeId, MachineSettingsService } from '@taucad/types';
import { MachineSettingsOwner } from '@taucad/runtime/host';
import { machineSettingsPath } from '@taucad/runtime/machine/settings';
import { slicingPreferences, slicingPreferencesSchema } from '@taucad/slicer/preferences';
import { bambuSettingsConfiguration, bambuMachine } from '@taucad/bambu';
/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio setting keys are its own wire vocabulary */
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createTauAgentHost } from '@taucad/agent-host';
import type { HostToolInvocation, InterruptResolution, JsonObject, JsonValue } from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';
import { ResourceQueue } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type {
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryEntry,
  MachineProvider,
  PrintRequest,
} from '@taucad/runtime/machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import { slicerOptionsSchema, slicerTranscoder } from '@taucad/slicer';
import { assertRootedPath } from '@taucad/utils/path';
import {
  getPrintProfilesOutputSchema,
  requestPrintInputSchema,
  requestPrintOptionKeys,
  requestPrintOutputSchema,
} from '@taucad/chat';
import { toolDescriptions, toolName } from '@taucad/chat/constants';
import { toRpcError } from '@taucad/chat/rpc';
import { toProviderToolJsonSchema } from '@taucad/chat/schemas';
import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';
import { createChatToolRegistry } from '#registry/tool-registry.js';
import { createMachineToolRegistry } from '#registry/machine-tool-registry.js';
import type { MachinePrintPlanner } from '#registry/machine-tool-registry.js';
import type { BambuStudioEngine } from '#registry/print-profiles.js';
import { placementOver, scriptedTransport } from '#registry/tau-host.fixture.js';
import type { ScriptedResponse } from '#registry/tau-host.fixture.js';
import { createRuntimeAgentClients } from '#runtime/runtime-agent-clients.js';
import type { RuntimeAgentClient } from '#runtime/runtime-agent-clients.js';

const timestamp = '2026-09-14T00:00:00.000Z';
// SAFETY: a well-formed sha256 literal for the branded digest a fixture reference carries.
const sha = (fill: string): MachineArtifactReference['digest'] =>
  `sha256:${fill.repeat(64)}` as MachineArtifactReference['digest'];

/** Every machine tool, in listing order; `request_print` needs a planner. */
const machineToolNames = [
  'discover_machines',
  'begin_machine_binding',
  'list_machines',
  'get_machine',
  'get_print_profiles',
  'request_print',
  'get_print_request',
  'list_print_requests',
  'cancel_print',
  'prepare_machine_print',
  'upload_machine_print',
  'reconcile_machine_operation',
  'control_machine_run',
  'capture_machine_still',
] as const;

const entry = (machineId: string, name: string): MachineDirectoryEntry =>
  ({
    machineId,
    providerId: 'bambu',
    descriptor: {
      id: `physical-${machineId}`,
      name,
      model: 'X1C',
      accepts: [
        {
          contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
          mediaType: 'application/vnd.bambulab.gcode-3mf',
          requiredMembers: ['Metadata/plate_1.gcode'],
          payloadSelection: 'plate',
          technology: 'additive.fff',
        },
      ],
    },
    snapshot: {
      connection: 'connected',
      readiness: 'idle',
      observedAt: timestamp,
      setup: { bedType: 'textured-pei', materials: [{ slot: 0, state: 'loaded', materialId: 'petg' }] },
    },
    freshness: 'current',
  }) as unknown as MachineDirectoryEntry;

/** The project the registry works in, as the host names it. */
const projectId = 'proj_000000000000000000001';

const textEncoder = new TextEncoder();

/**
 * The agent's own view of a project holding these files, composed as a host
 * composes it. The files are written through that view, as the agent edits them.
 */
const agentProject = async (files: Readonly<Record<string, string>>, filesystem = new MemoryProvider()) => {
  const view = composeView({ filesystem }, { consumer: 'agent', policy: tauPathPolicy });
  await Promise.all(
    Object.entries(files).map(async ([path, text]) => view.writeFile(assertRootedPath(path), textEncoder.encode(text))),
  );
  const mutations = new ResourceQueue();
  return (signal: AbortSignal) => createProviderRpcFileSystem({ provider: view, mutations, signal });
};

const settingsPath = machineSettingsPath({ typeId: 'bambu.x1c' });
const printerRecord = (preferences: Readonly<Record<string, unknown>>) => {
  const { plate, model: _model, ...values } = preferences;
  return {
    version: 1,
    typeId: 'bambu.x1c',
    activeProfile: 'default',
    profiles: {
      default: {
        name: 'Default',
        configurations: {
          [slicingPreferences.manifest.source.id]: {
            version: slicingPreferences.manifest.source.version,
            values,
          },
          ...(plate === undefined
            ? {}
            : {
                [bambuSettingsConfiguration.manifest.source.id]: {
                  version: bambuSettingsConfiguration.manifest.source.version,
                  values: { plate },
                },
              }),
        },
      },
    },
  };
};
const printerFile = (preferences: Readonly<Record<string, unknown>>) => ({
  [settingsPath]: JSON.stringify(printerRecord(preferences)),
});
const emptySettings: Pick<MachineSettingsService, 'readMachineSettings'> = {
  readMachineSettings: async () => ({ status: 'absent' }),
};
const agentSettings = async (files: Readonly<Record<string, string>>, filesystem = new MemoryProvider()) => {
  await agentProject(files, filesystem);
  const view = composeView({ filesystem }, { consumer: 'agent', policy: tauPathPolicy });
  const owner = new MachineSettingsOwner({
    filesystem: {
      readFileStream: (path, options) =>
        new ReadableStream({
          async start(controller) {
            try {
              const bytes = await view.readFile(path);
              controller.enqueue(bytes.slice(0, options?.length));
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        }),
      writeFileChecked: async () => {
        throw new Error('Read-only test owner');
      },
    },
    definitions: [slicingPreferences, bambuSettingsConfiguration],
  });
  return {
    readMachineSettings: async (typeId: MachineTypeId) => owner.read({ typeId }),
  };
};
const reportedProfile = {
  path: settingsPath,
  typeId: 'bambu.x1c',
  profileId: 'default',
  profileName: 'Default',
  configurationVersions: {
    [slicingPreferences.manifest.source.id]: slicingPreferences.manifest.source.version,
  },
};

const artifactFixture: MachineArtifactReference = {
  projectId,
  path: '.tau/artifacts/call-1__main.ts-gcode.3mf/pyramid.gcode.3mf',
  digest: sha('d'),
  length: 4096,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
};

const clientFixture = (input: { readonly entries?: readonly MachineDirectoryEntry[] } = {}) => {
  const entries = input.entries ?? [entry('machine-1', 'Workshop X1C')];
  const requests = new Map<string, PrintRequest>();
  const startPrint = vi.fn<MachineClient['startPrint']>(async () => {
    throw new Error('startPrint must never be reached from a tool');
  });
  const uploadPrint = vi.fn<MachineClient['uploadPrint']>(async () => {
    throw new Error('uploadPrint must never be reached before approval');
  });
  const requestPrint = vi.fn<MachineClient['requestPrint']>(async (request) => {
    const existing = requests.get(request.requestId);
    if (existing) {
      return existing;
    }
    const created: PrintRequest = {
      requestId: request.requestId,
      machineId: request.machineId,
      artifact: request.artifact,
      configuration: request.configuration,
      requestedBy: request.requestedBy,
      summary: request.summary ?? { fileName: 'unnamed' },
      state: 'awaiting-approval',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    requests.set(created.requestId, created);
    return created;
  });
  const resolvePrintRequest = vi.fn<MachineClient['resolvePrintRequest']>(async (input) => {
    const current = requests.get(input.requestId)!;
    const next: PrintRequest = {
      ...current,
      state: input.decision === 'approve' ? 'approved' : 'denied',
      resolvedBy: input.resolvedBy,
    };
    requests.set(next.requestId, next);
    return next;
  });
  const withdrawPrintRequest = vi.fn<MachineClient['withdrawPrintRequest']>(async (input) => {
    const current = requests.get(input.requestId)!;
    const next: PrintRequest = { ...current, state: 'withdrawn', resolvedBy: input.resolvedBy };
    requests.set(next.requestId, next);
    return next;
  });
  const controlRun = vi.fn<MachineClient['controlRun']>(async (input) => ({
    operationId: input.operationId,
    machineId: input.machineId,
    kind: input.command,
    status: 'accepted',
    providerRunId: input.expectedProviderRunId,
    observedAt: timestamp,
  }));
  const preparePrint = vi.fn<MachineClient['preparePrint']>(async (input) => ({
    preparedId: 'prepared-1',
    preparedDigest: sha('e'),
    configurationDigest: sha('e'),
    providerDataDigest: sha('e'),
    setupDigest: sha('e'),
    machineId: input.machineId,
    physicalMachineId: `physical-${input.machineId}`,
    artifact: input.artifact,
    remoteName: 'pyramid.gcode.3mf',
    parser: { id: 'bambu-gcode-3mf', version: '1' },
    preparedAt: timestamp,
    expiresAt: '2026-09-14T00:10:00.000Z',
  }));
  const captureStill = vi.fn<MachineClient['captureStill']>(async () => ({
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    mediaType: 'image/jpeg',
    capturedAt: timestamp,
    expiresAt: '2026-09-14T00:00:15.000Z',
  }));
  const client: MachineClient = {
    listProviders: async () => [bambuMachine()],
    async *discover() {
      yield {
        type: 'found',
        candidate: {
          id: 'candidate-1',
          name: 'Workshop X1C',
          endpoint: { address: '192.0.2.10', interface: 'en0' },
          claimedIdentity: { model: 'X1C' },
          observedAt: timestamp,
          expiresAt: '2026-09-14T00:01:00.000Z',
        },
      };
    },
    beginBinding: async () => ({ status: 'operator-action-required', ceremonyId: 'ceremony-1' }),
    removeBinding: async () => {
      throw new Error('not used');
    },
    preparePrint,
    uploadPrint,
    startPrint,
    reconcileOperation: async () => {
      throw new Error('not used');
    },
    controlRun,
    captureStill,
    list: async () => ({
      cursor: { hostId: 'host-1', authorityId: 'authority-1', generation: 'generation-1', position: 1, revision: 1 },
      entries,
    }),
    get: async () => {
      throw new Error('not used');
    },
    async *watch() {
      yield* [];
    },
    requestPrint,
    listPrintRequests: async ({ machineId }) =>
      [...requests.values()].filter((request) => machineId === undefined || request.machineId === machineId),
    async *watchPrintRequests() {
      yield* [];
    },
    resolvePrintRequest,
    withdrawPrintRequest,
  };
  return {
    client,
    requests,
    captureStill,
    controlRun,
    preparePrint,
    requestPrint,
    resolvePrintRequest,
    startPrint,
    uploadPrint,
    withdrawPrintRequest,
  };
};

const planPrint = vi.fn<MachinePrintPlanner>(async () => ({
  artifact: artifactFixture,
  configuration: { expectedBedType: 'textured-pei' },
  summary: { layers: 125, estimatedDuration: 3900, filamentLength: 2100 },
}));

const run = async (
  client: MachineClient,
  call: { readonly toolName: string; readonly input: JsonValue; readonly approve?: HostToolInvocation['approve'] },
) =>
  createMachineToolRegistry(client, { planPrint, projectId, machineSettings: emptySettings }).invoke({
    toolCallId: 'call-1',
    signal: new AbortController().signal,
    ...call,
  });

const invoke = async (client: MachineClient, toolName: string, input: JsonValue) => run(client, { toolName, input });

const approveWith = (outcome: InterruptResolution['outcome']) =>
  vi.fn<NonNullable<HostToolInvocation['approve']>>(async () => ({ interruptId: 'interrupt-1', outcome }));

describe('machine tool registry', () => {
  it('registers explicit tools only for the negotiated and granted facet', () => {
    const registry = (machines: Parameters<typeof createChatToolRegistry>[0]['machines']) =>
      createChatToolRegistry({
        fileSystemFor: () => {
          throw new Error('not used');
        },
        machines,
        testingEnabled: false,
      });
    for (const reason of ['unsupported', 'not-granted'] as const) {
      const names = registry({ available: false, reason })
        .list()
        .map(({ name }) => name);
      expect(names.filter((name) => machineToolNames.includes(name as (typeof machineToolNames)[number]))).toEqual([]);
    }
    const definitions = registry({ available: true, ...clientFixture().client })
      .list()
      .filter(({ name }) => machineToolNames.includes(name as (typeof machineToolNames)[number]));
    /* Without a print context the chat registry can neither slice nor name the
     * project an artifact belongs to, so `request_print` and
     * `prepare_machine_print` are withheld rather than offered-and-failing;
     * nothing offers a bare start. */
    expect(definitions.map(({ name }) => name)).toEqual(
      machineToolNames.filter((name) => name !== 'request_print' && name !== 'prepare_machine_print'),
    );
    expect(definitions.map(({ name }) => name)).not.toContain('start_machine_print');
    expect(JSON.stringify(definitions.map(({ inputSchema }) => inputSchema))).not.toMatch(
      /access.?code|certificate.?decision|host.?path|mqtt/iu,
    );
  });

  it('offers request_print only with a planner, prepare_machine_print only with a project, and keeps every description short', () => {
    const { client } = clientFixture();
    const withPlanner = createMachineToolRegistry(client, {
      planPrint,
      projectId,
      machineSettings: emptySettings,
    }).list();
    expect(withPlanner.map(({ name }) => name)).toEqual(machineToolNames);
    const bare = createMachineToolRegistry(client)
      .list()
      .map(({ name }) => name);
    expect(bare).not.toContain('request_print');
    expect(bare).not.toContain('prepare_machine_print');
    for (const definition of withPlanner) {
      expect(definition.description.split(/\s+/u).length).toBeLessThan(150);
    }
  });

  /* The CLI offers every machine tool, and a Tau turn offers the print tools:
   * each schema reaches Vertex and Anthropic as published, so none may carry
   * the ref loops or keywords they refuse. */
  it('should publish every definition without the JSON Schema keywords providers refuse', () => {
    const definitions = createMachineToolRegistry(clientFixture().client, { planPrint, projectId }).list();
    const serialized = JSON.stringify(definitions.map(({ inputSchema }) => inputSchema));

    expect(definitions.map(({ name }) => name)).toEqual(machineToolNames);

    for (const keyword of ['$schema', '$ref', 'definitions', '$defs', 'propertyNames', 'const', 'prefixItems']) {
      expect(serialized, keyword).not.toContain(`"${keyword}"`);
    }
    expect(definitions.find(({ name }) => name === toolName.requestPrint)).toEqual({
      name: toolName.requestPrint,
      description: toolDescriptions[toolName.requestPrint],
      inputSchema: toProviderToolJsonSchema(requestPrintInputSchema),
    });
  });

  /* The file's reference options and the tool's are one list, owned twice: `@taucad/slicer` cannot import `@taucad/chat`. */
  it("should accept exactly the reference options a project's print intent may hold", () => {
    expect(Object.keys(slicingPreferencesSchema.shape.options.unwrap().shape).toSorted()).toEqual(
      [...requestPrintOptionKeys].toSorted(),
    );
  });

  it('should read the only bound machine without an id, and name every bound machine when there are several', async () => {
    await expect(invoke(clientFixture().client, 'get_machine', {})).resolves.toMatchObject({
      isError: false,
      content: { machineId: 'machine-1', descriptor: { name: 'Workshop X1C' } },
    });
    const two = clientFixture({ entries: [entry('machine-1', 'Workshop X1C'), entry('machine-2', 'Bench X1C')] });
    await expect(invoke(two.client, 'get_machine', {})).resolves.toEqual({
      isError: true,
      content: {
        errorCode: 'MACHINE_TOOL_ERROR',
        message:
          'Several machines are bound; pass machineId. Bound machines: machine-1 (Workshop X1C), machine-2 (Bench X1C).',
      },
    });
  });

  it('should name every bound machine for an unknown id, and read a blank id as omitted', async () => {
    const two = clientFixture({ entries: [entry('machine-1', 'Workshop X1C'), entry('machine-2', 'Bench X1C')] });
    await expect(invoke(two.client, 'get_machine', { machineId: 'unknown' })).resolves.toEqual({
      isError: true,
      content: {
        errorCode: 'MACHINE_TOOL_ERROR',
        message: 'No machine unknown is bound. Bound machines: machine-1 (Workshop X1C), machine-2 (Bench X1C).',
      },
    });
    await expect(invoke(two.client, 'get_machine', { machineId: 'machine-2' })).resolves.toMatchObject({
      isError: false,
      content: { machineId: 'machine-2', descriptor: { name: 'Bench X1C' } },
    });
    // Models fill an optional field with a blank instead of omitting it.
    await expect(invoke(clientFixture().client, 'get_machine', { machineId: ' ' })).resolves.toMatchObject({
      isError: false,
      content: { machineId: 'machine-1' },
    });
  });

  it('collects bounded discovery and captures a still without touching run state', async () => {
    const { captureStill, client } = clientFixture();
    await expect(
      invoke(client, 'discover_machines', {
        providerId: 'bambu',
        configuration: { logicalId: 'workshop-x1c' },
      }),
    ).resolves.toMatchObject({
      isError: false,
      content: { events: [{ type: 'found', candidate: { claimedIdentity: { model: 'X1C' } } }] },
    });
    await expect(invoke(client, 'capture_machine_still', { machineId: 'machine-1' })).resolves.toMatchObject({
      isError: false,
      content: {
        machineId: 'machine-1',
        capturedAt: timestamp,
        expiresAt: '2026-09-14T00:00:15.000Z',
        byteLength: 4,
        images: [{ view: 'machine-1', dataUrl: 'data:image/jpeg;base64,/9j/2Q==' }],
      },
    });
    expect(captureStill).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'machine-1' }));
  });

  describe('request_print', () => {
    it('opens one request, pauses on the approval, and resolves it when the person accepts', async () => {
      const fixture = clientFixture();
      const approve = approveWith('approved');
      planPrint.mockClear();

      const result = await run(fixture.client, {
        toolName: 'request_print',
        input: { targetFile: 'main.ts', preset: 'fine' },
        approve,
      });

      expect(planPrint).toHaveBeenCalledTimes(1);
      expect(planPrint.mock.calls[0]![0]).toMatchObject({
        toolCallId: 'call-1',
        targetFile: 'main.ts',
        preset: 'fine',
        machine: { machineId: 'machine-1' },
      });
      expect(fixture.requestPrint).toHaveBeenCalledTimes(1);
      expect(fixture.requestPrint.mock.calls[0]![0]).toMatchObject({
        requestId: 'call-1',
        machineId: 'machine-1',
        artifact: artifactFixture,
        configuration: { expectedBedType: 'textured-pei' },
        requestedBy: { kind: 'agent', id: 'tau' },
        summary: { fileName: 'pyramid.gcode.3mf', layers: 125, estimatedDuration: 3900, filamentLength: 2100 },
      });
      expect(approve).toHaveBeenCalledTimes(1);
      expect(approve).toHaveBeenCalledWith({
        key: 'print:machine-1:main.ts',
        prompt: 'Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 1 h 5 min.',
        payload: {
          kind: 'print-request',
          requestId: 'call-1',
          machineId: 'machine-1',
          fileName: 'pyramid.gcode.3mf',
          artifactDigest: artifactFixture.digest,
        },
      });
      expect(fixture.resolvePrintRequest).toHaveBeenCalledTimes(1);
      expect(fixture.resolvePrintRequest.mock.calls[0]![0]).toMatchObject({
        requestId: 'call-1',
        decision: 'approve',
        resolvedBy: { kind: 'user' },
      });
      expect(fixture.withdrawPrintRequest).not.toHaveBeenCalled();
      expect(fixture.startPrint).not.toHaveBeenCalled();
      expect(fixture.uploadPrint).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        isError: false,
        content: {
          approval: 'approved',
          machineName: 'Workshop X1C',
          request: { requestId: 'call-1', state: 'approved' },
        },
      });
    });

    /* D5 under a Tau host: asking paused the run; its next attempt settles the request the person approved. A denial
     * ends the run, so no attempt recalls one: the host hands it to `answerApproval` instead (below). */
    it('should settle the request asked in an earlier attempt when the person approved it', async () => {
      const fixture = clientFixture();
      await run(fixture.client, { toolName: 'request_print', input: { targetFile: 'main.ts' } });
      planPrint.mockClear();
      fixture.requestPrint.mockClear();
      const approve = Object.assign(
        vi.fn<NonNullable<HostToolInvocation['approve']>>(async () => {
          throw new Error('not asked again');
        }),
        {
          recall: vi.fn(async (key: string) =>
            key === 'print:machine-1:main.ts'
              ? {
                  payload: { kind: 'print-request', requestId: 'call-1' },
                  resolution: { interruptId: 'i-1', outcome: 'approved' },
                }
              : undefined,
          ),
        },
      );

      const result = await run(fixture.client, {
        toolName: 'request_print',
        input: { targetFile: 'main.ts' },
        approve,
      });

      expect(approve).not.toHaveBeenCalled();
      expect(planPrint).not.toHaveBeenCalled();
      expect(fixture.requestPrint).not.toHaveBeenCalled();
      expect(fixture.resolvePrintRequest.mock.calls[0]![0]).toMatchObject({ requestId: 'call-1', decision: 'approve' });
      expect(result).toMatchObject({
        isError: false,
        content: { approval: 'approved', request: { requestId: 'call-1' } },
      });
    });

    it('should hand the planner the Bambu Studio profiles and settings the agent chose', async () => {
      planPrint.mockClear();
      await invoke(clientFixture().client, 'request_print', {
        targetFile: 'main.ts',
        profiles: { process: '0.12mm Fine @BBL X1C', filaments: ['Bambu PETG Basic @BBL X1C'] },
        settings: { sparse_infill_density: '20%', enable_support: true },
      });
      expect(planPrint).toHaveBeenCalledWith(
        expect.objectContaining({
          profiles: { process: '0.12mm Fine @BBL X1C', filaments: ['Bambu PETG Basic @BBL X1C'] },
          settings: { sparse_infill_density: '20%', enable_support: true },
        }),
      );
    });

    it("should read the project's print intent through the agent's view and hand it to the planner", async () => {
      planPrint.mockClear();
      const machineSettings = await agentSettings(printerFile({ preset: 'fine' }));
      await createMachineToolRegistry(clientFixture().client, { planPrint, projectId, machineSettings }).invoke({
        toolCallId: 'call-1',
        toolName: 'request_print',
        input: { targetFile: 'main.ts' },
        signal: new AbortController().signal,
      });
      expect(planPrint.mock.calls[0]![0].preferences).toEqual({
        status: 'current',
        preferences: { preset: 'fine' },
        machine: {},
        record: printerRecord({ preset: 'fine' }),
        profileId: 'default',
      });

      /* No file in the project, or no project filesystem wired: nothing to apply. */
      await createMachineToolRegistry(clientFixture().client, {
        planPrint,
        projectId,
        machineSettings: await agentSettings({}),
      }).invoke({
        toolCallId: 'call-2',
        toolName: 'request_print',
        input: { targetFile: 'main.ts' },
        signal: new AbortController().signal,
      });
      await invoke(clientFixture().client, 'request_print', { targetFile: 'main.ts' });
      expect(planPrint.mock.calls.slice(1).map(([call]) => call.preferences)).toEqual([undefined, undefined]);
    });

    it.each(['approved', 'denied', 'cancelled'] as const)(
      'should pass on what the print intent contributed when the answer is %s',
      async (outcome) => {
        const machinePreferences = {
          ...reportedProfile,
          ignored: "It is for model X1C, not this printer's x1c, so none of its values apply.",
        };
        planPrint.mockResolvedValueOnce({
          artifact: artifactFixture,
          configuration: { expectedBedType: 'textured-pei' },
          machinePreferences,
        });
        const result = await run(clientFixture().client, {
          toolName: 'request_print',
          input: { targetFile: 'main.ts' },
          approve: approveWith(outcome),
        });
        expect(result).toMatchObject({ isError: false, content: { approval: outcome, machinePreferences } });
      },
    );

    it('should pass on what the slice could not honour, in the kernel issue shape', async () => {
      const warnings = [
        {
          message: "The printer loads at most 4 filaments, so the model's 5 colours print as one, in #FF0000.",
          code: 'REPRESENTATION_UNSUPPORTED',
          type: 'runtime',
          severity: 'warning',
          details: { operation: 'transcode', engine: 'bambu-studio', colors: ['#FF0000', '#00FF00'] },
        },
      ] as const;
      planPrint.mockResolvedValueOnce({
        artifact: artifactFixture,
        configuration: { expectedBedType: 'textured-pei' },
        warnings,
      });
      const result = await run(clientFixture().client, {
        toolName: 'request_print',
        input: { targetFile: 'main.ts' },
        approve: approveWith('approved'),
      });
      expect(requestPrintOutputSchema.parse(result.content).warnings).toEqual(warnings);
    });

    it('should say a very short print takes under a minute, without "about"', async () => {
      const approve = approveWith('approved');
      planPrint.mockResolvedValueOnce({
        artifact: artifactFixture,
        configuration: { expectedBedType: 'textured-pei' },
        summary: { layers: 3, estimatedDuration: 20, filamentLength: 40 },
      });

      await run(clientFixture().client, { toolName: 'request_print', input: { targetFile: 'main.ts' }, approve });

      expect(approve).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Print pyramid.gcode.3mf on Workshop X1C? 3 layers, under a minute.' }),
      );
    });

    it('returns the request awaiting approval with a next step under a host without interrupts', async () => {
      const fixture = clientFixture();
      const result = await invoke(fixture.client, 'request_print', { targetFile: 'main.ts' });
      expect(fixture.requestPrint.mock.calls[0]![0]).toMatchObject({
        requestedBy: { kind: 'agent', id: 'external-agent' },
      });
      expect(fixture.resolvePrintRequest).not.toHaveBeenCalled();
      expect(fixture.withdrawPrintRequest).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        isError: false,
        content: {
          request: { requestId: 'call-1', state: 'awaiting-approval' },
          nextStep:
            "Waiting for a person to accept print request call-1 in Tau's Print pane; accepting uploads the file and starts the print. Do not retry; call get_print_request to observe it.",
        },
      });
      expect(result.content).not.toHaveProperty('approval');
    });

    it('names the bound machines when the choice is missing, ambiguous or unknown', async () => {
      const none = clientFixture({ entries: [] });
      await expect(invoke(none.client, 'request_print', { targetFile: 'main.ts' })).resolves.toMatchObject({
        isError: true,
        content: {
          errorCode: 'MACHINE_TOOL_ERROR',
          message: 'No machine is bound on this computer; the person binds one in the Print pane.',
        },
      });
      const two = clientFixture({ entries: [entry('machine-1', 'Workshop X1C'), entry('machine-2', 'Bench X1C')] });
      await expect(invoke(two.client, 'request_print', { targetFile: 'main.ts' })).resolves.toMatchObject({
        isError: true,
        content: {
          message:
            'Several machines are bound; pass machineId. Bound machines: machine-1 (Workshop X1C), machine-2 (Bench X1C).',
        },
      });
      await expect(
        invoke(two.client, 'request_print', { targetFile: 'main.ts', machineId: 'machine-9' }),
      ).resolves.toMatchObject({
        isError: true,
        content: {
          message: 'No machine machine-9 is bound. Bound machines: machine-1 (Workshop X1C), machine-2 (Bench X1C).',
        },
      });
      expect(none.requestPrint).not.toHaveBeenCalled();
      expect(two.requestPrint).not.toHaveBeenCalled();
    });
  });

  /* The start outcome in words: the agent reports what nextStep says, never an unconfirmed start as "submitted". */
  /* D5 through the host (GM.r1 H2): the chat's answer settles the ledger's request whether or not the run continues,
   * so the Print pane never offers a request the person already answered. */
  describe('request_print under a Tau agent host', () => {
    let directory: string | undefined;
    afterEach(async () => {
      if (directory !== undefined) {
        await rm(directory, { recursive: true, force: true });
        directory = undefined;
      }
    });

    const printCall = { id: 'call-print', name: 'request_print', input: { targetFile: 'main.ts' } };
    const pausedOnPrint = async (continued: readonly ScriptedResponse[] = [{ text: 'The print is on its way.' }]) => {
      directory = await mkdtemp(join(tmpdir(), 'tau-request-print-'));
      const logPath = join(directory, 'events.jsonl');
      const fixture = clientFixture();
      const registry = createMachineToolRegistry(fixture.client, {
        planPrint,
        projectId,
        machineSettings: emptySettings,
      });
      const transport = scriptedTransport([{ toolCalls: [printCall] }, ...continued]);
      let tick = 0;
      let id = 0;
      const host = createTauAgentHost({
        systemPrompt: 'You are the print fixture.',
        model: { id: 'scripted-print-model', contextWindow: 200_000 },
        modelTransport: transport,
        toolRegistry: registry,
        placement: placementOver(registry),
        openEventLog: async () => createNodeEventLog({ filePath: logPath, access: 'write' }),
        createId: () => `print-${String(id++)}`,
        createLeaderEpoch: () => `epoch-${String(id++)}`,
        now: () => new Date(Date.UTC(2026, 8, 28, 0, 0, tick++)),
      });
      await host.admit({
        chatId: 'chat-print',
        runId: 'run-print',
        trigger: 'submit',
        message: { id: 'turn-print', role: 'user', content: 'Print the pyramid.' },
      });
      const [pending] = await host.pendingInterrupts('run-print');
      expect(fixture.requests.get('call-print')?.state).toBe('awaiting-approval');
      return { fixture, host, transport, interruptId: pending!.interruptId };
    };

    it('should deny the request in the ledger, not withdraw it, when the person declines in chat', async () => {
      const { fixture, host, interruptId } = await pausedOnPrint();

      await host.resolveInterrupt({ runId: 'run-print', interruptId, outcome: 'denied' });

      await vi.waitFor(() => {
        expect(fixture.requests.get('call-print')?.state).toBe('denied');
      });
      /* No signal: a denial must land even while the run is being cancelled. */
      expect(fixture.resolvePrintRequest.mock.calls).toEqual([
        [
          {
            requestId: 'call-print',
            decision: 'deny',
            resolvedBy: { kind: 'user', id: 'chat', label: 'Declined in chat' },
          },
        ],
      ]);
      expect(fixture.withdrawPrintRequest).not.toHaveBeenCalled();
      expect(fixture.uploadPrint).not.toHaveBeenCalled();
      await host.close();
    });

    it('should withdraw the request when its paused run is cancelled before anyone answers', async () => {
      const { fixture, host } = await pausedOnPrint();

      await host.cancel({ runId: 'run-print' });

      await vi.waitFor(() => {
        expect(fixture.requests.get('call-print')?.state).toBe('withdrawn');
      });
      expect(fixture.withdrawPrintRequest.mock.calls).toEqual([
        [{ requestId: 'call-print', resolvedBy: { kind: 'user', id: 'chat', label: 'Stopped with the chat turn' } }],
      ]);
      expect(fixture.resolvePrintRequest).not.toHaveBeenCalled();
      await host.close();
    });

    it('should approve the request once when the person approves in chat, and tell the continued attempt', async () => {
      const { fixture, host, transport, interruptId } = await pausedOnPrint();

      await host.resolveInterrupt({ runId: 'run-print', interruptId, outcome: 'approved' });
      await vi.waitFor(() => {
        expect(fixture.requests.get('call-print')?.state).toBe('approved');
      });
      await host.resume('chat-print');

      expect(fixture.resolvePrintRequest.mock.calls.map(([call]) => call.decision)).toEqual(['approve']);
      expect(fixture.requestPrint).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(transport.requests.at(-1)?.messages)).toContain(
        String.raw`approved: \"Print pyramid.gcode.3mf`,
      );
      await expect(host.snapshot('chat-print')).resolves.toMatchObject({ state: 'completed' });
      await host.close();
    });

    it('should report the answer to a re-call that recalls a request the hand-over already settled (GM.r2 H1)', async () => {
      const { fixture, host, transport, interruptId } = await pausedOnPrint([
        { toolCalls: [{ ...printCall, id: 'call-print-again' }] },
        { text: 'The print is on its way.' },
      ]);

      await host.resolveInterrupt({ runId: 'run-print', interruptId, outcome: 'approved' });
      await vi.waitFor(() => {
        expect(fixture.requests.get('call-print')?.state).toBe('approved');
      });
      await host.resume('chat-print');

      expect(fixture.requestPrint).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(transport.requests.at(-1)?.messages)).toContain(
        '"machineName":"Workshop X1C","approval":"approved"',
      );
      await host.close();
    });
    it.each([
      ['denied', 'denied'],
      ['withdrawn', 'cancelled'],
    ] as const)(
      "should report the ledger's answer, not the recalled approval, when the Print pane settled it first (%s, GM.r3)",
      async (state, approval) => {
        const { fixture, host, transport, interruptId } = await pausedOnPrint([
          { toolCalls: [{ ...printCall, id: 'call-print-again' }] },
          { text: 'The print is on its way.' },
        ]);
        /* The Print pane answers the ledger directly, before the chat's approval reaches it. */
        const resolvedBy = { kind: 'user', id: 'pane', label: 'You' } as const;
        await (state === 'denied'
          ? fixture.client.resolvePrintRequest({ requestId: 'call-print', decision: 'deny', resolvedBy })
          : fixture.client.withdrawPrintRequest({ requestId: 'call-print', resolvedBy }));

        await host.resolveInterrupt({ runId: 'run-print', interruptId, outcome: 'approved' });
        await host.resume('chat-print');

        expect(fixture.requests.get('call-print')?.state).toBe(state);
        expect(JSON.stringify(transport.requests.at(-1)?.messages)).toContain(
          `"machineName":"Workshop X1C","approval":"${approval}"`,
        );
        await host.close();
      },
    );
  });

  describe('nextStep', () => {
    const recorded = (state: PrintRequest['state'], overrides: Partial<PrintRequest> = {}): PrintRequest => ({
      requestId: 'call-1',
      machineId: 'machine-1',
      artifact: artifactFixture,
      configuration: {},
      requestedBy: { kind: 'agent', id: 'tau', label: 'Tau agent' },
      summary: { fileName: 'pyramid.gcode.3mf' },
      state,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    });
    const start = { operationId: 'start-1', machineId: 'machine-1', kind: 'start', observedAt: timestamp } as const;
    const awaiting =
      "Waiting for a person to accept print request call-1 in Tau's Print pane; accepting uploads the file and starts the print. Do not retry; call get_print_request to observe it.";
    /* Each state the person or the printer settles a request in, its record's own facts, and what the agent is told. */
    const settledStates: ReadonlyArray<readonly [PrintRequest['state'], Partial<PrintRequest>, string]> = [
      [
        'started',
        { receipt: { ...start, status: 'accepted', providerRunId: 'provider-run-7' } },
        'The printer confirmed the start of pyramid.gcode.3mf and the print is running. Observe it with get_machine or get_print_request.',
      ],
      [
        'unknown',
        { receipt: { ...start, status: 'unknown', reason: 'reply-lost-after-possible-acceptance' } },
        "The printer did not confirm the start of pyramid.gcode.3mf, so whether it is printing is unknown. Tell the person that, and to check the printer or Reconcile the request in Tau's Print pane. Do not retry or start another print.",
      ],
      [
        'rejected',
        {
          receipt: { ...start, status: 'rejected', code: 'PROVIDER_REJECTED', message: 'mqtt message verify failed' },
          failure: { code: 'PROVIDER_REJECTED', message: 'mqtt message verify failed' },
        },
        'The printer rejected the start of pyramid.gcode.3mf. Tell the person it failed and why, with any fix its message names: "mqtt message verify failed"',
      ],
      [
        'failed',
        {
          failure: { code: 'ARTIFACT_UNQUALIFIED', message: 'This printer only accepts files sliced by Bambu Studio.' },
        },
        'Print request call-1 for pyramid.gcode.3mf failed. Tell the person it failed and why, with any fix its message names: "This printer only accepts files sliced by Bambu Studio."',
      ],
      [
        'denied',
        {},
        'The person declined print request call-1; that is their decision. Do not retry it unless they ask.',
      ],
      [
        'withdrawn',
        {},
        'Print request call-1 was withdrawn before it started. Do not retry it unless the person asks.',
      ],
    ];

    it.each([['awaiting-approval', {}, awaiting] as const, ...settledStates])(
      'should give the next step for the %s state when get_print_request reads it',
      async (state, overrides, nextStep) => {
        const fixture = clientFixture();
        fixture.requests.set('call-1', recorded(state, overrides));
        await expect(invoke(fixture.client, 'get_print_request', { requestId: 'call-1' })).resolves.toEqual({
          isError: false,
          content: { request: recorded(state, overrides), nextStep },
        });
      },
    );

    it.each(['preparing', 'approved', 'uploading', 'starting'] as const)(
      'should give no next step while the host works on the %s state',
      async (state) => {
        const fixture = clientFixture();
        fixture.requests.set('call-1', recorded(state));
        const result = await invoke(fixture.client, 'get_print_request', { requestId: 'call-1' });
        expect(result).toEqual({ isError: false, content: { request: recorded(state) } });
      },
    );

    it.each(settledStates)(
      'should give the next step for the %s state when request_print returns it',
      async (state, overrides, nextStep) => {
        const fixture = clientFixture();
        /* An accepted request comes back as the host settled its upload and start. */
        fixture.resolvePrintRequest.mockImplementation(async (input) =>
          input.decision === 'deny' ? recorded('denied') : recorded(state, overrides),
        );
        const answer = state === 'denied' ? 'denied' : state === 'withdrawn' ? 'cancelled' : 'approved';

        const result = await run(fixture.client, {
          toolName: 'request_print',
          input: { targetFile: 'main.ts' },
          approve: approveWith(answer),
        });

        expect(result).toMatchObject({ isError: false, content: { approval: answer, request: { state }, nextStep } });
      },
    );
  });

  describe('get_print_profiles', () => {
    const bambuProvider = {
      id: 'bambu',
      vendor: 'Bambu Lab',
      manifest: {
        identity: { typeId: 'bambu.x1c', model: 'x1c' },
        toolhead: { nozzles: [{ id: 'nozzle-0.4', diameter: { value: 0.4, unit: 'mm' } }] },
      },
    } as unknown as MachineProvider;
    const install = { executable: '/bin/bambu', version: '02.08.02.61', resourcesDir: '/res' };
    const printers = ['Bambu Lab X1 Carbon 0.4 nozzle'];
    const catalog = {
      installation: install,
      printers: [
        {
          name: printers[0]!,
          kind: 'machine',
          source: 'system',
          printerModel: 'Bambu Lab X1 Carbon',
          nozzleDiameter: 0.4,
        },
      ],
      processes: [
        {
          name: '0.20mm Standard @BBL X1C',
          kind: 'process',
          source: 'system',
          layerHeight: 0.2,
          compatiblePrinters: printers,
        },
        {
          name: '0.20mm Gyroid @BBL X1C',
          kind: 'process',
          source: 'user',
          layerHeight: 0.2,
          compatiblePrinters: printers,
        },
      ],
      filaments: [
        { name: 'Generic PETG', kind: 'filament', source: 'system', filamentId: 'GFG99', filamentType: 'PETG' },
        {
          name: 'Bambu PETG Basic @BBL X1C',
          kind: 'filament',
          source: 'system',
          filamentId: 'GFG00',
          filamentType: 'PETG',
        },
      ],
      plates: [
        { id: 'cool', bambuName: 'Cool Plate' },
        { id: 'textured-pei', bambuName: 'Textured PEI Plate' },
      ],
    } as const;
    const leaf = (extra: Readonly<Record<string, unknown>>) => ({
      title: 'Setting',
      description: 'What it does.',
      ...extra,
    });
    const engine = () => ({
      findBambuStudio: vi.fn<BambuStudioEngine['findBambuStudio']>(async () => install),
      loadBambuStudioCatalog: vi.fn<BambuStudioEngine['loadBambuStudioCatalog']>(async () => catalog),
      describeBambuStudioSettings: vi.fn<BambuStudioEngine['describeBambuStudioSettings']>(async () => ({
        schema: {
          properties: {
            process: {
              properties: {
                quality: {
                  properties: {
                    layer_height: leaf({ type: 'number', minimum: 0.05, 'x-tau-unit': 'mm' }),
                    seam_position: leaf({
                      type: 'string',
                      oneOf: [
                        { const: 'aligned', title: 'Aligned' },
                        { const: 'back', title: 'Back' },
                      ],
                    }),
                  },
                },
              },
            },
            filament: {
              properties: {
                temperatures: {
                  properties: { nozzle_temperature: leaf({ type: 'array', items: { type: 'integer' } }) },
                },
              },
            },
          },
        },
        values: {
          process: { quality: { layer_height: 0.2, seam_position: 'aligned' } },
          filament: { temperatures: { nozzle_temperature: [255] } },
        },
        groups: [],
      })),
    });
    const profilesOf = async (
      bambuStudio: BambuStudioEngine,
      input: JsonValue,
      host: Readonly<{
        provider?: MachineProvider;
        entries?: readonly MachineDirectoryEntry[];
        /** The project's files, read through the agent's own view. */
        files?: Readonly<Record<string, string>>;
      }> = {},
    ) => {
      const { provider = bambuProvider, entries, files } = host;
      const { client } = clientFixture(entries === undefined ? {} : { entries });
      return createMachineToolRegistry(
        { ...client, listProviders: async () => [provider] },
        {
          bambuStudio,
          machineSettings: emptySettings,
          ...(files === undefined ? {} : { machineSettings: await agentSettings(files) }),
        },
      ).invoke({
        toolCallId: 'call-1',
        toolName: 'get_print_profiles',
        input,
        signal: new AbortController().signal,
      });
    };

    it('lists the defaults from what the printer reports, the compatible presets and every setting compactly', async () => {
      const bambuStudio = engine();
      const result = await profilesOf(bambuStudio, {});
      expect(result).toEqual({
        isError: false,
        content: {
          machineId: 'machine-1',
          engine: 'bambu-studio',
          savedProfiles: {
            typeId: 'bambu.x1c',
            activeProfile: 'default',
            selectedProfile: 'default',
            profiles: [{ id: 'default', name: 'Default' }],
          },
          version: '02.08.02.61',
          defaults: {
            printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
            process: '0.20mm Standard @BBL X1C',
            filaments: ['Bambu PETG Basic @BBL X1C'],
            plate: 'textured-pei',
          },
          printers: [{ name: 'Bambu Lab X1 Carbon 0.4 nozzle' }],
          processes: [
            { name: '0.20mm Standard @BBL X1C', layerHeight: 0.2 },
            { name: '0.20mm Gyroid @BBL X1C', source: 'user', layerHeight: 0.2 },
          ],
          filaments: [
            { name: 'Generic PETG', filamentType: 'PETG', filamentId: 'GFG99' },
            { name: 'Bambu PETG Basic @BBL X1C', filamentType: 'PETG', filamentId: 'GFG00' },
          ],
          plates: ['cool', 'textured-pei'],
          settings: {
            quality: { layer_height: 0.2, seam_position: 'aligned' },
            temperatures: { nozzle_temperature: [255] },
          },
          choices: { seam_position: ['aligned', 'back'] },
        },
      });
      expect(bambuStudio.loadBambuStudioCatalog).toHaveBeenCalledWith(install, { model: 'X1C', nozzleDiameter: 0.4 });
      expect(bambuStudio.describeBambuStudioSettings).toHaveBeenCalledWith(install, {
        printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
        process: '0.20mm Standard @BBL X1C',
        filaments: ['Bambu PETG Basic @BBL X1C'],
      });
    });

    it('picks the loaded spool by its filament id, reads a chosen selection, and describes asked keys in full', async () => {
      const bambuStudio = engine();
      const spool = entry('machine-1', 'Workshop X1C');
      const withProfile = {
        ...spool,
        snapshot: {
          ...spool.snapshot,
          setup: { materials: [{ slot: 1, state: 'loaded', materialId: 'PETG', profileId: 'GFG99' }] },
        },
      } as unknown as MachineDirectoryEntry;
      const result = await profilesOf(
        bambuStudio,
        { profiles: { process: '0.20mm Gyroid @BBL X1C' }, keys: ['layer_height', 'seam_position', 'no_such_key'] },
        { entries: [withProfile] },
      );
      expect(result.content).toMatchObject({
        /* The printer reports no plate, so none is defaulted: the person confirms it. */
        defaults: { process: '0.20mm Gyroid @BBL X1C', filaments: ['Generic PETG'] },
        details: {
          layer_height: {
            scope: 'process',
            group: 'quality',
            title: 'Setting',
            description: 'What it does.',
            type: 'number',
            unit: 'mm',
            minimum: 0.05,
            value: 0.2,
          },
          seam_position: {
            type: 'string',
            choices: [
              { value: 'aligned', title: 'Aligned' },
              { value: 'back', title: 'Back' },
            ],
            value: 'aligned',
          },
        },
        unknownKeys: ['no_such_key'],
      });
      expect((result.content as { defaults: Record<string, unknown> }).defaults).not.toHaveProperty('plate');
    });

    it('names the reference engine and why, without Bambu Studio or for another vendor', async () => {
      const missing = { ...engine(), findBambuStudio: async () => undefined };
      await expect(profilesOf(missing, {})).resolves.toMatchObject({
        isError: false,
        content: {
          engine: 'reference',
          reason: expect.stringContaining('needs the Tau desktop app with Bambu Studio installed') as string,
        },
      });
      const bambuStudio = engine();
      await expect(
        profilesOf(bambuStudio, {}, { provider: { ...bambuProvider, vendor: 'Prusa Research' } }),
      ).resolves.toMatchObject({
        content: { engine: 'reference', reason: expect.stringContaining('not a Bambu printer') as string },
      });
      expect(bambuStudio.findBambuStudio).not.toHaveBeenCalled();
    });

    it('refuses more than 64 keys before reading anything', async () => {
      const bambuStudio = engine();
      await expect(
        profilesOf(bambuStudio, { keys: Array.from({ length: 65 }, (_, index) => `key_${String(index)}`) }),
      ).resolves.toMatchObject({ isError: true, content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' } });
      expect(bambuStudio.findBambuStudio).not.toHaveBeenCalled();
    });

    describe("with the project's print intent", () => {
      /* A catalog with a fine process too, so the file's quality preset shows in the defaults. */
      const withFine = () => ({
        ...engine(),
        loadBambuStudioCatalog: vi.fn<BambuStudioEngine['loadBambuStudioCatalog']>(async () => ({
          ...catalog,
          processes: [
            ...catalog.processes,
            {
              name: '0.12mm Fine @BBL X1C',
              kind: 'process',
              source: 'system',
              layerHeight: 0.12,
              compatiblePrinters: printers,
            },
          ],
        })),
      });
      const machinePreferencesOf = (content: JsonValue): JsonValue | undefined =>
        (content as JsonObject)['machinePreferences'];

      it("should default to the file's values under the call's own, and say which it used", async () => {
        const files = printerFile({ preset: 'fine', filaments: { '0': 'Generic PETG' }, settings: { wall_loops: 3 } });
        const bambuStudio = withFine();
        const result = await profilesOf(bambuStudio, {}, { files });
        expect(result.content).toMatchObject({
          defaults: {
            printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
            process: '0.12mm Fine @BBL X1C',
            filaments: ['Generic PETG'],
            plate: 'textured-pei',
          },
        });
        /* Read back through the tool's own output contract. */
        expect(getPrintProfilesOutputSchema.parse(result.content).machinePreferences).toEqual({
          ...reportedProfile,
          applied: { preset: 'fine', filaments: { '0': 'Generic PETG' }, settings: { wall_loops: 3 } },
        });
        expect(bambuStudio.describeBambuStudioSettings).toHaveBeenCalledWith(install, {
          printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
          process: '0.12mm Fine @BBL X1C',
          filaments: ['Generic PETG'],
        });

        const chosen = await profilesOf(
          withFine(),
          { profiles: { filaments: ['Bambu PETG Basic @BBL X1C'] } },
          { files },
        );
        expect(chosen.content).toMatchObject({ defaults: { filaments: ['Bambu PETG Basic @BBL X1C'] } });
        expect(machinePreferencesOf(chosen.content)).toEqual({
          ...reportedProfile,
          applied: { preset: 'fine', settings: { wall_loops: 3 } },
        });
      });

      it.each([
        ['broken JSON', { [settingsPath]: '{"version":1,' }],
        ['a bad value', printerFile({ printer: 7 })],
        [
          'a future record',
          {
            [settingsPath]: JSON.stringify({
              ...printerRecord({}),
              version: 2,
            }),
          },
        ],
        ['a file over 256 KiB', printerFile({ settings: { note: 'x'.repeat(262_144) } })],
      ])('should refuse %s without applying defaults', async (_case, files) => {
        const result = await profilesOf(engine(), {}, { files });
        expect(result.isError).toBe(true);
        expect(result.content).toMatchObject({
          errorCode: 'MACHINE_TOOL_ERROR',
        });
      });

      it('should report only the quality preset and options when the reference engine slices', async () => {
        const result = await profilesOf(
          engine(),
          {},
          {
            provider: { ...bambuProvider, vendor: 'Prusa Research' },
            files: printerFile({ preset: 'fast', process: '0.12mm Fine @BBL X1C', options: { walls: 3 } }),
          },
        );
        expect(result.content).toMatchObject({ engine: 'reference' });
        expect(machinePreferencesOf(result.content)).toEqual({
          ...reportedProfile,
          applied: { preset: 'fast', options: { walls: 3 } },
        });
      });

      it('should name the file when a preset it names is not in this Bambu Studio', async () => {
        await expect(
          profilesOf(engine(), {}, { files: printerFile({ process: '0.12mm Old @BBL X1C' }) }),
        ).resolves.toEqual({
          isError: true,
          content: {
            errorCode: 'MACHINE_TOOL_ERROR',
            message: `Bambu Studio has no process preset "0.12mm Old @BBL X1C". The project's ${settingsPath} supplied process; edit it there, or pass your own.`,
          },
        });
      });
    });
  });

  describe('cancel_print', () => {
    it('cancels the exact observed provider run of a started request', async () => {
      const fixture = clientFixture();
      fixture.requests.set('request-started', {
        requestId: 'request-started',
        machineId: 'machine-1',
        artifact: artifactFixture,
        configuration: {},
        requestedBy: { kind: 'user', id: 'user-1', label: 'Ada' },
        summary: { fileName: 'pyramid.gcode.3mf' },
        state: 'started',
        createdAt: timestamp,
        updatedAt: timestamp,
        receipt: {
          operationId: 'start-1',
          machineId: 'machine-1',
          kind: 'start',
          status: 'accepted',
          providerRunId: 'provider-run-7',
          observedAt: timestamp,
        },
      });
      const result = await invoke(fixture.client, 'cancel_print', { requestId: 'request-started' });
      expect(fixture.controlRun).toHaveBeenCalledTimes(1);
      expect(fixture.controlRun.mock.calls[0]![0]).toMatchObject({
        machineId: 'machine-1',
        operationId: 'call-1:cancel',
        command: 'cancel',
        expectedProviderRunId: 'provider-run-7',
      });
      expect(fixture.withdrawPrintRequest).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        isError: false,
        content: {
          request: { requestId: 'request-started' },
          receipt: { status: 'accepted', providerRunId: 'provider-run-7' },
        },
      });
    });

    it('withdraws a request that has not started and leaves a settled one alone', async () => {
      const fixture = clientFixture();
      await invoke(fixture.client, 'request_print', { targetFile: 'main.ts' });
      await expect(invoke(fixture.client, 'cancel_print', { requestId: 'call-1' })).resolves.toMatchObject({
        isError: false,
        content: { request: { requestId: 'call-1', state: 'withdrawn' } },
      });
      expect(fixture.withdrawPrintRequest).toHaveBeenCalledTimes(1);
      await expect(invoke(fixture.client, 'cancel_print', { requestId: 'call-1' })).resolves.toMatchObject({
        isError: false,
        content: { request: { state: 'withdrawn' } },
      });
      expect(fixture.withdrawPrintRequest).toHaveBeenCalledTimes(1);
      expect(fixture.controlRun).not.toHaveBeenCalled();
    });

    it('controls a run directly by machine and expected provider run id', async () => {
      const fixture = clientFixture();
      await expect(
        invoke(fixture.client, 'cancel_print', { machineId: 'machine-1', expectedProviderRunId: 'provider-run-3' }),
      ).resolves.toMatchObject({ isError: false, content: { status: 'accepted', providerRunId: 'provider-run-3' } });
      expect(fixture.controlRun.mock.calls[0]![0]).toMatchObject({
        operationId: 'call-1:cancel',
        expectedProviderRunId: 'provider-run-3',
      });
    });
  });

  describe('prepare_machine_print', () => {
    const { projectId: _modelProject, ...withoutProject } = artifactFixture;

    it.each([
      ['another project', { ...artifactFixture, projectId: 'proj_000000000000000000002' }],
      ['no project', withoutProject],
    ])('should name the artifact by this project when the model gave %s', async (_case, artifact) => {
      const fixture = clientFixture();
      const result = await invoke(fixture.client, 'prepare_machine_print', {
        machineId: 'machine-1',
        artifact,
        configuration: {},
      });
      expect(result).toMatchObject({ isError: false, content: { preparedId: 'prepared-1', artifact: { projectId } } });
      expect(fixture.preparePrint.mock.calls[0]![0].artifact).toEqual(artifactFixture);
    });

    it('should refuse without a project to name rather than guess one', async () => {
      const fixture = clientFixture();
      const result = await createMachineToolRegistry(fixture.client).invoke({
        toolCallId: 'call-1',
        toolName: 'prepare_machine_print',
        input: { machineId: 'machine-1', artifact: artifactFixture, configuration: {} },
        signal: new AbortController().signal,
      });
      expect(result).toEqual({
        isError: true,
        content: {
          errorCode: 'MACHINE_TOOL_ERROR',
          message: 'This host cannot name the project a print artifact belongs to, so it prepares no prints.',
        },
      });
      expect(fixture.preparePrint).not.toHaveBeenCalled();
    });
  });

  it('reads and lists print requests', async () => {
    const fixture = clientFixture();
    await invoke(fixture.client, 'request_print', { targetFile: 'main.ts' });
    await expect(invoke(fixture.client, 'get_print_request', { requestId: 'call-1' })).resolves.toMatchObject({
      isError: false,
      content: { request: { requestId: 'call-1', state: 'awaiting-approval' } },
    });
    await expect(invoke(fixture.client, 'get_print_request', { requestId: 'missing' })).resolves.toMatchObject({
      isError: true,
      content: { errorCode: 'MACHINE_TOOL_ERROR', message: 'No print request missing.' },
    });
    await expect(invoke(fixture.client, 'list_print_requests', { machineId: 'machine-1' })).resolves.toMatchObject({
      isError: false,
      content: { total: 1, requests: [{ requestId: 'call-1' }] },
    });
    await expect(invoke(fixture.client, 'list_print_requests', { machineId: 'machine-2' })).resolves.toMatchObject({
      isError: false,
      content: { total: 0, requests: [] },
    });
  });

  it('refuses invalid physical inputs before calling the client', async () => {
    const fixture = clientFixture();
    await expect(
      invoke(fixture.client, 'upload_machine_print', {
        machineId: 'machine-1',
        preparedId: 'prepared-1',
        preparedDigest: 'not-a-digest',
        operationId: 'operation-1',
      }),
    ).resolves.toMatchObject({ isError: true, content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' } });
    const halfAddressed = await invoke(fixture.client, 'cancel_print', { machineId: 'machine-1' });
    expect(halfAddressed).toMatchObject({ isError: true, content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' } });
    expect(JSON.stringify(halfAddressed.content)).toContain(
      'Give requestId alone, or machineId together with expectedProviderRunId.',
    );
    await expect(invoke(fixture.client, 'request_print', { targetFile: '' })).resolves.toMatchObject({
      isError: true,
      content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' },
    });
    await expect(invoke(fixture.client, 'start_machine_print', { machineId: 'machine-1' })).resolves.toMatchObject({
      isError: true,
      content: { errorCode: 'TOOL_NOT_FOUND' },
    });
    expect(fixture.uploadPrint).not.toHaveBeenCalled();
    expect(fixture.controlRun).not.toHaveBeenCalled();
    expect(fixture.requestPrint).not.toHaveBeenCalled();
    expect(fixture.startPrint).not.toHaveBeenCalled();
  });
});

/*
 * `request_print` as a host builds it: the chat registry, its own planner and
 * export route, and a runtime whose slicing leg is the real reference engine
 * over the slicer package's 20 mm cube. Only the kernel is a fixture.
 */
describe('request_print slicer options through the chat registry', () => {
  const cube = {
    name: 'cube.glb',
    mimeType: 'model/gltf-binary',
    bytes: Uint8Array.from(
      readFileSync(new URL('../../../../packages/plugins/slicer/src/__fixtures__/cube.glb', import.meta.url)),
    ),
  } as const;
  const provider = {
    id: 'bambu',
    name: 'Bambu Lab',
    manifest: {
      identity: { typeId: 'bambu.x1c', model: 'x1c' },
      toolhead: {
        filamentDiameter: { value: 1.75, unit: 'mm' },
        nozzles: [{ id: 'nozzle-0.4', diameter: { value: 0.4, unit: 'mm' } }],
      },
      bed: { plates: [{ id: 'textured-pei', label: 'Textured PEI plate' }] },
      slicing: {
        recommended: { nozzleTemperature: { value: 250, unit: 'Cel' }, bedTemperature: { value: 70, unit: 'Cel' } },
      },
    },
  } as unknown as MachineProvider;

  const printHost = async (files: Readonly<Record<string, string>> = {}) => {
    const definition = await resolveRuntimePluginDefinition('transcoder', slicerTranscoder());
    const transcoderRuntime = mock<TranscoderRuntime>({
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      tracer: { startSpan: vi.fn(() => ({ end: vi.fn() })) },
      signal: new AbortController().signal,
    });
    const slicerContext = await definition.initialize({}, transcoderRuntime);
    /* The runtime validates export options against the edge's schema, then transcodes. */
    const exportModel = vi.fn<RuntimeAgentClient['export']>(async (_format, { exportOptions }) =>
      definition.transcode(
        { from: 'glb', to: 'gcode.3mf', files: [cube], options: slicerOptionsSchema.parse(exportOptions ?? {}) },
        transcoderRuntime,
        slicerContext,
      ),
    );
    const clients = createRuntimeAgentClients({
      runtime: { evaluate: vi.fn<RuntimeAgentClient['evaluate']>(), export: exportModel },
      exportImage: vi.fn(),
      mapRuntimeError: (error) => toRpcError(error),
    });
    const ledger = clientFixture();
    const filesystem = new MemoryProvider();
    const recordView = composeView({ filesystem }, { consumer: 'user', policy: tauPathPolicy });
    const mutations = new ResourceQueue();
    const registry = createChatToolRegistry({
      fileSystemFor: await agentProject(files, filesystem),
      machineSettings: await agentSettings({}, filesystem),
      recordFileSystemFor: (signal) => createProviderRpcFileSystem({ provider: recordView, mutations, signal }),
      ...clients,
      machines: { available: true, ...ledger.client, listProviders: async () => [provider] },
      print: {
        projectId,
        readArtifact: async ({ path }) => recordView.readFile(assertRootedPath(path)),
      },
      testingEnabled: false,
    });
    const requestPrint = async (toolCallId: string, input: JsonValue) =>
      registry.invoke({ toolCallId, toolName: 'request_print', input, signal: new AbortController().signal });
    return { exportModel, ledger, registry, requestPrint };
  };

  it("should hand the chat's answer to request_print through the composed registry (D5)", async () => {
    const host = await printHost();
    await host.requestPrint('call-answered', { targetFile: 'main.ts' });

    await host.registry.answerApproval?.({
      toolName: 'request_print',
      payload: { kind: 'print-request', requestId: 'call-answered' },
      resolution: { interruptId: 'interrupt-1', outcome: 'denied' },
    });
    await host.registry.answerApproval?.({
      toolName: 'request_print',
      payload: { kind: 'print-request', requestId: 'call-answered' },
      resolution: { interruptId: 'interrupt-1', outcome: 'denied' },
    });

    expect(host.ledger.requests.get('call-answered')?.state).toBe('denied');
    /* Handed over twice, settled once. */
    expect(host.ledger.resolvePrintRequest).toHaveBeenCalledTimes(1);
  });

  it('should hand runtime.export exactly the preset and options the agent chose', async () => {
    const host = await printHost();

    const result = await host.requestPrint('call-fine', {
      targetFile: 'main.ts',
      preset: 'fine',
      options: { walls: 3 },
    });

    expect(result).toMatchObject({ isError: false, content: { request: { state: 'awaiting-approval' } } });
    /* The recorded slice, named by the host's project. */
    expect(host.ledger.requestPrint.mock.calls[0]![0].artifact).toMatchObject({
      projectId,
      path: expect.stringMatching(/^\.tau\/artifacts\/call-fine__/u) as string,
    });
    expect(host.exportModel).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
      source: { path: 'main.ts' },
      signal: expect.any(AbortSignal) as AbortSignal,
      /* The machine's own options under the agent's; the observed plate wins. */
      exportOptions: {
        plate: 'textured-pei',
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        nozzleTemperature: 250,
        bedTemperature: 70,
        walls: 3,
        preset: 'fine',
      },
    });
  });

  it("should slice with the project's print intent under the agent's own options, and say which values it used", async () => {
    const host = await printHost(printerFile({ preset: 'fine', options: { walls: 4, infillPercent: 30 } }));

    const result = await host.requestPrint('call-intent', { targetFile: 'main.ts', options: { walls: 3 } });

    expect(result.isError).toBe(false);
    expect(requestPrintOutputSchema.parse(result.content)).toMatchObject({
      request: { state: 'awaiting-approval' },
      machinePreferences: { path: settingsPath, applied: { preset: 'fine', options: { infillPercent: 30 } } },
    });
    expect(host.exportModel.mock.calls[0]![1].exportOptions).toEqual({
      plate: 'textured-pei',
      nozzleDiameter: 0.4,
      filamentDiameter: 1.75,
      nozzleTemperature: 250,
      bedTemperature: 70,
      infillPercent: 30,
      walls: 3,
      preset: 'fine',
    });
  });

  it('should record more layers for a fine print of the cube than a fast one', async () => {
    const host = await printHost();

    await host.requestPrint('call-fast', { targetFile: 'main.ts', preset: 'fast' });
    await host.requestPrint('call-fine', { targetFile: 'main.ts', preset: 'fine' });

    expect(host.ledger.requests.get('call-fast')?.summary.layers).toBe(72);
    expect(host.ledger.requests.get('call-fine')?.summary.layers).toBe(167);
  });

  it.each([
    ['engine', 'service'],
    ['service', { url: 'https://slicer.example.com', token: 'stolen-token' }],
    ['bedSize', { x: 300, y: 300 }],
    // The preset has one way in, the call's top-level `preset`.
    ['preset', 'fine'],
  ])('should refuse options.%s before any export, naming it, and leave the ledger untouched', async (key, value) => {
    const host = await printHost();

    const result = await host.requestPrint('call-1', { targetFile: 'main.ts', options: { [key]: value } });

    expect(result).toMatchObject({
      isError: true,
      content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED', message: expect.stringContaining(`"${key}"`) as string },
    });
    expect(host.exportModel).not.toHaveBeenCalled();
    expect(host.ledger.requestPrint).not.toHaveBeenCalled();
    expect(host.ledger.requests.size).toBe(0);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End Bambu wire-key fixtures. */
