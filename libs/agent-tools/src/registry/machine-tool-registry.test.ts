import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '@taucad/agent-host';
import type { MachineClient } from '@taucad/runtime/machine';
import { createChatToolRegistry } from '#registry/tool-registry.js';

const timestamp = '2026-09-14T00:00:00.000Z';
const machineToolNames = [
  'discover_machines',
  'begin_machine_binding',
  'list_machines',
  'get_machine',
  'prepare_machine_print',
  'start_machine_print',
  'reconcile_machine_operation',
  'control_machine_run',
  'capture_machine_still',
] as const;

const clientFixture = () => {
  const startPrint = vi.fn<MachineClient['startPrint']>(async (input) => ({
    operationId: input.operationId,
    machineId: input.machineId,
    kind: 'start',
    status: 'accepted',
    providerRunId: 'provider-run-1',
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
    startPrint,
    reconcileOperation: async () => {
      throw new Error('not used');
    },
    controlRun: async () => {
      throw new Error('not used');
    },
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
      entries: [],
    }),
    get: async () => {
      throw new Error('not used');
    },
    async *watch() {
      yield* [];
    },
  };
  return { captureStill, client, startPrint };
};

const registry = (machines: Parameters<typeof createChatToolRegistry>[0]['machines']) =>
  createChatToolRegistry({
    fileSystemFor: () => {
      throw new Error('not used');
    },
    machines,
    testingEnabled: false,
  });

const invoke = async (client: MachineClient, toolName: string, input: JsonValue) =>
  registry({ available: true, ...client }).invoke({
    toolCallId: 'call-1',
    toolName,
    input,
    signal: new AbortController().signal,
  });

describe('machine tool registry', () => {
  it('registers explicit tools only for the negotiated and granted facet', () => {
    for (const reason of ['unsupported', 'not-granted'] as const) {
      const names = registry({ available: false, reason })
        .list()
        .map(({ name }) => name);
      expect(names.filter((name) => machineToolNames.includes(name as (typeof machineToolNames)[number]))).toEqual([]);
    }
    const definitions = registry({ available: true, ...clientFixture().client })
      .list()
      .filter(({ name }) => machineToolNames.includes(name as (typeof machineToolNames)[number]));
    expect(definitions.map(({ name }) => name)).toEqual(machineToolNames);
    expect(JSON.stringify(definitions.map(({ inputSchema }) => inputSchema))).not.toMatch(
      /access.?code|certificate.?decision|host.?path|mqtt/iu,
    );
  });

  it('collects bounded discovery and returns the exact physical-operation receipt', async () => {
    const { captureStill, client, startPrint } = clientFixture();
    await expect(
      invoke(client, 'discover_machines', {
        providerId: 'bambu',
        configuration: { logicalId: 'workshop-x1c' },
      }),
    ).resolves.toMatchObject({
      isError: false,
      content: { events: [{ type: 'found', candidate: { claimedIdentity: { model: 'X1C' } } }] },
    });

    const result = await invoke(client, 'start_machine_print', {
      machineId: 'machine-1',
      preparedId: 'prepared-1',
      preparedDigest: `sha256:${'a'.repeat(64)}`,
      expectedSetupDigest: `sha256:${'b'.repeat(64)}`,
      operationId: 'operation-1',
    });
    expect(result).toMatchObject({
      isError: false,
      content: {
        operationId: 'operation-1',
        machineId: 'machine-1',
        kind: 'start',
        status: 'accepted',
        providerRunId: 'provider-run-1',
      },
    });
    expect(startPrint).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation-1' }));

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

  it('refuses invalid physical inputs before calling the client', async () => {
    const { client, startPrint } = clientFixture();
    await expect(
      invoke(client, 'start_machine_print', {
        machineId: 'machine-1',
        preparedId: 'prepared-1',
        preparedDigest: 'not-a-digest',
        expectedSetupDigest: `sha256:${'b'.repeat(64)}`,
        operationId: 'operation-1',
      }),
    ).resolves.toMatchObject({ isError: true, content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' } });
    expect(startPrint).not.toHaveBeenCalled();
  });
});
