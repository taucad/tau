import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TauHost from '@taucad/host';
import { acquireNodeAuthorityWriter } from '@taucad/filesystem/backend/node';
import { connectMachineChannel } from '@taucad/runtime/machine';
import type { MachineArtifactReference, MachineCandidate, MachineChannelClient } from '@taucad/runtime/machine';

import { createServicesHost } from '#tau/services-host.impl.js';
import type { ServicesHostOptions, UtilityMessage, UtilityPort } from '#tau/services-host.impl.js';

/* The runtime the utility builds, kept so a case can call its artifact reader
 * directly: through a print, every read failure is the simulator's one
 * `ARTIFACT_INVALID`. */
const runtimeOptions = vi.hoisted(() => [] as Array<Parameters<typeof TauHost.createNodeMachineRuntime>[0]>);

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
/* One heated layer: enough plate for the simulator to read and start. */
const plateGcode = ['M140 S60', 'M104 S200', 'G28', 'M190 S60', 'M109 S200', ';LAYER_CHANGE', 'G1 Z0.2 F600'].join(
  '\n',
);

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
  const completions: Completion[] = [];
  const host = createServicesHost({
    authorityDirectory: join(sandbox, 'authority'),
    machinesDirectory: store,
    log,
    machineBindingCompleted: (...completion) => {
      completions.push(completion);
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
    await vi.waitFor(() => {
      expect(completions.map(([answered]) => answered)).toContain(requestId);
    });
    return completions.find(([answered]) => answered === requestId)![1];
  };

  const bindSimulator = async (client: MachineChannelClient, code?: string): Promise<string> => {
    let candidate: MachineCandidate | undefined;
    for await (const event of client.discover({
      providerId: 'bambu-simulator',
      configuration: { logicalId: 'simulated-x1c' },
    })) {
      if (event.type === 'found') {
        candidate = event.candidate;
        break;
      }
    }
    if (candidate === undefined) {
      throw new Error('The simulator reported no candidate');
    }
    const outcome = await client.beginBinding({ candidate, name: 'simulated-x1c' });
    if (outcome.status === 'bound') {
      return outcome.machineId;
    }
    const result = await completeCeremony('bind-simulator', outcome.ceremonyId, code);
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
  return { alpha, beta, bindSimulator, cleanup, completeCeremony, connect, host, log, rootA, rootB, store };
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
      expect(providers.map((provider) => provider.id).sort()).toEqual(['bambu', 'bambu-a1-mini', 'bambu-simulator']);
      expect(existsSync(join(machines.store, 'store.json'))).toBe(true);

      await expect(machines.completeCeremony('bind-unknown', 'no-such-ceremony', accessCode)).resolves.toEqual({
        error: 'MACHINE_BINDING_UNKNOWN_CEREMONY',
      });
      const machineId = await machines.bindSimulator(client, accessCode);

      const directory = await client.list({});
      expect(directory.entries.map((entry) => [entry.providerId, entry.machineId])).toEqual([
        ['bambu-simulator', machineId],
      ]);
      expect(machines.log).toHaveBeenCalledWith('machines.vault', { kind: 'file' });
      /* The simulator has no network endpoint: nothing was probed and no code was saved. */
      expect(existsSync(join(machines.store, 'secrets.json'))).toBe(false);
      expect(JSON.stringify(machines.log.mock.calls)).not.toContain(accessCode);

      await machines.host.quiesce();
      await expect(client.list({})).rejects.toThrow();
    } finally {
      await machines.cleanup();
    }
  }, 30_000);

  it("should read a request's file from the project its id names, refusing another project's file at that path", async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect();
      const machineId = await machines.bindSimulator(client);
      /* One relative path in both projects; only beta holds the sliced archive. */
      const archive = Uint8Array.from(zipSync({ 'Metadata/plate_1.gcode': encoder.encode(plateGcode) }));
      await writeFile(join(machines.beta, 'plate.gcode.3mf'), archive);
      await writeFile(join(machines.alpha, 'plate.gcode.3mf'), 'not the sliced plate');
      const request = async (requestId: string, projectId: string) => {
        await client.requestPrint({
          requestId,
          machineId,
          artifact: artifactFor(projectId, archive),
          configuration,
          requestedBy: operator,
        });
        return client.resolvePrintRequest({ requestId, decision: 'approve', resolvedBy: operator });
      };

      /* Alpha's file at that path is not the one the digest names, and beta's is not alpha's. */
      await expect(request('alpha', alphaId)).resolves.toMatchObject({
        state: 'failed',
        failure: { code: 'ARTIFACT_INVALID' },
      });
      await expect(request('beta', betaId)).resolves.toMatchObject({ state: 'started' });
      /* Request history is the store's: every connection sees both. */
      const history = await machines.connect().listPrintRequests({});
      expect(history.map((entry) => entry.requestId).sort()).toEqual(['alpha', 'beta']);
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
      await expect(machines.connect().listProviders({})).resolves.toHaveLength(3);
    } finally {
      await machines.cleanup();
    }
  }, 30_000);
});
