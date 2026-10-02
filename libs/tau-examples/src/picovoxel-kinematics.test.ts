import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeIo } from '@taucad/geometry-core';
import type { TauCadTopologyPayload, TauCadTopologyRoot } from '@taucad/geometry-core';
import { admitMechanism, evaluatePose, sampleAnimation } from '@taucad/kinematics';
import type { Mechanism } from '@taucad/kinematics';
import { describe, expect, it } from 'vitest';
import { createExampleRuntimeClient } from '#scripts/runtime.js';
import { defaultParams, mechanism as stageMechanism, partNames } from '#kernels/picovoxel/lead-screw-stage/main.js';

const projectPath = fileURLToPath(new URL('kernels/picovoxel/lead-screw-stage/', import.meta.url));
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const admit = (source: unknown): Mechanism => {
  const result = admitMechanism(source);
  if (result.status !== 'admitted') {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.mechanism;
};

const pose = (mechanism: Mechanism, coordinates: Record<string, number>) => {
  const result = evaluatePose({ mechanism, coordinates });
  if (result.status !== 'posed') {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.pose;
};

describe('PicoVoxel authored mechanisms', () => {
  it.each([{ lead: 0 }, { travel: 41 }, { carriagePosition: -1 }, { carriagePosition: 31 }, { voxelSize: Number.NaN }])(
    'should reject invalid stage parameters %j',
    (parameters) => {
      expect(() => stageMechanism({ ...defaultParams, ...parameters })).toThrow(
        'Use positive voxelSize/lead, travel in (0, 40] mm and carriagePosition in [0, travel].',
      );
    },
  );

  it('should deliver named PBR bodies and parameter-dependent lead-screw motion through the public runtime', async () => {
    const client = await createExampleRuntimeClient(projectPath);
    const io = await createNodeIo();
    try {
      for (const carriagePosition of [defaultParams.carriagePosition, 20]) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Parameter variants share one client serially.
        const result = await (async () => {
          const document = client.open({ source: { path: 'main.ts' }, parameters: { carriagePosition } });
          try {
            return await document.export('glb', { content: { includeTopology: true } });
          } finally {
            document.close();
          }
        })();
        if (!result.success) {
          throw new Error(JSON.stringify(result.issues));
        }
        expect(result.issues).toEqual([]);
        // oxlint-disable-next-line eslint/no-await-in-loop -- Decode this parameter variant before changing it.
        const document = await io.readBinary(result.files[0].bytes);
        const root = document.getRoot();
        const payload: unknown = root.getExtension<TauCadTopologyRoot>('TAU_cad_topology')?.getPayload();
        const topology = payload as TauCadTopologyPayload;
        expect(topology.components.map(({ name }) => name)).toEqual(Object.values(partNames));
        const mechanism = admit(topology.mechanism);
        const bound = Object.values(mechanism.links).flatMap(({ components }) => components);
        expect([...bound].sort()).toEqual(topology.components.map(({ id }) => id).sort());
        expect(new Set(bound).size).toBe(bound.length);
        expect(mechanism.units).toEqual({ length: 'm', angle: 'deg' });
        expect(mechanism.joints['slide']).toMatchObject({
          limits: { lower: -carriagePosition / 1000, upper: (defaultParams.travel - carriagePosition) / 1000 },
        });
        const moved = pose(mechanism, { turn: 90 });
        expect(moved.coordinates['slide']).toBeCloseTo(0.001, 12);
        expect(moved.linkTransforms['carriage']![12]).toBeCloseTo(0.001, 12);
        expect(moved.linkTransforms['frame']).toEqual(identity);
        expect(moved.linkTransforms['spindle']).not.toEqual(identity);
        const clip = mechanism.animations![0]!;
        const atFront = pose(mechanism, sampleAnimation({ animation: clip, time: 1 }));
        expect(atFront.coordinates['slide']).toBeCloseTo(-carriagePosition / 1000, 12);
        const atRear = pose(mechanism, sampleAnimation({ animation: clip, time: 3 }));
        expect(atRear.coordinates['slide']).toBeCloseTo((defaultParams.travel - carriagePosition) / 1000, 12);
        expect(Object.values(pose(mechanism, {}).linkTransforms)).toEqual([identity, identity, identity]);
        const nut = root.listNodes().find((node) => node.getName() === partNames.nut);
        expect(nut?.getMesh()?.listPrimitives()[0]?.getMaterial()?.getBaseColorFactor()).toEqual([0.6, 0.3, 0.1, 1]);
        expect(
          root.listMeshes().every((mesh) => mesh.listPrimitives().every((primitive) => primitive.getMaterial())),
        ).toBe(true);
      }
      const plain = await (async () => {
        const document = client.open({ source: { path: 'main.ts' } });
        try {
          return await document.export('glb');
        } finally {
          document.close();
        }
      })();
      if (!plain.success) {
        throw new Error(JSON.stringify(plain.issues));
      }
      const document = await io.readBinary(plain.files[0].bytes);
      expect(document.getRoot().getExtension('TAU_cad_topology')).toBeNull();
      expect(
        document
          .getRoot()
          .listNodes()
          .map((node) => node.getName()),
      ).toEqual(Object.values(partNames));
    } finally {
      client.terminate();
    }
  }, 180_000);

  it('should render and pose the complete model in the shipped PicoVoxel motion reference', async () => {
    const reference = readFileSync(
      new URL('../../../packages/plugins/picovoxel/agent/cad-picovoxel/kinematics-reference.md', import.meta.url),
      'utf8',
    );
    const source = /## Complete hinged model\n\n```typescript\n([\s\S]*?)\n```/u.exec(reference)?.[1];
    if (source === undefined) {
      throw new Error('The shipped reference must include its complete hinged model.');
    }
    const directory = mkdtempSync(join(tmpdir(), 'tau-picovoxel-hinge-'));
    const client = await createExampleRuntimeClient(directory);
    const io = await createNodeIo();
    try {
      const result = await (async () => {
        const document = client.open({ source: { files: { 'main.ts': source }, entry: 'main.ts' } });
        try {
          return await document.export('glb', { content: { includeTopology: true } });
        } finally {
          document.close();
        }
      })();
      if (!result.success) {
        throw new Error(JSON.stringify(result.issues));
      }
      expect(result.issues).toEqual([]);
      const document = await io.readBinary(result.files[0].bytes);
      const payload: unknown = document.getRoot().getExtension<TauCadTopologyRoot>('TAU_cad_topology')?.getPayload();
      const topology = payload as TauCadTopologyPayload;
      const mechanism = admit(topology.mechanism);
      const coordinates = sampleAnimation({ animation: mechanism.animations![0]!, time: 1 });
      expect(coordinates).toEqual({ hinge: 55 });
      expect(pose(mechanism, coordinates).linkTransforms['lid']).not.toEqual(identity);
      expect(pose(mechanism, {}).linkTransforms['lid']).toEqual(identity);
      expect(topology.components.map(({ name }) => name)).toEqual(['Base', 'Lid']);
    } finally {
      client.terminate();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
