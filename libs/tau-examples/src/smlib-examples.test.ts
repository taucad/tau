import { fileURLToPath } from 'node:url';
import { createNodeIo } from '@taucad/geometry-core';
import type { TauCadTopologyPayload, TauCadTopologyRoot } from '@taucad/geometry-core';
import { admitMechanism, evaluatePose, sampleAnimation } from '@taucad/kinematics';
import type { Mechanism } from '@taucad/kinematics';
import { describe, expect, it } from 'vitest';
import { createExampleRuntimeClient } from '#scripts/runtime.js';
import { defaultParams, mechanism as boxMechanism, partNames } from '#kernels/smlib/hinged-box/main.js';

const examplePath = (name: string): string => fileURLToPath(new URL(`kernels/smlib/${name}/`, import.meta.url));
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

/** Export one example's GLB through the public example runtime and decode it. */
const exportGlb = async (name: string, content?: { includeTopology: true }) => {
  const client = await createExampleRuntimeClient(examplePath(name));
  try {
    const document = client.open({ source: { path: 'main.ts' } });
    try {
      const result = await document.export('glb', content ? { content } : undefined);
      if (!result.success) {
        throw new Error(JSON.stringify(result.issues));
      }
      expect(result.issues).toEqual([]);
      const io = await createNodeIo();
      return await io.readBinary(result.files[0].bytes);
    } finally {
      document.close();
    }
  } finally {
    client.terminate();
  }
};

describe('SMLib examples', () => {
  it.each([{ maxOpening: 0 }, { maxOpening: 181 }, { wall: 20 }, { hingeRadius: Number.NaN }])(
    'should reject invalid hinged-box parameters %j',
    (parameters) => {
      expect(() => boxMechanism({ ...defaultParams, ...parameters })).toThrow(RangeError);
    },
  );

  it('should deliver the hinged box with named parts and an opening lid', async () => {
    const document = await exportGlb('hinged-box', { includeTopology: true });
    const payload: unknown = document.getRoot().getExtension<TauCadTopologyRoot>('TAU_cad_topology')?.getPayload();
    const topology = payload as TauCadTopologyPayload;
    expect(topology.components.map(({ name }) => name)).toEqual(Object.values(partNames));

    const mechanism = admit(topology.mechanism);
    const bound = Object.values(mechanism.links).flatMap(({ components }) => components);
    expect([...bound].sort()).toEqual(topology.components.map(({ id }) => id).sort());
    expect(mechanism.joints['hinge']).toMatchObject({ limits: { lower: 0, upper: defaultParams.maxOpening } });

    const clip = mechanism.animations![0]!;
    const open = pose(mechanism, sampleAnimation({ animation: clip, time: 2 }));
    expect(open.coordinates['hinge']).toBeCloseTo(defaultParams.maxOpening);
    expect(open.linkTransforms['body']).toEqual(identity);
    // Opened past vertical, the lid's local +Z points backwards (+Y) and no longer up.
    expect(open.linkTransforms['lid']![9]).toBeGreaterThan(0.9);
    expect(Object.values(pose(mechanism, {}).linkTransforms)).toEqual([identity, identity]);
  }, 180_000);

  it('should export the PBR showcase with one standard glTF material per specimen', async () => {
    const document = await exportGlb('pbr-materials');
    const root = document.getRoot();
    expect(root.listNodes().map((node) => node.getName())).toEqual([
      'Plinth',
      'Brushed steel',
      'Clear-coated paint',
      'Glass',
      'Polished gold',
      'Velvet',
      'Glowing ring',
    ]);
    expect(root.listExtensionsUsed().map((extension) => extension.extensionName)).toEqual(
      expect.arrayContaining([
        'KHR_materials_anisotropy',
        'KHR_materials_clearcoat',
        'KHR_materials_transmission',
        'KHR_materials_ior',
        'KHR_materials_volume',
        'KHR_materials_sheen',
        'KHR_materials_emissive_strength',
      ]),
    );
    const gold = root.listNodes().find((node) => node.getName() === 'Polished gold');
    expect(gold?.getMesh()?.listPrimitives()[0]?.getMaterial()?.getMetallicFactor()).toBe(1);
  }, 180_000);

  it('should cut the parametric plate hole grid', async () => {
    const document = await exportGlb('parametric-plate');
    expect(
      document
        .getRoot()
        .listNodes()
        .map((node) => node.getName()),
    ).toEqual(['Mounting plate']);
  }, 180_000);
});
