import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TauHost from '@taucad/host';
import type * as RuntimeHostNode from '@taucad/runtime/host/node';
import { acquireNodeAuthorityWriter } from '@taucad/filesystem/backend/node';
import { connectMachineChannel } from '@taucad/runtime/machine';
import type { MachineArtifactReference, MachineCandidate, MachineChannelClient } from '@taucad/runtime/machine';

import { createServicesHost } from '#tau/services-host.impl.js';
import type { ServicesHostOptions, UtilityMessage, UtilityPort } from '#tau/services-host.impl.js';

/* The runtime the utility builds, kept so a case can call its artifact reader
 * directly: through a print, every read failure is the simulator's one
 * `MACHINE_JOB_ARTIFACT_INVALID`. */
const runtimeOptions = vi.hoisted(() => [] as Array<Parameters<typeof TauHost.createNodeMachineRuntime>[0]>);
/* What the machine host answers when asked which machines a streamed run feeds, in place of its own answer: the
 * host owns that read and its tests; here only the utility's use of it is under test. */
const streaming = vi.hoisted(() => ({
  names: undefined as undefined | readonly string[],
  /* A read that fails, as a busy store does. */
  error: undefined as undefined | Error,
}));
/* The order in which quiescing gates the machine host's starts, reads what streams and lets starts go again. */
const gate = vi.hoisted(() => [] as string[]);
/* How the machine host's quiesce behaves: held until `release` settles, or timed out with a start still in flight. */
const quiescing = vi.hoisted(() => ({
  release: undefined as undefined | Promise<void>,
  isStartInFlight: false,
}));

vi.mock('@taucad/runtime/host/node', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeHostNode>();
  return {
    ...actual,
    createNodeMachineHost: async (input: Parameters<typeof actual.createNodeMachineHost>[0]) => {
      const host = await actual.createNodeMachineHost(input);
      return {
        ...host,
        quiesce: async () => {
          gate.push('quiesce');
          await quiescing.release;
          if (quiescing.isStartInFlight) {
            /* The real host's timeout: its gate stays up until the error's `resume`. */
            throw new actual.MachineHostStartInFlightError(() => {
              gate.push('resume');
            });
          }
          const resume = await host.quiesce();
          return () => {
            gate.push('resume');
            resume();
          };
        },
        streamingMachines: async () => {
          const { error, names } = streaming;
          if (error === undefined && names === undefined) {
            return host.streamingMachines();
          }
          gate.push('read');
          if (error !== undefined) {
            throw error;
          }
          return (names ?? []).map((name) => ({ machineId: name.toLowerCase(), name }));
        },
      };
    },
  };
});

vi.mock('@taucad/host', async (importOriginal) => {
  const actual = await importOriginal<typeof TauHost>();
  return {
    ...actual,
    createNodeMachineRuntime: (options: Parameters<typeof TauHost.createNodeMachineRuntime>[0]) => {
      runtimeOptions.push(options);
      return actual.createNodeMachineRuntime(options);
    },
  };
});

type Completion = Parameters<NonNullable<ServicesHostOptions['machineBindingCompleted']>>;

const frame = (data: unknown, ports: readonly UtilityPort[] = []): UtilityMessage => ({ data, ports });

const encoder = new TextEncoder();
const accessCode = '12345678';
const operator = { kind: 'user', id: 'operator', label: 'Operator' } as const;
/* What the simulator's submission schema accepts for its loaded PLA spool. */
const configuration = {
  amsMapping: [0],
  bedLeveling: true,
  expectedBedType: 'textured-pei',
  expectedFilamentDiameter: 1.75,
  expectedMaterials: [{ slot: 0, materialId: 'pla' }],
  expectedModel: 'X1C',
  expectedNozzleDiameter: 0.4,
  flowCalibration: true,
  timelapse: false,
} as const;
/* One heated layer, sliced for the simulated X1C (its CONFIG_BLOCK states what it was sliced for): enough plate for
 * the simulator to check, read and start. */
