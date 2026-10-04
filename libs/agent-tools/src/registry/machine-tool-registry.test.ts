import type { MachineTypeId, MachineSettingsService } from '@taucad/types';
import { MachineSettingsOwner } from '@taucad/runtime/host';
import { machineSettingsPath } from '@taucad/runtime/machine/settings';
import { slicingPreferences, slicingPreferencesSchema } from '@taucad/slicer/preferences';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio setting keys are its own wire vocabulary */
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createTauAgentHost } from '@taucad/agent-host';
import type { HostToolApprovalAnswer, HostToolInvocation, InterruptResolution, JsonValue } from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';
import { ResourceQueue } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type {
  MachineClient,
  MachineDirectoryEntry,
  MachineJob,
  MachineOperation,
  MachineProvider,
} from '@taucad/runtime/machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { TranscoderServices } from '@taucad/runtime/types';
import { slicerOptionsSchema, slicerTranscoder } from '@taucad/slicer';
import { assertRootedPath } from '@taucad/utils/path';
import {
  checkJobOutputSchema,
  getPrintProfilesOutputSchema,
  machineActionOutputSchema,
  printOptionKeys,
  requestJobInputSchema,
  requestJobOutputSchema,
} from '@taucad/chat';
import { toolDescriptions, toolName } from '@taucad/chat/constants';
import type { RpcGraphicsClient } from '@taucad/chat/rpc';
import { toProviderToolJsonSchema } from '@taucad/chat/schemas';
import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';
import { createChatToolRegistry } from '#registry/tool-registry.js';
import { createMachineToolRegistry } from '#registry/machine-tool-registry.js';
import type { MachinePrintPlanner } from '#registry/machine-tool-registry.js';
import type { BambuStudioEngine } from '#registry/print-profiles.js';
import { placementOver, scriptedTransport } from '#registry/tau-host.fixture.js';
import type { ScriptedResponse } from '#registry/tau-host.fixture.js';
import {
  fixtureArtifact,
  fixtureEntry,
  fixtureManifest,
  fixtureProvider,
  fixtureTimestamp,
} from '#registry/machine.fixture.js';

/** The facet {@link fixtureClient} builds, with its spies. */
type FixtureMachines = Readonly<{
  client: MachineClient;
  jobs: Map<string, MachineJob>;
  applyAction: Mock<MachineClient['applyAction']>;
  reconcileOperation: Mock<MachineClient['reconcileOperation']>;
  stop: Mock<MachineClient['stop']>;
  requestJob: Mock<MachineClient['requestJob']>;
  resolveJob: Mock<MachineClient['resolveJob']>;
  withdrawJob: Mock<MachineClient['withdrawJob']>;
  checkJob: Mock<MachineClient['checkJob']>;
  captureStill: Mock<MachineClient['captureStill']>;
}>;

/**
 * An in-memory machines facet over fixed entries. Actions are accepted, operations read back in `operationState`,
 * jobs wait for approval.
 * @param input - The directory, and the state `reconcileOperation` reports.
 * @returns The client and its spies.
 */
const fixtureClient = (
  input: Readonly<{
    entries?: readonly MachineDirectoryEntry[];
    operationState?: MachineOperation['state'];
    providers?: readonly MachineProvider[];
  }> = {},
): FixtureMachines => {
  const entries = input.entries ?? [fixtureEntry()];
  const jobs = new Map<string, MachineJob>();
  const update = (jobId: string, patch: Partial<MachineJob>): MachineJob => {
    const next = { ...jobs.get(jobId)!, ...patch };
    jobs.set(jobId, next);
    return next;
  };
  const applyAction = vi.fn<MachineClient['applyAction']>(async (request) => ({
    operationId: request.operationId,
    machineId: request.machineId,
    kind: 'action',
    observedAt: fixtureTimestamp,
    status: 'accepted',
  }));
  const reconcileOperation = vi.fn<MachineClient['reconcileOperation']>(async (request) => ({
    operationId: request.operationId,
    machineId: request.machineId,
    kind: 'action',
    // SAFETY: a well-formed sha256 literal.
    inputDigest: `sha256:${'e'.repeat(64)}` as MachineOperation['inputDigest'],
    state: input.operationState ?? 'accepted',
    updatedAt: fixtureTimestamp,
  }));
  const stop = vi.fn<MachineClient['stop']>(async (request) => ({
    operationId: request.operationId ?? 'stop',
    machineId: request.machineId,
    kind: 'stop',
    observedAt: fixtureTimestamp,
    status: 'accepted',
  }));
  const requestJob = vi.fn<MachineClient['requestJob']>(async (request) => {
    const existing = jobs.get(request.jobId);
    if (existing) {
      return existing;
    }
    const created: MachineJob = {
      version: 1,
      jobId: request.jobId,
      machineId: request.machineId,
      artifact: request.artifact,
      configuration: request.configuration,
      requestedBy: request.requestedBy,
      state: 'awaiting-approval',
      createdAt: fixtureTimestamp,
      updatedAt: fixtureTimestamp,
      program: { name: 'unnamed', facts: { process: 'fff' }, ...request.program },
      checks: [{ id: 'plate', label: 'Build plate', state: 'passed', source: 'observed' }],
    };
    jobs.set(created.jobId, created);
    return created;
  });
  const resolveJob = vi.fn<MachineClient['resolveJob']>(async (request) =>
    update(request.jobId, {
      state: request.decision === 'approve' ? 'transferring' : 'denied',
      resolvedBy: request.resolvedBy,
    }),
  );
  const withdrawJob = vi.fn<MachineClient['withdrawJob']>(async (request) =>
    update(request.jobId, { state: 'withdrawn', resolvedBy: request.resolvedBy }),
  );
  const checkJob = vi.fn<MachineClient['checkJob']>(async () => ({
    status: 'blocked',
    program: { name: 'pyramid.gcode.3mf', facts: { process: 'fff', layers: 125 } },
    checks: [
      { id: 'plate', label: 'Build plate', state: 'passed', source: 'observed' },
      {
        id: 'filament',
        label: 'Filament',
        state: 'blocked',
        source: 'computed',
        detail: 'No PLA is loaded.',
        remedy: { type: 'person', instruction: 'Load PLA.' },
      },
    ],
  }));
  const captureStill = vi.fn<MachineClient['captureStill']>(async () => ({
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    mediaType: 'image/jpeg',
    capturedAt: fixtureTimestamp,
    expiresAt: '2026-10-05T00:00:15.000Z',
  }));
  const unused = async (): Promise<never> => {
    throw new Error('not used');
  };
  const client: MachineClient = {
    listProviders: async () => input.providers ?? [fixtureProvider()],
    async *discover() {
      yield* [];
    },
    beginBinding: async () => ({ status: 'operator-action-required', ceremonyId: 'ceremony-1' }),
    removeBinding: unused,
    list: async () => ({
      cursor: { hostId: 'host-1', authorityId: 'authority-1', generation: 'generation-1', position: 1, revision: 1 },
      entries,
    }),
    get: unused,
    async *watch() {
      yield* [];
    },
    captureStill,
    checkJob,
    requestJob,
    listJobs: async ({ machineId }) =>
      [...jobs.values()].filter((job) => machineId === undefined || job.machineId === machineId).toReversed(),
    async *watchJobs() {
      yield* [];
    },
    resolveJob,
    withdrawJob,
    applyAction,
    stop,
    beginHold: unused,
    renewHold: unused,
    endHold: unused,
    reconcileOperation,
    setTesting: unused,
  };
  return {
    client,
    jobs,
    applyAction,
    reconcileOperation,
    stop,
    requestJob,
    resolveJob,
    withdrawJob,
    checkJob,
    captureStill,
  };
};

