import { describe, expect, it } from 'vitest';

import type { MachineArtifactReference } from '@taucad/runtime/machine';

import { createBambuSimulator } from '#bambu.simulator.js';

const { signal } = new AbortController();
// oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- closed static fixture supplies opaque runtime identities.
const artifact = {
  revision: {
    authorityId: 'authority',
    workspaceId: 'workspace',
    revisionId: 'r1',
    treeDigest: `sha256:${'1'.repeat(64)}`,
  },
  path: 'fixture.gcode.3mf',
  digest: `sha256:${'2'.repeat(64)}`,
  length: 4,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
} as MachineArtifactReference;
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

describe('Bambu simulator fault matrix', () => {
  it.each([
    ['certificate-changed', 'BAMBU_CERTIFICATE_CHANGED'],
    ['wrong-credential', 'BAMBU_AUTHENTICATION'],
    ['protected-mode', 'BAMBU_PROTECTED_MODE'],
    ['timeout', 'BAMBU_TIMEOUT'],
  ] as const)('should refuse the %s handshake', async (fault, code) => {
    const simulator = createBambuSimulator({ faults: [fault] });
    await expect(simulator.session.getDescriptor({ signal })).rejects.toThrow(code);
  });

  it.each([
    ['storage-full', 'STORAGE_FULL'],
    ['partial-transfer', 'TRANSFER_PARTIAL'],
  ] as const)('should fail closed on %s without retaining an uploaded name', async (fault, code) => {
    const simulator = createBambuSimulator({ faults: [fault] });
    const receipt = await simulator.session.preparePrint?.({
      operationId: 'operation-1',
      expectedMachineId: 'simulated-x1c',
      artifact,
      configuration,
      signal,
    });
    expect(receipt).toMatchObject({ status: 'rejected', code });
    expect(simulator.uploadedNames()).toEqual([]);
  });

  it('should never replay a physical write on reconnect or a lost reply', async () => {
    const simulator = createBambuSimulator({
      faults: ['reply-lost-after-accept'],
    });
    const prepared = await simulator.session.preparePrint?.({
      operationId: 'prepared-1',
      expectedMachineId: 'simulated-x1c',
      artifact,
      configuration,
      signal,
    });
    if (prepared?.status !== 'transferred') {
      throw new Error('expected simulator preparation');
    }
    const receipt = await simulator.session.submit({
      operationId: 'operation-1',
      expectedMachineId: 'simulated-x1c',
      artifact,
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
      configuration,
      signal,
    });
    expect(receipt).toMatchObject({ status: 'unknown' });
    const writes = simulator.writes();
    simulator.reconnect();
    expect(simulator.writes()).toEqual(writes);
    await expect(
      simulator.session.reconcile?.({ operationId: 'operation-1', command: 'project_file', signal }),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('should isolate camera failure from machine state', async () => {
    const simulator = createBambuSimulator({ faults: ['camera-unavailable'] });
    const before = await simulator.session.getSnapshot({ signal });
    const capability = simulator.session.stillCapture;
    if (capability.type !== 'supported') {
      throw new Error('expected simulator camera');
    }
    await expect(capability.capture({ signal })).rejects.toThrow('BAMBU_CAMERA_UNAVAILABLE');
    expect(await simulator.session.getSnapshot({ signal })).toEqual(before);
  });
});