const plateGcode = [
  '; CONFIG_BLOCK_START',
  '; curr_bed_type = Textured PEI Plate',
  '; filament_colour = #F2F2F2',
  '; filament_diameter = 1.75',
  '; filament_type = PLA',
  '; nozzle_diameter = 0.4',
  '; printer_model = Bambu Lab X1 Carbon',
  '; CONFIG_BLOCK_END',
  'M140 S60',
  'M104 S200',
  'G28',
  'M190 S60',
  'M109 S200',
  ';LAYER_CHANGE',
  'G1 Z0.2 F600',
].join('\n');

const projectIdFor = (name: string): string => `proj_${name.padEnd(21, '0')}`;
const alphaId = projectIdFor('alpha');
const betaId = projectIdFor('beta');
const gammaId = projectIdFor('gamma');

const digestOf = (bytes: Uint8Array<ArrayBuffer>): MachineArtifactReference['digest'] =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as MachineArtifactReference['digest'];

const artifactFor = (
  projectId: string,
  bytes: Uint8Array<ArrayBuffer>,
  path = 'plate.gcode.3mf',
): MachineArtifactReference => ({
  projectId,
  path,
  digest: digestOf(bytes),
  length: bytes.byteLength,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
});

/** A project folder whose `tau.json` names it. */
const writeProject = async (root: string, name: string, id: string): Promise<string> => {
  const project = join(root, name);
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'tau.json'), JSON.stringify({ id }));
  return project;
};

/**
 * A services host over a real filesystem authority and machine store, with
 * two admitted roots holding one project each.
 *
 * @returns The host, its log, its ceremony answers and the seams to reach it.
 */
const machinesHarness = async () => {
  const sandbox = realpathSync.native(await mkdtemp(join(tmpdir(), 'tau-desktop-machines-')));
  const rootA = join(sandbox, 'workspace-a');
  const rootB = join(sandbox, 'workspace-b');
  const store = join(sandbox, 'config', 'machines');
  await mkdir(join(sandbox, 'authority'));
  const [alpha, beta] = await Promise.all([writeProject(rootA, 'alpha', alphaId), writeProject(rootB, 'beta', betaId)]);
  const log = vi.fn();
  /* Each answer the utility gives main, by request: a ceremony connects the provider, so it takes as long as that. */
  const answers = new Map<string, PromiseWithResolvers<unknown>>();
  const answer = (requestId: string): PromiseWithResolvers<unknown> => {
    const existing = answers.get(requestId);
    if (existing !== undefined) {
      return existing;
    }
    const created = Promise.withResolvers<unknown>();
    answers.set(requestId, created);
    return created;
  };
  const host = createServicesHost({
    authorityDirectory: join(sandbox, 'authority'),
    machinesDirectory: store,
    log,
    machineBindingCompleted: (requestId, result) => {
      answer(requestId).resolve(result);
    },
    machinesStreaming: (requestId, machines) => {
      answer(requestId).resolve(machines);
    },
  });
  host.handleMessage(frame({ type: 'allowRoots', roots: [rootA, rootB] }));
  const clients: MachineChannelClient[] = [];

  /** Open a machines route as a window or its agent does: naming no project. */
  const connect = (): MachineChannelClient => {
    const { port1, port2 } = new MessageChannel();
    host.handleMessage(frame({ type: 'concern', concern: 'machines' }, [port2]));
    const client = connectMachineChannel(port1);
    clients.push(client);
    return client;
  };

  /** Main's half of a ceremony: the frame, then the utility's answer. */
  const completeCeremony = async (requestId: string, ceremonyId: string, code?: string): Promise<Completion[1]> => {
    host.handleMessage(
      frame({
        type: 'machine-binding-complete',
        requestId,
        ceremonyId,
        ...(code === undefined ? {} : { accessCode: code }),
      }),
    );
    return answer(requestId).promise as Promise<Completion[1]>;
  };

  /** Main's question before a quit: the machines a streamed run is feeding. */
  const streaming = async (requestId: string): Promise<readonly string[]> => {
    host.handleMessage(frame({ type: 'machines-streaming', requestId }));
    return answer(requestId).promise as Promise<readonly string[]>;
  };

  /** Main's keep-awake poll: the same answer, holding nothing. */
  const peek = async (requestId: string): Promise<readonly string[]> => {
    host.handleMessage(frame({ type: 'machines-streaming-peek', requestId }));
    return answer(requestId).promise as Promise<readonly string[]>;
  };

  const bindSimulator = async (
    client: MachineChannelClient,
    code?: string,
    providerId = 'bambu-simulator',
  ): Promise<string> => {
    let candidate: MachineCandidate | undefined;
    for await (const event of client.discover({
      providerId,
      configuration: {},
    })) {
      if (event.type === 'found') {
        candidate = event.candidate;
        break;
      }
    }
    if (candidate === undefined) {
      throw new Error('The simulator reported no candidate');
    }
    const outcome = await client.beginBinding({
      candidate,
      name: providerId === 'bambu-simulator' ? 'simulated-x1c' : providerId,
    });
    if (outcome.status === 'bound') {
      return outcome.machineId;
    }
    const result = await completeCeremony(`bind-${providerId}`, outcome.ceremonyId, code);
    if (!('outcome' in result) || result.outcome.status !== 'bound') {
      throw new Error(`The ceremony did not bind: ${JSON.stringify(result)}`);
    }
    return result.outcome.machineId;
  };

  const cleanup = async (): Promise<void> => {
    for (const client of clients) {
      client.close();
    }
    await host.quiesce().catch(() => undefined);
    host.dispose();
    await rm(sandbox, { recursive: true, force: true });
  };
  return {
    alpha,
    beta,
    bindSimulator,
    cleanup,
    completeCeremony,
    connect,
    host,
    log,
    peek,
    rootA,
    rootB,
    store,
    streaming,
  };
};