/** Every machine tool, in listing order; the job tools need a planner. */
const machineToolNames = [
  'discover_machines',
  'begin_machine_binding',
  'list_machines',
  'get_machine',
  'machine_action',
  'stop_machine',
  'get_print_profiles',
  'request_job',
  'check_job',
  'capture_machine_still',
] as const;

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
const printerFile = (preferences: Readonly<Record<string, unknown>>) => ({
  [settingsPath]: JSON.stringify({
    version: 1,
    typeId: 'bambu.x1c',
    activeProfile: 'default',
    profiles: {
      default: {
        name: 'Default',
        configurations: {
          [slicingPreferences.manifest.source.id]: {
            version: slicingPreferences.manifest.source.version,
            values: preferences,
          },
        },
      },
    },
  }),
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
  return { readMachineSettings: async (typeId: MachineTypeId) => owner.read({ typeId }) };
};

const planPrint = vi.fn<MachinePrintPlanner>(async () => ({
  artifact: fixtureArtifact,
  configuration: { expectedBedType: 'textured-pei' },
  program: {
    name: 'pyramid.gcode.3mf',
    estimatedDuration: 3_900_000,
    facts: { process: 'fff', layers: 125, filamentLength: 2100 },
  },
}));

const run = async (
  client: MachineClient,
  call: { readonly toolName: string; readonly input: JsonValue; readonly approve?: HostToolInvocation['approve'] },
) =>
  createMachineToolRegistry(client, {
    planPrint,
    machineSettings: emptySettings,
    confirmation: { pollInterval: 1, pollTimeout: 5 },
    now: () => Date.parse('2026-10-05T00:00:01.000Z'),
  }).invoke({ toolCallId: 'call-1', signal: new AbortController().signal, ...call });

const approveWith = (outcome: InterruptResolution['outcome']) =>
  vi.fn<NonNullable<HostToolInvocation['approve']>>(async () => ({ interruptId: 'interrupt-1', outcome }));

describe('machine tool registry', () => {
  it('registers explicit tools only for the negotiated and granted facet, and no bare start', () => {
    const registry = (machines: Parameters<typeof createChatToolRegistry>[0]['machines']) =>
      createChatToolRegistry({
        fileSystemFor: () => {
          throw new Error('not used');
        },
        machines,
        testingEnabled: false,
      });
    const isMachineTool = (name: string) => (machineToolNames as readonly string[]).includes(name);
    for (const reason of ['unsupported', 'not-granted'] as const) {
      expect(
        registry({ available: false, reason })
          .list()
          .map(({ name }) => name)
          .filter((name) => isMachineTool(name)),
      ).toEqual([]);
    }
    const definitions = registry({ available: true, ...fixtureClient().client })
      .list()
      .filter(({ name }) => isMachineTool(name));
    /* Without a print context the chat registry cannot slice, so the job tools are withheld. */
    expect(definitions.map(({ name }) => name)).toEqual(
      machineToolNames.filter((name) => name !== 'request_job' && name !== 'check_job'),
    );
    expect(JSON.stringify(definitions.map(({ inputSchema }) => inputSchema))).not.toMatch(
      /access.?code|certificate.?decision|host.?path|mqtt/iu,
    );
  });

  it('should publish every definition short and without the JSON Schema keywords providers refuse', () => {
    const definitions = createMachineToolRegistry(fixtureClient().client, { planPrint }).list();
    const serialized = JSON.stringify(definitions.map(({ inputSchema }) => inputSchema));

    expect(definitions.map(({ name }) => name)).toEqual(machineToolNames);
    for (const keyword of ['$schema', '$ref', 'definitions', '$defs', 'propertyNames', 'const', 'prefixItems']) {
      expect(serialized, keyword).not.toContain(`"${keyword}"`);
    }
    for (const definition of definitions) {
      expect(definition.description.split(/\s+/u).length, definition.name).toBeLessThan(150);
    }
    expect(definitions.find(({ name }) => name === toolName.requestJob)).toEqual({
      name: toolName.requestJob,
      description: toolDescriptions[toolName.requestJob],
      inputSchema: toProviderToolJsonSchema(requestJobInputSchema),
    });
  });

  /* The file's reference options and the tool's are one list, owned twice: `@taucad/slicer` cannot import `@taucad/chat`. */
  it("should accept exactly the reference options a project's print intent may hold", () => {
    expect(Object.keys(slicingPreferencesSchema.shape.options.unwrap().shape).toSorted()).toEqual(
      [...printOptionKeys].toSorted(),
    );
  });

  describe('reading', () => {
    it('lists every bound machine in one line each', async () => {
      const { client } = fixtureClient({
        entries: [fixtureEntry(), fixtureEntry({ machineId: 'machine-2', name: 'Mini', run: false })],
      });

      const result = await run(client, { toolName: 'list_machines', input: {} });

      expect(result).toEqual({
        isError: false,
        content:
          '- machine-1: Workshop X1C (Bambu Lab X1C), connected, active, run running 42%\n- machine-2: Mini (Bambu Lab X1C), connected, ready',
      });
    });

    it('describes the machine compactly: run, components, prompts, alerts and what the agent may do with each action', async () => {
      const entry = fixtureEntry({
        snapshot: {
          activities: [
            {
              activityId: 'activity-1',
              componentId: 'filament',
              kind: 'material.load',
              label: 'Load filament',
              state: 'needs-person',
              steps: [],
              awaiting: {
                kind: 'confirmation',
                promptId: 'prompt-1',
                label: 'Is filament coming out of the nozzle?',
                answers: [
                  { id: 'yes', label: 'Yes', role: 'confirm' },
                  { id: 'retry', label: 'Retry', role: 'retry' },
                ],
                effects: ['material'],
                safety: { authority: 'person', attended: true, interlocks: [] },
              },
            },
          ],
          alerts: [
            {
              code: '0300-8000',
              severity: 'serious',
              message: 'The nozzle may be clogged.',
              blocks: 'run',
              remedies: [{ type: 'person', instruction: 'Clean the nozzle.' }],
            },
          ],
        },
      });
      const { client } = fixtureClient({ entries: [entry] });

      const result = await run(client, { toolName: 'get_machine', input: {} });
      const text = result.content as string;

      expect(result.isError).toBe(false);
      expect(text).toContain('Workshop X1C (machine-1): Bambu Lab X1C, firmware 01.08.00.00. connected, active.');
      expect(text).toContain('Run run-1: pyramid.gcode.3mf running, 42%, Layer 50/125, about 1 h 5 min left.');
      expect(text).toContain('- chamber-light (light, Chamber light): off');
      expect(text).toContain('- filament (material-system, Filament): ams-a/a1 loaded PETG #FF0000FF');
      expect(text).toContain('asks "Is filament coming out of the nozzle?" (Yes / Retry), which a person answers');
      expect(text).toContain(
        '- serious 0300-8000: The nozzle may be clogged.; blocks run; clears with a person: Clean the nozzle.',
      );
      expect(text).toContain('- chamber-light switch.set {on: boolean}: Chamber light. You may use it now.');
      expect(text).toContain('- controller run.pause: Pause. The print pauses after the current move.');
      expect(text).toMatch(/- controller run.cancel: Cancel the print\. .* Needs a person’s approval; you may ask\./u);
      expect(text).toContain(
        '- part-fan level.set {ratio: number 1 0..4}: Part fan. Needs a person’s approval; you may ask.',
      );
      expect(text).toContain('- motion motion.home: Home. A person at the machine only.');
      expect(text).toContain(
        'Stop (stop_machine, always open to you): Leaves motion halts, heaters off, position kept; to recover: Home (machine_action motion motion.home).',
      );
      /* Compact text, not the entry. */
      expect(text.length).toBeLessThan(3000);
      expect(text).not.toContain('legacyProjection');
    });

    it('names the bound machines when the choice is missing, ambiguous or unknown', async () => {
      const { client } = fixtureClient({
        entries: [fixtureEntry(), fixtureEntry({ machineId: 'machine-2', name: 'Mini' })],
      });

      await expect(run(client, { toolName: 'get_machine', input: {} })).resolves.toMatchObject({
        isError: true,
        content: {
          message:
            'Several machines are bound; pass machineId. Bound machines: machine-1 (Workshop X1C), machine-2 (Mini).',
        },
      });
      await expect(run(client, { toolName: 'get_machine', input: { machineId: 'nope' } })).resolves.toMatchObject({
        isError: true,
        content: { message: expect.stringContaining('No machine nope is bound.') as string },
      });
    });

    it('captures a still without touching machine state', async () => {
      const fixture = fixtureClient();

      const result = await run(fixture.client, {
        toolName: 'capture_machine_still',
        input: { machineId: 'machine-1' },
      });

      expect(result).toMatchObject({ isError: false, content: { machineId: 'machine-1', byteLength: 4 } });
      expect(fixture.applyAction).not.toHaveBeenCalled();
    });
  });

  describe('machine_action', () => {
    const action = (componentId: string, id: string, parameters?: Record<string, JsonValue>) => ({
      toolName: 'machine_action',
      input: { componentId, action: id, ...(parameters === undefined ? {} : { parameters }) },
    });

    it("refuses a person's action without sending anything, saying a person must do it at the machine", async () => {
      const fixture = fixtureClient({ entries: [fixtureEntry({ run: false })] });
      const approve = approveWith('approved');

      const result = await run(fixture.client, { ...action('motion', 'motion.home'), approve });

      expect(result).toEqual({
        isError: false,
        content: {
          status: 'refused',
          message: 'Only a person at the machine can home. Ask the person to do it at the machine.',
        },
      });
      expect(approve).not.toHaveBeenCalled();
      expect(fixture.applyAction).not.toHaveBeenCalled();
    });

    it('refuses an action the machine cannot take now, with its reason', async () => {
      const fixture = fixtureClient({ entries: [fixtureEntry({ run: false })] });

      const result = await run(fixture.client, action('controller', 'run.pause'));

      expect(machineActionOutputSchema.parse(result.content)).toEqual({
        status: 'refused',
        message: 'Nothing was sent: Pause: only while a job runs.',
      });
      expect(fixture.applyAction).not.toHaveBeenCalled();
    });

    it('applies an unattended action at once, once, and says the machine showed it', async () => {
      const fixture = fixtureClient();
      const approve = approveWith('approved');

      const result = await run(fixture.client, { ...action('chamber-light', 'switch.set', { on: true }), approve });

      expect(result.content).toEqual({
        status: 'done',
        operationId: 'call-1',
        message: 'Workshop X1C shows Chamber light done.',
      });
      expect(approve).not.toHaveBeenCalled();
      expect(fixture.applyAction).toHaveBeenCalledExactlyOnceWith({
        machineId: 'machine-1',
        componentId: 'chamber-light',
        action: 'switch.set',
        version: 1,
        capabilityRevision: 'revision-1',
        expectedRunId: 'run-1',
        operationId: 'call-1',
        parameters: { on: true },
        requestedBy: { kind: 'agent', id: 'tau', label: 'Tau agent' },
        signal: expect.any(AbortSignal) as AbortSignal,
      });
      expect(fixture.reconcileOperation).toHaveBeenCalledWith({
        machineId: 'machine-1',
        operationId: 'call-1',
        signal: expect.any(AbortSignal) as AbortSignal,
      });
    });

    it('says an observed action is still confirming when the machine has not shown it, and never resends it', async () => {
      const fixture = fixtureClient({ operationState: 'confirming' });

      const result = await run(fixture.client, action('controller', 'run.pause'));

      expect(result.content).toMatchObject({
        status: 'confirming',
        message:
          'Workshop X1C took Pause and has not shown the change yet. Do not resend it; get_machine shows it when it does.',
      });
      expect(fixture.applyAction).toHaveBeenCalledTimes(1);
      expect(fixture.reconcileOperation.mock.calls.length).toBeGreaterThan(1);
    });

    it("pauses for the person's approval of exactly this intent, then applies it with that approval", async () => {
      const fixture = fixtureClient();
      const approve = approveWith('approved');

      const result = await run(fixture.client, { ...action('controller', 'run.cancel'), approve });

      expect(approve).toHaveBeenCalledExactlyOnceWith({
        key: 'action:machine-1:controller:run.cancel:{}',
        prompt:
          'Cancel the print on Workshop X1C? The print stops and cannot be resumed. Leaves motion halts, heaters off, position kept; to recover: Home (machine_action motion motion.home).',
        payload: expect.objectContaining({
          kind: 'machine-action',
          machineId: 'machine-1',
          componentId: 'controller',
          action: 'run.cancel',
          operationId: 'call-1',
          label: 'Cancel the print',
        }) as Record<string, unknown>,
      });
      expect(fixture.applyAction).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          operationId: 'call-1',
          expectedRunId: 'run-1',
          approval: { approvedBy: { kind: 'user', id: 'chat', label: 'Accepted in chat' }, operationId: 'call-1' },
        }),
      );
      /* Acknowledged, not observed: no watch. */
      expect(fixture.reconcileOperation).not.toHaveBeenCalled();
      expect(result.content).toEqual({
        status: 'done',
        operationId: 'call-1',
        message: 'Workshop X1C took Cancel the print.',
      });
    });

    it('sends nothing when the person declines', async () => {
      const fixture = fixtureClient();

      const result = await run(fixture.client, {
        ...action('controller', 'run.cancel'),
        approve: approveWith('denied'),
      });

      expect(result.content).toEqual({
        status: 'denied',
        message: 'The person declined Cancel the print on Workshop X1C.',
      });
      expect(fixture.applyAction).not.toHaveBeenCalled();
    });

    it('applies the recalled intent on the next attempt, with the operation id and run the person approved', async () => {
      const fixture = fixtureClient({
        entries: [fixtureEntry({ run: { ...fixtureEntry().snapshot.run!, runId: 'run-2' } })],
      });
      const intent = {
        machineId: 'machine-1',
        componentId: 'controller',
        action: 'run.cancel',
        version: 1,
        capabilityRevision: 'revision-1',
        expectedRunId: 'run-1',
        operationId: 'call-asked',
        parameters: {},
        label: 'Cancel the print',
        confirms: 'acknowledgement',
      };
      const approve = Object.assign(approveWith('approved'), {
        recall: vi.fn<NonNullable<NonNullable<HostToolInvocation['approve']>['recall']>>(async () => ({
          payload: { kind: 'machine-action', intent },
          resolution: { interruptId: 'interrupt-1', outcome: 'approved' },
        })),
      });

      await run(fixture.client, { ...action('controller', 'run.cancel'), approve });

      expect(approve).not.toHaveBeenCalled();
      /* The run the person saw, so the host refuses it against the new run rather than cancelling that. */
      expect(fixture.applyAction).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          operationId: 'call-asked',
          expectedRunId: 'run-1',
          approval: { approvedBy: { kind: 'user', id: 'chat', label: 'Accepted in chat' }, operationId: 'call-asked' },
        }),
      );
    });

    it('tells an external agent that an approval-required action is for a person in Tau', async () => {
      const fixture = fixtureClient();

      const result = await run(fixture.client, action('part-fan', 'level.set', { ratio: 0.5 }));

      expect(result.content).toEqual({
        status: 'needs-approval',
        message:
          "Part fan on Workshop X1C needs a person's approval, which only Tau can ask for. Ask the person to do it in Tau.",
      });
      expect(fixture.applyAction).not.toHaveBeenCalled();
    });

    it('refuses parameters that do not fit before asking anyone', async () => {
      const fixture = fixtureClient();
      const approve = approveWith('approved');

      const result = await run(fixture.client, { ...action('part-fan', 'level.set', { ratio: 9 }), approve });

      expect(result.content).toMatchObject({
        status: 'refused',
        message: expect.stringContaining('Nothing was sent: the parameters do not fit Part fan.') as string,
      });
      expect(approve).not.toHaveBeenCalled();
      expect(fixture.applyAction).not.toHaveBeenCalled();
    });

    it("reports the machine's refusal and an unknown receipt without resending", async () => {
      const fixture = fixtureClient();
      fixture.applyAction.mockResolvedValueOnce({
        operationId: 'call-1',
        machineId: 'machine-1',
        kind: 'action',
        observedAt: '2026-10-05T00:00:00.000Z',
        status: 'rejected',
        code: 'MACHINE_ACTION_CAPABILITIES_CHANGED',
        message: 'The machine changed since you looked.',
      });
      fixture.applyAction.mockResolvedValueOnce({
        operationId: 'call-1',
        machineId: 'machine-1',
        kind: 'action',
        observedAt: '2026-10-05T00:00:00.000Z',
        status: 'unknown',
        reason: 'The connection dropped',
      });

      await expect(run(fixture.client, action('controller', 'run.pause'))).resolves.toMatchObject({
        content: { status: 'rejected', message: 'Workshop X1C refused Pause: The machine changed since you looked.' },
      });
      await expect(run(fixture.client, action('controller', 'run.pause'))).resolves.toMatchObject({
        content: { status: 'unknown', message: expect.stringContaining('Do not resend it') as string },
      });
    });
  });

  describe('stop_machine', () => {
    it('stops at once with no approval, and says what the machine is left doing', async () => {
      const fixture = fixtureClient();
      const approve = approveWith('denied');

      const result = await run(fixture.client, { toolName: 'stop_machine', input: {}, approve });

      expect(approve).not.toHaveBeenCalled();
      expect(fixture.stop).toHaveBeenCalledExactlyOnceWith({
        machineId: 'machine-1',
        operationId: 'call-1',
        requestedBy: { kind: 'agent', id: 'tau', label: 'Tau agent' },
        signal: expect.any(AbortSignal) as AbortSignal,
      });
      expect(result.content).toEqual({
        status: 'done',
        operationId: 'call-1',
        message:
          'Workshop X1C took the stop. Leaves motion halts, heaters off, position kept; to recover: Home (machine_action motion motion.home).',
      });
    });
  });

  describe('request_job', () => {
    it('requests one job, pauses on the approval, and approves it when the person accepts in chat', async () => {
      const fixture = fixtureClient();
      const approve = approveWith('approved');

      const result = await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' }, approve });

      expect(fixture.requestJob).toHaveBeenCalledExactlyOnceWith({
        machineId: 'machine-1',
        artifact: fixtureArtifact,
        configuration: { expectedBedType: 'textured-pei' },
        requestedBy: { kind: 'agent', id: 'tau', label: 'Tau agent' },
        program: expect.objectContaining({ name: 'pyramid.gcode.3mf' }) as Record<string, unknown>,
        jobId: 'call-1',
        signal: expect.any(AbortSignal) as AbortSignal,
      });
      expect(approve).toHaveBeenCalledExactlyOnceWith({
        key: 'job:machine-1:main.ts',
        prompt: 'Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 1 h 5 min.',
        payload: {
          kind: 'job',
          jobId: 'call-1',
          machineId: 'machine-1',
          fileName: 'pyramid.gcode.3mf',
          artifactDigest: fixtureArtifact.digest,
        },
      });
      expect(fixture.resolveJob).toHaveBeenCalledExactlyOnceWith({
        jobId: 'call-1',
        decision: 'approve',
        resolvedBy: { kind: 'user', id: 'chat', label: 'Accepted in chat' },
        attestations: [],
        transferOperationId: 'call-1:transfer',
        startOperationId: 'call-1:start',
        signal: expect.any(AbortSignal) as AbortSignal,
      });
      expect(requestJobOutputSchema.parse(result.content)).toMatchObject({
        job: { jobId: 'call-1', state: 'transferring' },
        machineName: 'Workshop X1C',
        approval: 'approved',
      });
    });

    it('leaves a job awaiting the Print pane when the person must confirm what only they can, even after a chat approval', async () => {
      const fixture = fixtureClient({
        entries: [fixtureEntry({ attestations: [{ id: 'work-area-clear', label: 'The build plate is clear' }] })],
      });
      const approve = approveWith('approved');

      const result = await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' }, approve });

      expect(approve.mock.calls[0]![0].prompt).toBe(
        'Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 1 h 5 min. Accept it in the Print pane, confirming: The build plate is clear.',
      );
      expect(fixture.resolveJob).not.toHaveBeenCalled();
      expect(result.content).toMatchObject({
        job: { state: 'awaiting-approval' },
        nextStep: expect.stringContaining(
          "Waiting for a person to accept job call-1 in Tau's Print pane, where they confirm: The build plate is clear;",
        ) as string,
      });
    });

    it.each([
      ['denied', 'denied'],
      ['cancelled', 'withdrawn'],
    ] as const)('settles the job %s by the answer, without the call signal', async (outcome, state) => {
      const fixture = fixtureClient();

      const result = await run(fixture.client, {
        toolName: 'request_job',
        input: { targetFile: 'main.ts' },
        approve: approveWith(outcome),
      });

      expect(result.content).toMatchObject({ job: { state }, approval: outcome });
      const [call] = (outcome === 'denied' ? fixture.resolveJob : fixture.withdrawJob).mock.calls[0]!;
      expect(call).not.toHaveProperty('signal');
    });

    it('returns the job awaiting approval with a next step to an external agent', async () => {
      const fixture = fixtureClient();

      const result = await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' } });

      expect(result.content).toMatchObject({
        job: { state: 'awaiting-approval' },
        nextStep: expect.stringContaining('Do not retry; get_machine shows the job.') as string,
      });
      expect(fixture.requestJob.mock.calls[0]![0].requestedBy).toEqual({
        kind: 'agent',
        id: 'external-agent',
        label: 'External agent',
      });
    });

    it('refuses options outside the reference keys before slicing', async () => {
      const fixture = fixtureClient();
      planPrint.mockClear();

      const result = await run(fixture.client, {
        toolName: 'request_job',
        input: { targetFile: 'main.ts', options: { service: { url: 'https://slicer.example.com' } } },
      });

      expect(result).toMatchObject({
        isError: true,
        content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED', message: expect.stringContaining('"service"') as string },
      });
      expect(planPrint).not.toHaveBeenCalled();
    });

    it('settles a job handed over from chat once, and leaves a settled one alone', async () => {
      const fixture = fixtureClient();
      await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' } });
      const registry = createMachineToolRegistry(fixture.client, { planPrint });
      const answer: HostToolApprovalAnswer = {
        toolName: 'request_job',
        payload: { kind: 'job', jobId: 'call-1', machineId: 'machine-1' },
        resolution: { interruptId: 'interrupt-1', outcome: 'denied' },
      };

      await registry.answerApproval?.(answer);
      await registry.answerApproval?.(answer);

      expect(fixture.jobs.get('call-1')?.state).toBe('denied');
      expect(fixture.resolveJob).toHaveBeenCalledTimes(1);
    });

    it.each([
      [{ state: 'started', run: { runId: 'run-1', outcome: 'running' } }, 'is running on Workshop X1C'],
      [{ state: 'started', run: { runId: 'run-1', outcome: 'completed' } }, 'has ended: completed'],
      [{ state: 'started' }, 'has not reported the run since'],
      [{ state: 'awaiting-start' }, "a person starts it with the machine's own start"],
      [{ state: 'unknown' }, 'whether it runs is unknown'],
      [{ state: 'failed', failure: { code: 'X', message: 'Out of filament.' } }, '"Out of filament."'],
    ] as const)('says what to do next for a job %o', async (patch, phrase) => {
      const fixture = fixtureClient();
      await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' } });
      fixture.jobs.set('call-1', { ...fixture.jobs.get('call-1')!, ...patch });

      const result = await run(fixture.client, { toolName: 'get_machine', input: {} });

      expect(result.content).toContain(`- call-1 pyramid.gcode.3mf: ${patch.state}.`);
      expect(result.content).toContain(phrase);
    });
  });

  describe('check_job', () => {
    it('slices and asks the machine, recording nothing, with the failing checks and their remedies', async () => {
      const fixture = fixtureClient();

      const result = await run(fixture.client, { toolName: 'check_job', input: { targetFile: 'main.ts' } });

      expect(fixture.checkJob).toHaveBeenCalledExactlyOnceWith({
        machineId: 'machine-1',
        artifact: fixtureArtifact,
        configuration: { expectedBedType: 'textured-pei' },
        signal: expect.any(AbortSignal) as AbortSignal,
      });
      expect(fixture.requestJob).not.toHaveBeenCalled();
      expect(checkJobOutputSchema.parse(result.content)).toEqual({
        status: 'blocked',
        program: { name: 'pyramid.gcode.3mf', facts: { process: 'fff', layers: 125 } },
        checks: [
          {
            id: 'filament',
            label: 'Filament',
            state: 'blocked',
            detail: 'No PLA is loaded.',
            remedy: 'a person: Load PLA.',
          },
        ],
      });
    });
  });

  describe('under a Tau agent host', () => {
    let directory: string | undefined;
    afterEach(async () => {
      if (directory !== undefined) {
        await rm(directory, { recursive: true, force: true });
        directory = undefined;
      }
    });

    const pausedOn = async (
      call: Readonly<{ id: string; name: string; input: JsonValue }>,
      continued: readonly ScriptedResponse[] = [{ text: 'Done.' }],
    ) => {
      directory = await mkdtemp(join(tmpdir(), 'tau-machine-tools-'));
      const logPath = join(directory, 'events.jsonl');
      const fixture = fixtureClient();
      const registry = createMachineToolRegistry(fixture.client, {
        planPrint,
        machineSettings: emptySettings,
        confirmation: { pollInterval: 1, pollTimeout: 5 },
      });
      const transport = scriptedTransport([{ toolCalls: [call] }, ...continued]);
      let tick = 0;
      let id = 0;
      const host = createTauAgentHost({
        systemPrompt: 'You are the machine fixture.',
        model: { id: 'scripted-machine-model', contextWindow: 200_000 },
        modelTransport: transport,
        toolRegistry: registry,
        placement: placementOver(registry),
        openEventLog: async () => createNodeEventLog({ filePath: logPath, access: 'write' }),
        createId: () => `machine-${String(id++)}`,
        createLeaderEpoch: () => `epoch-${String(id++)}`,
        now: () => new Date(Date.UTC(2026, 9, 5, 0, 0, tick++)),
      });
      await host.admit({
        chatId: 'chat-machine',
        runId: 'run-machine',
        trigger: 'submit',
        message: { id: 'turn-machine', role: 'user', content: 'Do it.' },
      });
      const [pending] = await host.pendingInterrupts('run-machine');
      return { fixture, host, transport, interruptId: pending!.interruptId };
    };

    it('cancels the run only after the person approves in chat, once', async () => {
      const cancel = {
        id: 'call-cancel',
        name: 'machine_action',
        input: { componentId: 'controller', action: 'run.cancel' },
      };
      const { fixture, host, transport, interruptId } = await pausedOn(cancel, [
        { toolCalls: [{ ...cancel, id: 'call-cancel-again' }] },
        { text: 'Cancelled.' },
      ]);
      expect(fixture.applyAction).not.toHaveBeenCalled();

      await host.resolveInterrupt({ runId: 'run-machine', interruptId, outcome: 'approved' });
      await host.resume('chat-machine');

      expect(fixture.applyAction).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          operationId: 'call-cancel',
          approval: expect.objectContaining({ operationId: 'call-cancel' }) as Record<string, unknown>,
        }),
      );
      expect(JSON.stringify(transport.requests.at(-1)?.messages)).toContain('Workshop X1C took Cancel the print.');
      await host.close();
    });

    it('denies the job, not withdraws it, when the person declines in chat', async () => {
      const { fixture, host, interruptId } = await pausedOn({
        id: 'call-print',
        name: 'request_job',
        input: { targetFile: 'main.ts' },
      });
      expect(fixture.jobs.get('call-print')?.state).toBe('awaiting-approval');

      await host.resolveInterrupt({ runId: 'run-machine', interruptId, outcome: 'denied' });

      await vi.waitFor(() => {
        expect(fixture.jobs.get('call-print')?.state).toBe('denied');
      });
      expect(fixture.withdrawJob).not.toHaveBeenCalled();
      await host.close();
    });
  });

  describe('get_print_profiles', () => {
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
    const engine = () => ({
      findBambuStudio: vi.fn<BambuStudioEngine['findBambuStudio']>(async () => install),
      loadBambuStudioCatalog: vi.fn<BambuStudioEngine['loadBambuStudioCatalog']>(async () => catalog),
      describeBambuStudioSettings: vi.fn<BambuStudioEngine['describeBambuStudioSettings']>(async () => ({
        schema: { properties: {} },
        values: {},
        groups: [],
      })),
    });
    const profilesOf = async (
      bambuStudio: BambuStudioEngine,
      entries?: readonly MachineDirectoryEntry[],
      provider?: MachineProvider,
    ) => {
      const { client } = fixtureClient({
        ...(entries === undefined ? {} : { entries }),
        ...(provider === undefined ? {} : { providers: [provider] }),
      });
      return createMachineToolRegistry(client, { bambuStudio, machineSettings: emptySettings }).invoke({
        toolCallId: 'call-1',
        toolName: 'get_print_profiles',
        input: {},
        signal: new AbortController().signal,
      });
    };

    it('picks defaults from the reported tray, nozzle and plate', async () => {
      const bambuStudio = engine();

      const result = await profilesOf(bambuStudio);

      expect(getPrintProfilesOutputSchema.parse(result.content)).toMatchObject({
        engine: 'bambu-studio',
        defaults: {
          printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
          process: '0.20mm Standard @BBL X1C',
          filaments: ['Bambu PETG Basic @BBL X1C'],
          plate: 'textured-pei',
        },
      });
      expect(bambuStudio.loadBambuStudioCatalog).toHaveBeenCalledWith(install, { model: 'X1C', nozzleDiameter: 0.4 });
    });

    it('does not default a plate the printer does not report', async () => {
      const result = await profilesOf(engine(), [fixtureEntry({ plate: false })]);

      expect((result.content as { defaults: Record<string, unknown> }).defaults).not.toHaveProperty('plate');
    });

    it('names the reference engine for another vendor', async () => {
      const bambuStudio = engine();
      const other: MachineProvider = { ...fixtureProvider(), vendor: 'Prusa Research' };

      await expect(profilesOf(bambuStudio, undefined, other)).resolves.toMatchObject({
        content: { engine: 'reference', reason: expect.stringContaining('not a Bambu printer') as string },
      });
      expect(bambuStudio.findBambuStudio).not.toHaveBeenCalled();
    });
  });
});

