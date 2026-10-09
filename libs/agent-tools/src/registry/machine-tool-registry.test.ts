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
  fixtureRun,
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
  /** What the person's own session records for a job, before the interrupt is answered. */
  person: (jobId: string, decision: 'approve' | 'deny') => MachineJob;
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
  /* The agent's session, as the host grants it: deciding a job is a person's alone (R16). */
  const resolveJob = vi.fn<MachineClient['resolveJob']>(async () => {
    throw new Error('ROUTE_DENIED');
  });
  /* What the person's own session records from the chat banner or the Print pane, before the interrupt is answered. */
  const person = (jobId: string, decision: 'approve' | 'deny'): MachineJob =>
    update(jobId, {
      state: decision === 'approve' ? 'transferring' : 'denied',
      resolvedBy: { kind: 'user', id: 'operator', label: 'You' },
    });
  const withdrawJob = vi.fn<MachineClient['withdrawJob']>(async (request) =>
    update(request.jobId, { state: 'withdrawn', resolvedBy: request.resolvedBy }),
  );
  /* The provider completes nothing here: the completed configuration is what the call chose. */
  const checkJob = vi.fn<MachineClient['checkJob']>(async (request) => ({
    status: 'blocked',
    configuration: request.configuration,
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
    /* A person's surface records approvals; the agent's tools never call it. */
    approveAction: unused,
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
    person,
  };
};

/** Every machine tool, in listing order; the job tools need a planner. */
const machineToolNames = [
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

const approveWith = (outcome: InterruptResolution['outcome'], before?: () => void) =>
  vi.fn<NonNullable<HostToolInvocation['approve']>>(async () => {
    before?.();
    return { interruptId: 'interrupt-1', outcome };
  });

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

  it('offers the job tools for finished programs on a host that cannot slice, and refuses a targetFile there', async () => {
    const fixture = fixtureClient();
    const registry = createChatToolRegistry({
      fileSystemFor: () => {
        throw new Error('not used');
      },
      machines: { available: true, ...fixture.client },
      machineSettings: emptySettings,
      /* No graphics client, so no export route to slice through. */
      print: { projectId, readArtifact: async () => Uint8Array.from([1, 2, 3]) },
      testingEnabled: false,
    });
    const check = async (input: JsonValue) =>
      registry.invoke({ toolCallId: 'call-1', toolName: 'check_job', input, signal: new AbortController().signal });

    expect(registry.list().map(({ name }) => name)).toEqual(expect.arrayContaining(['request_job', 'check_job']));
    await expect(check({ artifact: '.tau/artifacts/call-0/pyramid.gcode.3mf' })).resolves.toMatchObject({
      isError: false,
    });
    expect(fixture.checkJob).toHaveBeenCalledTimes(1);
    await expect(check({ targetFile: 'main.ts' })).resolves.toEqual({
      isError: true,
      content: {
        errorCode: 'MACHINE_TOOL_ERROR',
        message: 'This host cannot slice; name a finished program with artifact.',
      },
    });
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

  it('should offer no raw program, command or script input to the agent', () => {
    const definitions = createMachineToolRegistry(fixtureClient().client, { planPrint }).list();
    const propertyNames = (schema: unknown): string[] =>
      typeof schema === 'object' && schema !== null
        ? Object.entries(schema as Readonly<Record<string, unknown>>).flatMap(([key, value]) => [
            ...(key === 'properties' && typeof value === 'object' && value !== null ? Object.keys(value) : []),
            ...propertyNames(value),
          ])
        : [];

    expect(definitions.flatMap(({ inputSchema }) => propertyNames(inputSchema))).not.toContainEqual(
      expect.stringMatching(/gcode|command|raw|script/iu) as string,
    );
  });

  it('should describe each machine tool exactly so', () => {
    const definitions = createMachineToolRegistry(fixtureClient().client, { planPrint }).list();

    expect(Object.fromEntries(definitions.map(({ name, description }) => [name, description]))).toMatchInlineSnapshot(`
      {
        "capture_machine_still": "Capture one authenticated, rate-limited, short-lived bounded still without changing machine or run state.",
        "check_job": "Prepare exactly as request_job would (slice targetFile, or read artifact) and ask the machine whether it is ready for the program: ready, blocked (with the checks that fail and their remedies) or refused. Records no job and sends nothing to the machine.",
        "get_machine": "Read one bound machine as it last reported: state, run and progress, components, activities and the questions they ask, alerts and checks with remedies, recent jobs and operations, what stop does, and every declared action with its parameters, what it does, who may use it and whether you may use it now. Read-only.

      Read it before machine_action, and to follow an action or a job. Omit machineId when exactly one machine is bound.",
        "get_print_profiles": "List the slicing presets and settings request_job can use for a bound machine with an fff process (a 3D printer); other machines take a finished program and have none. Read-only.

      For a Bambu printer with Bambu Studio available it returns engine "bambu-studio": defaults (the presets chosen from the printer's model, nozzle, loaded filament and reported plate), the compatible printers, processes and filaments (source "user" marks the person's own), plates, and every setting's current value by group with enum choices. Pass profiles to read another selection, and keys for full descriptors. Otherwise it returns engine "reference" and why. The project's .tau/machines/settings/<typeId>.json keeps named profiles shared by machines of that type; savedProfiles lists their ids and the active one. Pass profileId to read another without changing the selection. machinePreferences reports the profile and source versions used; request_job arguments override its sparse values.",
        "list_machines": "List every machine bound on this computer, one line each: id, name, model, connection, state and any run. Read-only.",
        "machine_action": "Apply one declared action that get_machine lists, by componentId, action and parameters.

      An action you may use now runs at once; one that needs approval pauses for the person to approve exactly this request in a Tau chat, and elsewhere returns needs-approval for the person to do it in Tau; one only a person at the machine may use is refused with what the person must do. Report the message as it states it. Never resend an action that is confirming or unknown, and never work around a refusal with other tools. To halt the machine, use stop_machine.",
        "request_job": "The only way to start a program on a machine. Name targetFile, a CAD source Tau slices (3D printers only), or artifact, a finished program in the project run as is (get_machine lists what the machine accepts). Nothing starts until a person accepts. A Tau-hosted turn waits for the answer; otherwise, or when only the person can confirm something, the job awaits approval in Tau's Print pane. Report the outcome as nextStep states it; an unconfirmed start is unknown, never "started". Request a job once; after an approval reminder, repeat the same call to read the answer.

      For targetFile, first run test_model, fit get_machine's build volume and read get_print_profiles. When get_machine reports no plate, ask which is installed and pass plate. Under engine "bambu-studio" use bambuStudio.profiles and .settings as get_print_profiles names them; under the reference engine options accept only layerHeight, walls, infillPercent, infillPattern, supports, nozzleTemperature, bedTemperature, printSpeed, travelSpeed.",
        "stop_machine": "Stop the machine now: its fastest halt, open to you at any time without approval, and not an emergency stop. Returns what the machine is left doing and how a person recovers it. To pause a run that can continue, use machine_action with run.pause.",
      }
    `);
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

    it('tells the agent where the person adds a machine when none is bound', async () => {
      const { client } = fixtureClient({ entries: [] });

      const result = await run(client, { toolName: 'list_machines', input: {} });

      expect(result.content).toBe('No machine is bound on this computer; the person adds one in Settings › Machines.');
    });

    it('says a simulator is simulated wherever the agent or the person reads about it', async () => {
      const fixture = fixtureClient({ entries: [fixtureEntry({ simulated: true })] });
      const approve = approveWith('denied');

      const listed = await run(fixture.client, { toolName: 'list_machines', input: {} });
      const described = await run(fixture.client, { toolName: 'get_machine', input: {} });
      const requested = await run(fixture.client, {
        toolName: 'request_job',
        input: { targetFile: 'main.ts' },
        approve,
      });
      const checked = await run(fixture.client, { toolName: 'check_job', input: { targetFile: 'main.ts' } });
      const actionApproval = approveWith('denied');
      await run(fixture.client, {
        toolName: 'machine_action',
        input: { componentId: 'controller', action: 'run.cancel' },
        approve: actionApproval,
      });

      expect(listed.content).toBe(
        '- machine-1: Workshop X1C (Bambu Lab X1C) (simulated, no machine attached), connected, active, run running 42%',
      );
      expect(described.content).toContain(
        'Workshop X1C (machine-1): Bambu Lab X1C (simulated, no machine attached), firmware 01.08.00.00.',
      );
      expect(approve.mock.calls[0]?.[0].prompt).toBe(
        'Simulated: Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 1 h 5 min.',
      );
      expect(actionApproval.mock.calls[0]?.[0].prompt).toMatch(/^Simulated: Cancel the print on Workshop X1C\?/u);
      expect(requestJobOutputSchema.parse(requested.content)).toMatchObject({ simulated: true });
      expect(checkJobOutputSchema.parse(checked.content)).toMatchObject({ simulated: true });
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
      /* What request_job checks a model against and names a plate by. */
      expect(text).toContain('Process fff: build volume 256×256×256 mm; plates textured-pei, cool.');
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
      expect(text).toContain(
        'Jobs (request_job): accepts additive.fff (application/vnd.bambulab.gcode-3mf); sent whole, then started by Tau once a person accepts it.',
      );
      /* Compact text, not the entry. */
      expect(text.length).toBeLessThan(3000);
      expect(text).not.toContain('legacyProjection');
    });

    it('names Stop and what it costs when only Stop clears an alert', async () => {
      const entry = fixtureEntry({
        snapshot: {
          alerts: [
            {
              code: 'spindle.timed',
              message: 'The spindle runs until its timer ends.',
              blocks: 'run',
              remedies: [{ type: 'stop', consequence: 'Home the machine afterwards.' }],
            },
          ],
        },
      });
      const { client } = fixtureClient({ entries: [entry] });

      const result = await run(client, { toolName: 'get_machine', input: {} });

      expect(result.content).toContain(
        '- alert spindle.timed: The spindle runs until its timer ends.; blocks run; clears with Stop the machine (stop_machine): Home the machine afterwards.',
      );
    });

    it.each([
      ['3', 'about 1 h 5 min left.'],
      ['Heating the bed', 'about 1 h 5 min left; Heating the bed.'],
    ])('leaves out a bare vendor stage number but keeps a stage in words: %s', async (stage, line) => {
      const { client } = fixtureClient({ entries: [fixtureEntry({ run: { ...fixtureRun, stage } })] });

      const result = await run(client, { toolName: 'get_machine', input: {} });

      expect(result.content).toContain(line);
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
          code: 'MACHINE_ACTION_PERSON_REQUIRED',
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
        code: 'MACHINE_ACTION_PRECONDITION_FAILED',
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
        }),
      );
      /* The person's Approve recorded the approval on the host (R15); the agent's request claims none. */
      expect(fixture.applyAction.mock.calls[0]?.[0]).not.toHaveProperty('approval');
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
        message: 'The person declined Cancel the print on Workshop X1C. Do not retry it unless they ask.',
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
        }),
      );
      expect(fixture.applyAction.mock.calls[0]?.[0]).not.toHaveProperty('approval');
    });

    it('sends nothing for a recalled approval whose intent cannot be read back, and asks again', async () => {
      const fixture = fixtureClient();
      const approve = Object.assign(approveWith('approved'), {
        recall: vi.fn<NonNullable<NonNullable<HostToolInvocation['approve']>['recall']>>(async () => ({
          /* Written by an older registry: no capability revision or run. */
          payload: { kind: 'machine-action', intent: { machineId: 'machine-1', operationId: 'call-asked' } },
          resolution: { interruptId: 'interrupt-1', outcome: 'approved' },
        })),
      });

      const result = await run(fixture.client, { ...action('controller', 'run.cancel'), approve });

      expect(result.content).toMatchObject({ status: 'refused', code: 'MACHINE_ACTION_APPROVAL_REQUIRED' });
      expect(fixture.applyAction).not.toHaveBeenCalled();
    });

    /* A provider's descriptor below its standard family's floor: the host admits at the floor, so the person is asked. */
    it('asks the person when the host needs an approval the directory did not show, then sends the same request', async () => {
      const fixture = fixtureClient();
      fixture.applyAction.mockResolvedValueOnce({
        operationId: 'call-1',
        machineId: 'machine-1',
        kind: 'action',
        observedAt: fixtureTimestamp,
        status: 'rejected',
        code: 'MACHINE_ACTION_APPROVAL_REQUIRED',
        message: 'A person must approve “Chamber light” in Tau first.',
      });
      const approve = approveWith('approved');

      const result = await run(fixture.client, { ...action('chamber-light', 'switch.set', { on: true }), approve });

      expect(approve).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          key: 'action:machine-1:chamber-light:switch.set:{"on":true}',
          payload: expect.objectContaining({ operationId: 'call-1' }) as Record<string, unknown>,
        }),
      );
      expect(fixture.applyAction.mock.calls.map(([request]) => request.operationId)).toEqual(['call-1', 'call-1']);
      expect(result.content).toMatchObject({ status: 'done', operationId: 'call-1' });
    });

    it('asks the person to approve it in Tau when the host holds no approval for the request', async () => {
      const fixture = fixtureClient();
      fixture.applyAction.mockResolvedValueOnce({
        operationId: 'call-1',
        machineId: 'machine-1',
        kind: 'action',
        observedAt: fixtureTimestamp,
        status: 'rejected',
        code: 'MACHINE_ACTION_APPROVAL_REQUIRED',
        message: 'No approval is recorded for this request.',
      });

      const result = await run(fixture.client, {
        ...action('controller', 'run.cancel'),
        approve: approveWith('approved'),
      });

      expect(result.content).toEqual({
        status: 'needs-approval',
        operationId: 'call-1',
        code: 'MACHINE_ACTION_APPROVAL_REQUIRED',
        message:
          "Cancel the print on Workshop X1C needs a person's approval, which Tau has not recorded. Ask the person to approve it in Tau.",
      });
    });

    it('sends nothing after the person declined, on the next attempt either', async () => {
      const fixture = fixtureClient();
      const approve = Object.assign(approveWith('approved'), {
        recall: vi.fn<NonNullable<NonNullable<HostToolInvocation['approve']>['recall']>>(async () => ({
          payload: { kind: 'machine-action' },
          resolution: { interruptId: 'interrupt-1', outcome: 'denied' },
        })),
      });

      const result = await run(fixture.client, { ...action('controller', 'run.cancel'), approve });

      expect(result.content).toMatchObject({ status: 'denied' });
      expect(approve).not.toHaveBeenCalled();
      expect(fixture.applyAction).not.toHaveBeenCalled();
    });

    it('never says the person declined an approval the stopped turn cancelled', async () => {
      const fixture = fixtureClient();
      const cancelled = {
        status: 'refused',
        message:
          'Nothing was sent: the chat turn stopped before the person answered whether to do run.cancel on Workshop X1C. Ask again only if they still want it.',
      };
      const approve = Object.assign(approveWith('approved'), {
        recall: vi.fn<NonNullable<NonNullable<HostToolInvocation['approve']>['recall']>>(async () => ({
          payload: { kind: 'machine-action' },
          resolution: { interruptId: 'interrupt-1', outcome: 'cancelled' },
        })),
      });

      const recalled = await run(fixture.client, { ...action('controller', 'run.cancel'), approve });
      const asked = await run(fixture.client, {
        ...action('controller', 'run.cancel'),
        approve: approveWith('cancelled'),
      });

      expect(recalled.content).toEqual(cancelled);
      expect(asked.content).toMatchObject({
        status: 'refused',
        message: expect.stringContaining('Cancel the print on Workshop X1C') as string,
      });
      expect(fixture.applyAction).not.toHaveBeenCalled();
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
        content: {
          status: 'rejected',
          code: 'MACHINE_ACTION_CAPABILITIES_CHANGED',
          message: 'Workshop X1C refused Pause: The machine changed since you looked.',
        },
      });
      await expect(run(fixture.client, action('controller', 'run.pause'))).resolves.toMatchObject({
        content: { status: 'unknown', message: expect.stringContaining('Do not resend it') as string },
      });
    });

    it.each([
      {
        name: 'a light level the agent may set',
        entry: fixtureEntry(),
        call: action('chamber-light', 'level.set', { ratio: 0.5 }),
        status: 'done',
        sent: 1,
      },
      {
        name: 'a speed profile the agent may choose',
        entry: fixtureEntry(),
        call: action('speed', 'option.set', { option: 'sport' }),
        status: 'done',
        sent: 1,
      },
      {
        name: 'a jog only a person at the machine makes',
        entry: fixtureEntry({ run: false }),
        call: action('motion', 'motion.jog', { axis: 'x', distance: 1, feed: 600 }),
        status: 'refused',
        sent: 0,
      },
      {
        name: 'a spindle only a person at the machine runs',
        entry: fixtureEntry({ run: false, milling: true }),
        call: action('spindle', 'spindle.set', { mode: 'off' }),
        status: 'refused',
        sent: 0,
      },
      {
        name: 'a pause on a router, which leaves a tool in the work',
        entry: fixtureEntry({ milling: true }),
        call: action('controller', 'run.pause'),
        status: 'needs-approval',
        sent: 0,
      },
    ])('decides $name', async ({ entry, call, status, sent }) => {
      const fixture = fixtureClient({ entries: [entry] });

      const result = await run(fixture.client, call);

      expect(machineActionOutputSchema.parse(result.content).status).toBe(status);
      expect(fixture.applyAction).toHaveBeenCalledTimes(sent);
    });

    /* Testing is a person's mode: it never opens a designed action to an agent. */
    it.each([true, undefined])(
      'refuses an action not yet qualified to an agent with testing %s, asking no one',
      async (testing) => {
        const fixture = fixtureClient({ entries: [fixtureEntry(testing === undefined ? {} : { testing })] });
        const approve = approveWith('approved');

        const result = await run(fixture.client, { ...action('aux-fan', 'level.set', { ratio: 0.5 }), approve });

        expect(result.content).toMatchObject({ status: 'refused', code: 'MACHINE_ACTION_UNQUALIFIED' });
        expect(approve).not.toHaveBeenCalled();
        expect(fixture.applyAction).not.toHaveBeenCalled();
      },
    );

    it('puts the parameters and the prompt in the approval, so the person sees what they approve', async () => {
      const fixture = fixtureClient();
      const approve = approveWith('denied');

      await run(fixture.client, { ...action('part-fan', 'level.set', { ratio: 0.5 }), approve });

      const asked = approve.mock.calls[0]?.[0];
      expect(asked?.prompt).toContain('Part fan ({"ratio":0.5}) on Workshop X1C?');
      expect(asked?.payload).toMatchObject({ parameters: { ratio: 0.5 }, prompt: asked?.prompt });
    });

    it('sends the identical request for a retried call, so the host keeps one operation', async () => {
      const fixture = fixtureClient();

      const first = await run(fixture.client, action('chamber-light', 'switch.set', { on: true }));
      const again = await run(fixture.client, action('chamber-light', 'switch.set', { on: true }));

      expect(again.content).toEqual(first.content);
      const [sent, resent] = fixture.applyAction.mock.calls.map(([{ signal: _signal, ...request }]) => request);
      expect(resent).toEqual(sent);
      expect(sent).toMatchObject({ operationId: 'call-1' });
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
    it("requests one job, pauses on the approval, and reports the job the person's session approved", async () => {
      const fixture = fixtureClient();
      const approve = approveWith('approved', () => fixture.person('call-1', 'approve'));

      const result = await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' }, approve });

      /* Asked first, with what the call chose; the request carries the provider's completion of it. */
      expect(fixture.checkJob).toHaveBeenCalledExactlyOnceWith({
        machineId: 'machine-1',
        artifact: fixtureArtifact,
        configuration: { expectedBedType: 'textured-pei' },
        signal: expect.any(AbortSignal) as AbortSignal,
      });
      expect(fixture.checkJob.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.requestJob.mock.invocationCallOrder[0] ?? 0,
      );
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
      /* The agent's session never resolves a job: the person's did, before answering. */
      expect(fixture.resolveJob).not.toHaveBeenCalled();
      expect(requestJobOutputSchema.parse(result.content)).toMatchObject({
        job: { jobId: 'call-1', state: 'transferring' },
        machineName: 'Workshop X1C',
        simulated: false,
        approval: 'approved',
      });
    });

    it('names the plate the person stated in the approval prompt when the machine reports none', async () => {
      const fixture = fixtureClient({ entries: [fixtureEntry({ plate: false })] });
      const approve = approveWith('denied');

      await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts', plate: 'cool' }, approve });

      expect(approve.mock.calls[0]?.[0].prompt).toBe(
        'Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 1 h 5 min. On the Cool plate, as stated; Workshop X1C does not report its plate.',
      );
    });

    it("requests the job with the machine's read of the program when Tau could not read it", async () => {
      const fixture = fixtureClient();
      planPrint.mockResolvedValueOnce({
        artifact: fixtureArtifact,
        configuration: { expectedBedType: 'textured-pei' },
        program: { name: 'pyramid.gcode.3mf', facts: { process: 'other' } },
      });
      const approve = approveWith('denied');

      await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' }, approve });

      expect(fixture.requestJob.mock.lastCall?.[0].program).toEqual({
        name: 'pyramid.gcode.3mf',
        facts: { process: 'fff', layers: 125 },
      });
      expect(approve.mock.calls[0]?.[0]).toMatchObject({
        prompt: 'Print pyramid.gcode.3mf on Workshop X1C? 125 layers.',
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

    it("reports the person's recorded denial without resolving the job itself", async () => {
      const fixture = fixtureClient();

      const result = await run(fixture.client, {
        toolName: 'request_job',
        input: { targetFile: 'main.ts' },
        approve: approveWith('denied', () => fixture.person('call-1', 'deny')),
      });

      expect(result.content).toMatchObject({ job: { state: 'denied' }, approval: 'denied' });
      expect(fixture.resolveJob).not.toHaveBeenCalled();
      expect(fixture.withdrawJob).not.toHaveBeenCalled();
    });

    it.each(['denied', 'cancelled'] as const)(
      'withdraws a job still awaiting approval after a %s answer, without the call signal',
      async (outcome) => {
        const fixture = fixtureClient();

        const result = await run(fixture.client, {
          toolName: 'request_job',
          input: { targetFile: 'main.ts' },
          approve: approveWith(outcome),
        });

        expect(result.content).toMatchObject({ job: { state: 'withdrawn' }, approval: outcome });
        expect(fixture.resolveJob).not.toHaveBeenCalled();
        expect(fixture.withdrawJob.mock.calls[0]![0]).not.toHaveProperty('signal');
      },
    );

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
        resolution: { interruptId: 'interrupt-1', outcome: 'cancelled' },
      };

      await registry.answerApproval?.(answer);
      await registry.answerApproval?.(answer);

      expect(fixture.jobs.get('call-1')?.state).toBe('withdrawn');
      expect(fixture.withdrawJob).toHaveBeenCalledTimes(1);
      expect(fixture.resolveJob).not.toHaveBeenCalled();
    });

    it.each([
      [{ state: 'started', run: { runId: 'run-1', outcome: 'running' } }, 'is running on Workshop X1C'],
      [{ state: 'started', run: { runId: 'run-1', outcome: 'completed' } }, 'has ended: completed'],
      [{ state: 'started' }, 'has not reported the run since'],
      [{ state: 'awaiting-start' }, "a person starts it with the machine's own start"],
      [{ state: 'unknown' }, 'whether it runs is unknown'],
      [{ state: 'failed', failure: { code: 'MACHINE_JOB_FAILED', message: 'Out of filament.' } }, '"Out of filament."'],
    ] as const)('says what to do next for a job %o', async (patch, phrase) => {
      const fixture = fixtureClient();
      await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' } });
      fixture.jobs.set('call-1', { ...fixture.jobs.get('call-1')!, ...patch });

      const result = await run(fixture.client, { toolName: 'get_machine', input: {} });

      expect(result.content).toContain(`- call-1 pyramid.gcode.3mf: ${patch.state}.`);
      expect(result.content).toContain(phrase);
    });
  });

  it('records no job when the machine refuses the program, and says why', async () => {
    const fixture = fixtureClient();
    fixture.checkJob.mockResolvedValueOnce({
      status: 'refused',
      code: 'MACHINE_JOB_UNSUPPORTED',
      message: 'This machine does not accept this kind of program.',
    });
    const approve = approveWith('approved');

    const result = await run(fixture.client, { toolName: 'request_job', input: { targetFile: 'main.ts' }, approve });

    expect(result).toMatchObject({
      isError: true,
      content: {
        message:
          'Workshop X1C refused the program, so nothing was recorded or sent: This machine does not accept this kind of program. (MACHINE_JOB_UNSUPPORTED)',
      },
    });
    expect(fixture.requestJob).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
  });

  it('runs a finished program as is on a router, asking the person to cut it', async () => {
    const fixture = fixtureClient({ entries: [fixtureEntry({ milling: true, run: false })] });
    planPrint.mockResolvedValueOnce({
      artifact: { ...fixtureArtifact, path: 'cam/part.nc' },
      configuration: {},
      program: { name: 'part.nc', facts: { process: 'other' } },
    });
    fixture.checkJob.mockResolvedValueOnce({
      status: 'ready',
      configuration: {},
      program: { name: 'part.nc', facts: { process: 'other' } },
      checks: [],
    });
    const approve = approveWith('denied');

    await run(fixture.client, { toolName: 'request_job', input: { artifact: 'cam/part.nc' }, approve });

    expect(planPrint.mock.lastCall?.[0]).toMatchObject({ artifact: 'cam/part.nc' });
    expect(planPrint.mock.lastCall?.[0]).not.toHaveProperty('targetFile');
    expect(approve.mock.calls[0]?.[0]).toMatchObject({
      key: 'job:machine-1:cam/part.nc',
      prompt: 'Cut part.nc on Workshop X1C?',
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
        simulated: false,
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
        expect.objectContaining({ operationId: 'call-cancel' }),
      );
      expect(fixture.applyAction.mock.calls[0]?.[0]).not.toHaveProperty('approval');
      expect(JSON.stringify(transport.requests.at(-1)?.messages)).toContain('Workshop X1C took Cancel the print.');
      await host.close();
    });

    it("keeps the person's denial, neither withdrawing nor resolving the job, when they decline in chat", async () => {
      const { fixture, host, interruptId } = await pausedOn({
        id: 'call-print',
        name: 'request_job',
        input: { targetFile: 'main.ts' },
      });
      expect(fixture.jobs.get('call-print')?.state).toBe('awaiting-approval');

      fixture.person('call-print', 'deny');
      await host.resolveInterrupt({ runId: 'run-machine', interruptId, outcome: 'denied' });
      await host.resume('chat-machine');

      expect(fixture.jobs.get('call-print')?.state).toBe('denied');
      expect(fixture.withdrawJob).not.toHaveBeenCalled();
      expect(fixture.resolveJob).not.toHaveBeenCalled();
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

    it('slices nothing for a machine without an fff process', async () => {
      const bambuStudio = engine();

      await expect(profilesOf(bambuStudio, [fixtureEntry({ milling: true })])).resolves.toMatchObject({
        isError: true,
        content: { message: expect.stringContaining('has no fff process, so nothing is sliced for it') as string },
      });
      expect(bambuStudio.findBambuStudio).not.toHaveBeenCalled();
    });

    it('names the reference engine for another vendor', async () => {
      const bambuStudio = engine();
      const other = fixtureProvider(fixtureManifest({ generic: true }));

      await expect(profilesOf(bambuStudio, [fixtureEntry({ generic: true })], other)).resolves.toMatchObject({
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
      resolution: { interruptId: 'interrupt-1', outcome: 'cancelled' },
    });

    expect(host.machines.jobs.get('call-answered')?.state).toBe('withdrawn');
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
    /* Only what the call chose; the provider completes the model, nozzle and materials from what it reports. */
    expect(host.machines.requestJob.mock.calls[0]![0].configuration).toEqual({
      expectedBedType: 'textured-pei',
      amsMapping: [0],
    });
    expect(host.exportModel).toHaveBeenCalledExactlyOnceWith(
      {
        targetFile: 'main.ts',
        to: 'gcode.3mf',
        options: {
          plate: 'textured-pei',
          nozzleDiameter: 0.4,
          filamentDiameter: 1.75,
          filamentType: 'PETG',
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