describe('createServicesHost — machines', () => {
  beforeEach(() => {
    /* The desktop picks the keychain on macOS; no test may touch a person's keychain. */
    vi.stubEnv('TAU_SECRET_VAULT', 'file');
    runtimeOptions.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should serve a connection that names no project, bind the simulator without keeping its code, and close on quiesce', async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect();
      const providers = await client.listProviders({});
      expect(providers.map((provider) => provider.id).sort()).toEqual([
        'bambu',
        'bambu-a1-mini',
        'bambu-a1-mini-simulator',
        'bambu-simulator',
        'grbl',
        'grbl-simulator',
        'makera-carvera',
        'makera-carvera-simulator',
      ]);
      /* No serial driver ships yet: the Grbl provider is listed with why, its simulator is not. */
      expect(providers.filter(({ unavailable }) => unavailable !== undefined).map(({ id }) => id)).toEqual(['grbl']);
      expect(existsSync(join(machines.store, 'store.json'))).toBe(true);

      /* The ceremony's real refusal reaches main with its typed code. */
      await expect(machines.completeCeremony('bind-unknown', 'no-such-ceremony', accessCode)).resolves.toEqual({
        error: 'MACHINE_BINDING_UNKNOWN_CEREMONY',
        code: 'MACHINE_BINDING_UNKNOWN_CEREMONY',
      });
      const machineId = await machines.bindSimulator(client, accessCode);

      const directory = await client.list({});
      expect(directory.entries.map((entry) => [entry.providerId, entry.machineId])).toEqual([
        ['bambu-simulator', machineId],
      ]);
      expect(machines.log).toHaveBeenCalledWith('machines.vault', { kind: 'file' });
      /* A simulator takes no code: nothing was probed and the typed code was not saved. */
      expect(existsSync(join(machines.store, 'secrets.json'))).toBe(false);
      expect(JSON.stringify(machines.log.mock.calls)).not.toContain(accessCode);

      await machines.host.quiesce();
      await expect(client.list({})).rejects.toThrow();
    } finally {
      await machines.cleanup();
    }
  }, 30_000);

  it("should read a job's file from the project its id names, refusing another project's file at that path", async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect();
      const machineId = await machines.bindSimulator(client);
      /* One relative path in both projects; only beta holds the sliced archive. */
      const archive = Uint8Array.from(zipSync({ 'Metadata/plate_1.gcode': encoder.encode(plateGcode) }));
      await writeFile(join(machines.beta, 'plate.gcode.3mf'), archive);
      await writeFile(join(machines.alpha, 'plate.gcode.3mf'), 'not the sliced plate');
      /* Ask for a job and, once it is prepared, approve it with every attestation the printer asks for. */
      const job = async (jobId: string, projectId: string) => {
        const requested = await client.requestJob({
          jobId,
          machineId,
          artifact: artifactFor(projectId, archive),
          configuration,
          requestedBy: operator,
        });
        if (requested.state !== 'awaiting-approval') {
          return requested;
        }
        const { descriptor } = await client.get({ machineId });
        const { jobs } = descriptor.capabilities;
        return client.resolveJob({
          jobId,
          decision: 'approve',
          resolvedBy: operator,
          attended: true,
          attestations: jobs.type === 'supported' ? jobs.attestations.map(({ id }) => id) : [],
        });
      };

      /* Alpha's file at that path is not the one the digest names, and beta's is not alpha's. */
      await expect(job('alpha', alphaId)).resolves.toMatchObject({
        state: 'failed',
        failure: { code: 'MACHINE_JOB_ARTIFACT_INVALID' },
      });
      await expect(job('beta', betaId)).resolves.toMatchObject({ state: 'started' });
      /* Job history is the store's: every connection sees both. */
      const history = await machines.connect().listJobs({});
      expect(history.map((entry) => entry.jobId).sort()).toEqual(['alpha', 'beta']);
    } finally {
      await machines.cleanup();
    }
  }, 60_000);

  it("should find a candidate turn's slice in its checkout, refuse a project no root holds, and find one that appears later", async () => {
    const machines = await machinesHarness();
    try {
      await machines.connect().listProviders({});
      const { readArtifact } = runtimeOptions.at(-1)!;
      const { signal } = new AbortController();
      const slice = encoder.encode('a candidate turn slice');
      const slicePath = '.tau/artifacts/call-1/slice.gcode.3mf';
      const checkout = join(machines.rootA, '.tau', 'checkouts', alphaId, 'turn-1');
      await mkdir(join(checkout, '.tau', 'artifacts', 'call-1'), { recursive: true });
      await writeFile(join(checkout, slicePath), slice);

      await expect(readArtifact(artifactFor(alphaId, slice, slicePath), signal)).resolves.toEqual(slice);
      await expect(readArtifact(artifactFor(betaId, slice, slicePath), signal)).rejects.toThrow(
        'MACHINE_ARTIFACT_NOT_FOUND',
      );
      await expect(readArtifact(artifactFor(gammaId, slice), signal)).rejects.toThrow('MACHINE_ARTIFACT_NOT_FOUND');

      /* A miss scans the roots again: projects appear, move and go. */
      const gamma = await writeProject(machines.rootB, 'gamma', gammaId);
      await writeFile(join(gamma, 'plate.gcode.3mf'), slice);
      await expect(readArtifact(artifactFor(gammaId, slice), signal)).resolves.toEqual(slice);
    } finally {
      await machines.cleanup();
    }
  }, 30_000);

  it('should serve every simulator at an unreachable address and bind it', async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect();
      const bound: string[] = [];
      // oxlint-disable no-await-in-loop -- one binding at a time, as a person adds them.
      for (const providerId of [
        'bambu-simulator',
        'bambu-a1-mini-simulator',
        'grbl-simulator',
        'makera-carvera-simulator',
      ]) {
        /* A simulator's provider declares only simulation, so the ceremony asks it no code. */
        for await (const event of client.discover({ providerId, configuration: {} })) {
          if (event.type === 'found') {
            const { endpoint } = event.candidate;
            expect(endpoint.transport === 'network' ? endpoint.address : endpoint.path).toMatch(/\.invalid$/u);
            break;
          }
        }
        bound.push(await machines.bindSimulator(client, undefined, providerId));
      }
      // oxlint-enable no-await-in-loop
      expect(bound).toEqual(['simulated-x1c', 'bambu-a1-mini-simulator', 'grbl-simulator', 'makera-carvera-simulator']);
    } finally {
      await machines.cleanup();
    }
  }, 60_000);

  it('should tell main which machines a streamed run is feeding, and none before the store opens or while none streams', async () => {
    const machines = await machinesHarness();
    try {
      await expect(machines.streaming('before-open')).resolves.toEqual([]);
      const client = machines.connect();
      await machines.bindSimulator(client);
      /* The host's own answer: the simulator streams nothing. */
      await expect(machines.streaming('idle')).resolves.toEqual([]);
      streaming.names = ['Router', 'Mill'];
      await expect(machines.streaming('streaming')).resolves.toEqual(['Router', 'Mill']);
    } finally {
      streaming.names = undefined;
      await machines.cleanup();
    }
  }, 30_000);

  it("should answer main's keep-awake poll with the machines a streamed run feeds, holding no start", async () => {
    const machines = await machinesHarness();
    try {
      await expect(machines.peek('before-open')).resolves.toEqual([]);
      const client = machines.connect();
      await machines.bindSimulator(client);
      streaming.names = ['Router'];
      gate.length = 0;
      await expect(machines.peek('streaming')).resolves.toEqual(['Router']);
      /* Read only: unlike the quit question, starts were never stopped. */
      expect(gate).toEqual(['read']);
    } finally {
      streaming.names = undefined;
      await machines.cleanup();
    }
  }, 30_000);

  it('should refuse to quiesce, closing nothing, while a streamed run feeds or that cannot be read', async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect();
      await machines.bindSimulator(client);

      streaming.names = ['Router'];
      gate.length = 0;
      await expect(machines.host.quiesce()).rejects.toMatchObject({
        refusal: { type: 'quiesce-refused', reason: 'streaming', machines: ['Router'] },
      });
      /* Starts stop before the runs are read, so none begins in between, and go again when nothing closes. */
      expect(gate).toEqual(['quiesce', 'read', 'resume']);
      await expect(client.list({})).resolves.toMatchObject({ entries: [expect.anything()] });

      streaming.names = undefined;
      streaming.error = new Error('The store is busy.');
      gate.length = 0;
      await expect(machines.host.quiesce()).rejects.toMatchObject({
        refusal: { reason: 'streaming-unknown', message: 'The store is busy.' },
      });
      /* Unread is not "none": starts go again, as when a stream refuses the quit. */
      expect(gate).toEqual(['quiesce', 'read', 'resume']);
      await expect(client.list({})).resolves.toMatchObject({ entries: [expect.anything()] });

      /* The person chose to quit anyway: the machine host closes with the rest, starting nothing first. */
      gate.length = 0;
      await machines.host.quiesce({ quitIfStreamingUnknown: true });
      expect(gate).toEqual(['quiesce', 'read']);
      await expect(client.list({})).rejects.toThrow();
    } finally {
      streaming.names = undefined;
      streaming.error = undefined;
      await machines.cleanup();
    }
  }, 30_000);

  /* B3H-3: the renderer quiesces between main's question and the utility's quiesce, and cannot resume. */
  it("should hold starts from main's quit question until quit closes, so the utility then refuses nothing, or until main calls it off", async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect();
      await machines.bindSimulator(client);
      streaming.names = [];
      gate.length = 0;

      await expect(machines.streaming('kept-open')).resolves.toEqual([]);
      expect(gate).toEqual(['quiesce', 'read']);
      /* The person kept Tau open: starts go again, so the window can still start a job. */
      machines.host.handleMessage(frame({ type: 'machines-resume' }));
      expect(gate).toEqual(['quiesce', 'read', 'resume']);

      gate.length = 0;
      await expect(machines.streaming('quit')).resolves.toEqual([]);
      /* A stream the store now reported could not have begun under the hold: the answer main acted on stands. */
      streaming.names = ['Router'];
      await machines.host.quiesce();
      expect(gate).toEqual(['quiesce', 'read']);
      await expect(client.list({})).rejects.toThrow();
    } finally {
      streaming.names = undefined;
      await machines.cleanup();
    }
  }, 30_000);

  /* A4-1: a start still in flight when the machine host's wait ends keeps its gate up until someone calls the quit off. */
  it('should keep starts held when a start outlasts the wait, lifting them only when the quit is refused', async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect();
      await machines.bindSimulator(client);
      quiescing.isStartInFlight = true;

      gate.length = 0;
      await expect(machines.host.quiesce()).rejects.toMatchObject({
        refusal: { reason: 'streaming-unknown', message: 'MACHINE_HOST_START_IN_FLIGHT' },
      });
      expect(gate).toEqual(['quiesce', 'resume']);

      /* *Quit anyway*: the machine host closes with the rest, and starts stay held until it does. */
      gate.length = 0;
      await machines.host.quiesce({ quitIfStreamingUnknown: true });
      expect(gate).toEqual(['quiesce']);
      await expect(client.list({})).rejects.toThrow();
    } finally {
      quiescing.isStartInFlight = false;
      await machines.cleanup();
    }
  }, 30_000);

  /* A4-7: main's question when the machine host cannot say, and when main calls the quit off before it answers. */
  it("should let go of main's question's hold when the host cannot say, or when main calls the quit off first", async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect();
      await machines.bindSimulator(client);
      streaming.names = [];

      quiescing.isStartInFlight = true;
      gate.length = 0;
      /* Unanswered: main's bound asks the person; this question holds nothing meanwhile. */
      void machines.streaming('unknown');
      await vi.waitFor(() => {
        expect(gate).toEqual(['quiesce', 'resume']);
      });
      expect(machines.log).toHaveBeenCalledWith('machines.streaming-unread', 'MACHINE_HOST_START_IN_FLIGHT', 'warn');
      quiescing.isStartInFlight = false;

      /* Main calls the quit off while the host still waits: the late hold is let go at once, and never kept. */
      const release = Promise.withResolvers<void>();
      quiescing.release = release.promise;
      gate.length = 0;
      void machines.streaming('called-off');
      await vi.waitFor(() => {
        expect(gate).toEqual(['quiesce']);
      });
      machines.host.handleMessage(frame({ type: 'machines-resume' }));
      quiescing.release = undefined;
      release.resolve();
      await vi.waitFor(() => {
        expect(gate).toEqual(['quiesce', 'resume']);
      });
      /* Nothing is held: a later quit asks afresh and gates once. */
      gate.length = 0;
      await expect(machines.streaming('again')).resolves.toEqual([]);
      expect(gate).toEqual(['quiesce', 'read']);
    } finally {
      quiescing.isStartInFlight = false;
      quiescing.release = undefined;
      streaming.names = undefined;
      await machines.cleanup();
    }
  }, 30_000);

  it('should answer MACHINE_STORE_OWNED_ELSEWHERE while another Tau app holds the store, and serve once it lets go', async () => {
    const machines = await machinesHarness();
    try {
      const authorityRoot = join(machines.store, 'authority');
      await mkdir(authorityRoot, { recursive: true, mode: 0o700 });
      const owner = await acquireNodeAuthorityWriter({ authorityRoot });
      try {
        await expect(machines.connect().listProviders({})).rejects.toThrow('MACHINE_STORE_OWNED_ELSEWHERE');
      } finally {
        await owner.release();
      }
      expect(machines.log).toHaveBeenCalledWith('machines.unavailable', { reason: 'owned-elsewhere' }, 'warn');

      /* The renderer dials again for its next call, and the store is free now. */
      await expect(machines.connect().listProviders({})).resolves.toHaveLength(8);
    } finally {
      await machines.cleanup();
    }
  }, 30_000);
});
