import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostMachineWorkspaceId } from '@taucad/host';
import { connectMachineChannel } from '@taucad/runtime/machine';
import type { MachineArtifactReference, MachineCandidate, MachineChannelClient } from '@taucad/runtime/machine';

import { createServicesHost } from '#tau/services-host.impl.js';
import type { ServicesHostOptions, UtilityMessage, UtilityPort } from '#tau/services-host.impl.js';

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
  expectedFilamentDiameter: {
    value: 1.75,
    unit: 'mm',
    kind: 'http://qudt.org/vocab/quantitykind/Diameter',
    space: 'linear',
  },
  expectedMaterials: [{ slot: 0, materialId: 'pla' }],
  expectedModel: 'X1C',
  expectedNozzleDiameter: {
    value: 0.4,
    unit: 'mm',
    kind: 'http://qudt.org/vocab/quantitykind/Diameter',
    space: 'linear',
  },
  flowCalibration: true,
  timelapse: false,
} as const;
/* One heated layer: enough plate for the simulator to read and start. */
const plateGcode = ['M140 S60', 'M104 S200', 'G28', 'M190 S60', 'M109 S200', ';LAYER_CHANGE', 'G1 Z0.2 F600'].join(
  '\n',
);

const digestOf = (bytes: Uint8Array<ArrayBuffer>): MachineArtifactReference['digest'] =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as MachineArtifactReference['digest'];

/**
 * A services host over a real filesystem authority and machine directory,
 * serving two sibling projects.
 *
 * @returns The host, its log, its ceremony answers and the seams to reach it.
 */
const machinesHarness = async () => {
  const sandbox = realpathSync.native(await mkdtemp(join(tmpdir(), 'tau-desktop-machines-')));
  const projects = join(sandbox, 'projects');
  const alpha = join(projects, 'alpha');
  const beta = join(projects, 'beta');
  await Promise.all([
    mkdir(alpha, { recursive: true }),
    mkdir(beta, { recursive: true }),
    mkdir(join(sandbox, 'authority')),
  ]);
  const log = vi.fn();
  const completions: Completion[] = [];
  const host = createServicesHost({
    authorityDirectory: join(sandbox, 'authority'),
    machinesDirectory: join(sandbox, 'machines'),
    log,
    machineBindingCompleted: (...completion) => {
      completions.push(completion);
    },
  });
  host.handleMessage(frame({ type: 'allowRoots', roots: [projects] }));
  const clients: MachineChannelClient[] = [];

  /** Open one project's machines route, as a window or its agent does. */
  const connect = (workspaceRoot: string): MachineChannelClient => {
    const { port1, port2 } = new MessageChannel();
    host.handleMessage(frame({ type: 'concern', concern: 'machines', context: { workspaceRoot } }, [port2]));
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
  return { alpha, beta, bindSimulator, cleanup, completeCeremony, connect, host, log, sandbox };
};

describe('createServicesHost — machines', () => {
  beforeEach(() => {
    /* The desktop picks the keychain on macOS; no test may touch a person's keychain. */
    vi.stubEnv('TAU_SECRET_VAULT', 'file');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should bind the simulator natively without keeping a code typed for it, and close on quiesce', async () => {
    const machines = await machinesHarness();
    try {
      const client = machines.connect(machines.alpha);
      const providers = await client.listProviders({});
      expect(providers.map((provider) => provider.id).sort()).toEqual(['bambu', 'bambu-simulator']);

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
      expect(existsSync(join(machines.sandbox, 'machines', 'secrets.json'))).toBe(false);
      expect(JSON.stringify(machines.log.mock.calls)).not.toContain(accessCode);

      await machines.host.quiesce();
      await expect(client.list({})).rejects.toThrow();
    } finally {
      await machines.cleanup();
    }
  }, 30_000);

  it("should show one printer to every project and read a request's file by its digest", async () => {
    const machines = await machinesHarness();
    try {
      const machineId = await machines.bindSimulator(machines.connect(machines.alpha));
      const beta = machines.connect(machines.beta);
      const directory = await beta.list({});
      expect(directory.cursor.workspaceId).toBe(hostMachineWorkspaceId);
      expect(directory.entries.map((entry) => entry.machineId)).toEqual([machineId]);

      /* One relative path in both projects; only beta holds the sliced archive. */
      const archive = Uint8Array.from(zipSync({ 'Metadata/plate_1.gcode': encoder.encode(plateGcode) }));
      await writeFile(join(machines.beta, 'plate.gcode.3mf'), archive);
      await writeFile(join(machines.alpha, 'plate.gcode.3mf'), 'not the sliced plate');
      /* Alpha asks last, so its decoy is read first and refused by digest. */
      const alpha = machines.connect(machines.alpha);
      const artifactFor = (bytes: Uint8Array<ArrayBuffer>): MachineArtifactReference => ({
        revision: {
          authorityId: directory.cursor.authorityId,
          workspaceId: directory.cursor.workspaceId,
          revisionId: 'r1' as MachineArtifactReference['revision']['revisionId'],
          treeDigest: digestOf(bytes),
        },
        path: 'plate.gcode.3mf',
        digest: digestOf(bytes),
        length: bytes.byteLength,
        mediaType: 'application/vnd.bambulab.gcode-3mf',
        contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
        selectedMember: 'Metadata/plate_1.gcode',
      });
      const request = async (requestId: string, bytes: Uint8Array<ArrayBuffer>) => {
        await alpha.requestPrint({
          requestId,
          machineId,
          artifact: artifactFor(bytes),
          configuration,
          requestedBy: operator,
        });
        return alpha.resolvePrintRequest({ requestId, decision: 'approve', resolvedBy: operator });
      };

      await expect(request('nowhere', encoder.encode('bytes no project holds'))).resolves.toMatchObject({
        state: 'failed',
        failure: { code: 'ARTIFACT_INVALID' },
      });
      await expect(request('plate', archive)).resolves.toMatchObject({ state: 'started' });
      /* Request history is the host's: the other project sees both. */
      const history = await beta.listPrintRequests({});
      expect(history.map((entry) => entry.requestId).sort()).toEqual(['nowhere', 'plate']);
    } finally {
      await machines.cleanup();
    }
  }, 60_000);
});