describe('request_job slicer options through the chat registry', () => {
  const cube = {
    name: 'cube.glb',
    mimeType: 'model/gltf-binary',
    bytes: Uint8Array.from(
      readFileSync(new URL('../../../../packages/plugins/slicer/src/__fixtures__/cube.glb', import.meta.url)),
    ),
  } as const;
  /* Not a Bambu vendor, so the reference engine slices and no host Bambu Studio is looked for. */
  const provider: MachineProvider = { ...fixtureProvider(fixtureManifest()), vendor: 'Fixture' };

  const printHost = async (files: Readonly<Record<string, string>> = {}) => {
    const definition = await resolveRuntimePluginDefinition('transcoder', slicerTranscoder());
    const transcoderRuntime = mock<TranscoderServices>({
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      tracer: { startSpan: vi.fn(() => ({ end: vi.fn() })) },
      signal: new AbortController().signal,
    });
    const slicerContext = await definition.initialize({}, transcoderRuntime);
    const exportModel = vi.fn<RpcGraphicsClient['exportModel']>(async ({ options }) => {
      const result = await definition.transcode(
        { from: 'glb', to: 'gcode.3mf', files: [cube], options: slicerOptionsSchema.parse(options ?? {}) },
        transcoderRuntime,
        slicerContext,
      );
      return result.success
        ? { success: true, exportId: 'gcode.3mf', files: result.data, issues: result.issues }
        : { success: false, errorCode: 'UNKNOWN', message: result.issues.map((issue) => issue.message).join('; ') };
    });
    const machines = fixtureClient({ providers: [provider] });
    const filesystem = new MemoryProvider();
    const recordView = composeView({ filesystem }, { consumer: 'user', policy: tauPathPolicy });
    const mutations = new ResourceQueue();
    const registry = createChatToolRegistry({
      fileSystemFor: await agentProject(files, filesystem),
      machineSettings: await agentSettings({}, filesystem),
      recordFileSystemFor: (signal) => createProviderRpcFileSystem({ provider: recordView, mutations, signal }),
      graphics: { exportModel },
      machines: { available: true, ...machines.client },
      print: { projectId, readArtifact: async ({ path }) => recordView.readFile(assertRootedPath(path)) },
      testingEnabled: false,
    });
    const requestJob = async (toolCallId: string, input: JsonValue) =>
      registry.invoke({ toolCallId, toolName: 'request_job', input, signal: new AbortController().signal });
    return { exportModel, machines, registry, requestJob };
  };

  it("should hand the chat's answer to request_job through the composed registry", async () => {
    const host = await printHost();
    await host.requestJob('call-answered', { targetFile: 'main.ts' });

    await host.registry.answerApproval?.({
      toolName: 'request_job',
      payload: { kind: 'job', jobId: 'call-answered' },
      resolution: { interruptId: 'interrupt-1', outcome: 'denied' },
    });

    expect(host.machines.jobs.get('call-answered')?.state).toBe('denied');
  });

  it("should hand runtime.export exactly the preset and options the agent chose, over the machine's own", async () => {
    const host = await printHost();

    const result = await host.requestJob('call-fine', { targetFile: 'main.ts', preset: 'fine', options: { walls: 3 } });

    expect(result).toMatchObject({ isError: false, content: { job: { state: 'awaiting-approval' } } });
    expect(host.machines.requestJob.mock.calls[0]![0].artifact).toMatchObject({
      projectId,
      path: expect.stringMatching(/^\.tau\/artifacts\/call-fine__/u) as string,
      mediaType: 'application/vnd.bambulab.gcode-3mf',
    });
    expect(host.machines.requestJob.mock.calls[0]![0].configuration).toMatchObject({
      expectedModel: 'X1C',
      expectedBedType: 'textured-pei',
      expectedMaterials: [{ slot: 0, materialId: 'PETG' }],
      amsMapping: [0],
      expectedNozzleDiameter: 0.4,
      expectedFilamentDiameter: 1.75,
    });
    expect(host.exportModel).toHaveBeenCalledExactlyOnceWith(
      {
        targetFile: 'main.ts',
        to: 'gcode.3mf',
        options: {
          plate: 'textured-pei',
          nozzleDiameter: 0.4,
          filamentDiameter: 1.75,
          nozzleTemperature: 250,
          bedTemperature: 70,
          walls: 3,
          preset: 'fine',
        },
      },
      { signal: expect.any(AbortSignal) as AbortSignal },
    );
  });

  it("should slice with the project's print intent under the agent's own options, and say which values it used", async () => {
    const host = await printHost(printerFile({ preset: 'fine', options: { walls: 4, infillPercent: 30 } }));

    const result = await host.requestJob('call-intent', { targetFile: 'main.ts', options: { walls: 3 } });

    expect(requestJobOutputSchema.parse(result.content)).toMatchObject({
      job: { state: 'awaiting-approval' },
      machinePreferences: { path: settingsPath, applied: { preset: 'fine', options: { infillPercent: 30 } } },
    });
  });

  it('should record more layers for a fine print of the cube than a fast one', async () => {
    const host = await printHost();

    await host.requestJob('call-fast', { targetFile: 'main.ts', preset: 'fast' });
    await host.requestJob('call-fine', { targetFile: 'main.ts', preset: 'fine' });

    expect(host.machines.jobs.get('call-fast')?.program.facts).toMatchObject({ process: 'fff', layers: 72 });
    expect(host.machines.jobs.get('call-fine')?.program.facts).toMatchObject({ process: 'fff', layers: 167 });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End Bambu wire-key fixtures. */
