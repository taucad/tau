import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { HostToolInvocation, InterruptResolution, JsonValue } from '@taucad/agent-host';
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
import { requestPrintInputSchema } from '@taucad/chat';
import { toolDescriptions, toolName } from '@taucad/chat/constants';
import { toRpcError } from '@taucad/chat/rpc';
import { toProviderToolJsonSchema } from '@taucad/chat/schemas';
import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';
import { createChatToolRegistry } from '#registry/tool-registry.js';
import { createMachineToolRegistry } from '#registry/machine-tool-registry.js';
import type { MachinePrintPlanner } from '#registry/machine-tool-registry.js';
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

const artifactFixture: MachineArtifactReference = {
  revision: {
    authorityId: 'authority-1',
    workspaceId: 'workspace-1',
    revisionId: 'revision-1' as MachineArtifactReference['revision']['revisionId'],
    treeDigest: sha('c'),
  },
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
  const captureStill = vi.fn<MachineClient['captureStill']>(async () => ({
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    mediaType: 'image/jpeg',
    capturedAt: timestamp,
    expiresAt: '2026-09-14T00:00:15.000Z',
  }));
  const client: MachineClient = {
    listProviders: async () => [],
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
    preparePrint: async () => {
      throw new Error('not used');
    },
    uploadPrint,
    startPrint,
    reconcileOperation: async () => {
      throw new Error('not used');
    },
    controlRun,
    captureStill,
    list: async () => ({
      cursor: {
        hostId: 'host-1',
        authorityId: 'authority-1',
        workspaceId: 'workspace-1',
        generation: 'generation-1',
        position: 1,
        revision: 1,
      },
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
  createMachineToolRegistry(client, { planPrint }).invoke({
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
    /* Through the chat registry no planner is wired yet, so `request_print` is
     * withheld rather than offered-and-failing; nothing offers a bare start. */
    expect(definitions.map(({ name }) => name)).toEqual(machineToolNames.filter((name) => name !== 'request_print'));
    expect(definitions.map(({ name }) => name)).not.toContain('start_machine_print');
    expect(JSON.stringify(definitions.map(({ inputSchema }) => inputSchema))).not.toMatch(
      /access.?code|certificate.?decision|host.?path|mqtt/iu,
    );
  });

  it('offers request_print only with a planner and keeps every description short', () => {
    const { client } = clientFixture();
    const withPlanner = createMachineToolRegistry(client, { planPrint }).list();
    expect(withPlanner.map(({ name }) => name)).toEqual(machineToolNames);
    expect(
      createMachineToolRegistry(client)
        .list()
        .map(({ name }) => name),
    ).not.toContain('request_print');
    for (const definition of withPlanner) {
      expect(definition.description.split(/\s+/u).length).toBeLessThan(150);
    }
  });

  /* The CLI offers every machine tool, and a Tau turn offers the print tools:
   * each schema reaches Vertex and Anthropic as published, so none may carry
   * the ref loops or keywords they refuse. */
  it('should publish every definition without the JSON Schema keywords providers refuse', () => {
    const definitions = createMachineToolRegistry(clientFixture().client, { planPrint }).list();
    const serialized = JSON.stringify(definitions.map(({ inputSchema }) => inputSchema));

    for (const keyword of ['$schema', '$ref', 'definitions', '$defs', 'propertyNames', 'const', 'prefixItems']) {
      expect(serialized, keyword).not.toContain(`"${keyword}"`);
    }
    expect(definitions.find(({ name }) => name === toolName.requestPrint)).toEqual({
      name: toolName.requestPrint,
      description: toolDescriptions[toolName.requestPrint],
      inputSchema: toProviderToolJsonSchema(requestPrintInputSchema),
    });
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
        cursor: { authorityId: 'authority-1', workspaceId: 'workspace-1' },
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

    it('should deny the request, not withdraw it, when the person declines', async () => {
      const fixture = clientFixture();
      const result = await run(fixture.client, {
        toolName: 'request_print',
        input: { targetFile: 'main.ts' },
        approve: approveWith('denied'),
      });
      expect(fixture.withdrawPrintRequest).not.toHaveBeenCalled();
      /* No signal: a denial must land even while the run is being cancelled. */
      expect(fixture.resolvePrintRequest.mock.calls).toEqual([
        [
          {
            requestId: 'call-1',
            decision: 'deny',
            resolvedBy: { kind: 'user', id: 'chat', label: 'Declined in chat' },
          },
        ],
      ]);
      expect(fixture.startPrint).not.toHaveBeenCalled();
      expect(fixture.uploadPrint).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        isError: false,
        content: { approval: 'denied', request: { requestId: 'call-1', state: 'denied' } },
      });
    });

    it('should withdraw the request when the run is cancelled before anyone answers', async () => {
      const fixture = clientFixture();
      const result = await run(fixture.client, {
        toolName: 'request_print',
        input: { targetFile: 'main.ts' },
        approve: approveWith('cancelled'),
      });
      expect(fixture.resolvePrintRequest).not.toHaveBeenCalled();
      expect(fixture.withdrawPrintRequest.mock.calls).toEqual([
        [{ requestId: 'call-1', resolvedBy: { kind: 'user', id: 'chat', label: 'Stopped with the chat turn' } }],
      ]);
      expect(fixture.startPrint).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        isError: false,
        content: { approval: 'cancelled', request: { requestId: 'call-1', state: 'withdrawn' } },
      });
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
          message: 'No machine is bound to this workspace; the person binds one in the Print pane.',
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

  const printHost = async () => {
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
    const recordView = composeView({ filesystem: new MemoryProvider() }, { consumer: 'user', policy: tauPathPolicy });
    const mutations = new ResourceQueue();
    const registry = createChatToolRegistry({
      fileSystemFor: (signal) => createProviderRpcFileSystem({ provider: recordView, mutations, signal }),
      recordFileSystemFor: (signal) => createProviderRpcFileSystem({ provider: recordView, mutations, signal }),
      ...clients,
      machines: { available: true, ...ledger.client, listProviders: async () => [provider] },
      print: {
        revisions: { describe: async () => ({ revisionId: 'revision-7' }) },
        readArtifact: async ({ path }) => recordView.readFile(assertRootedPath(path)),
      },
      testingEnabled: false,
    });
    const requestPrint = async (toolCallId: string, input: JsonValue) =>
      registry.invoke({ toolCallId, toolName: 'request_print', input, signal: new AbortController().signal });
    return { exportModel, ledger, requestPrint };
  };

  it('should hand runtime.export exactly the preset and options the agent chose', async () => {
    const host = await printHost();

    const result = await host.requestPrint('call-fine', {
      targetFile: 'main.ts',
      preset: 'fine',
      options: { walls: 3 },
    });

    expect(result).toMatchObject({ isError: false, content: { request: { state: 'awaiting-approval' } } });
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
