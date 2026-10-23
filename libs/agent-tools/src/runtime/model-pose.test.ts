import { describe, expect, it } from 'vitest';

import { glbChunks } from '#runtime/glb-chunks.js';
import { poseModelGlb, readModelMechanism, resolveModelPose } from '#runtime/model-pose.js';
import { glbOf, planetaryGlb as planetary } from '#runtime/planetary-glb.fixture.js';

const nodesOf = (content: Uint8Array<ArrayBuffer>): ReadonlyArray<Readonly<Record<string, unknown>>> =>
  glbChunks(content)?.json['nodes'] as ReadonlyArray<Readonly<Record<string, unknown>>>;

const close = (actual: unknown, expected: readonly number[]): void => {
  expect(Array.isArray(actual)).toBe(true);
  for (const [index, value] of expected.entries()) {
    expect((actual as number[])[index]).toBeCloseTo(value, 9);
  }
};

describe('resolveModelPose', () => {
  it('should sample an animation and report every coordinate, the coupled follower included', () => {
    const admitted = readModelMechanism(planetary());

    expect(admitted).toBeDefined();
    expect(resolveModelPose(admitted!, { animation: { id: 'four-sun-turns', time: 2 } })).toStrictEqual({
      status: 'posed',
      coordinates: { sun: 360, carrier: 90 },
      atLimit: [],
    });
  });

  it('should take driver coordinates, leaving the others at their as-built value', () => {
    expect(resolveModelPose(readModelMechanism(planetary())!, { coordinates: { sun: 40 } })).toStrictEqual({
      status: 'posed',
      coordinates: { sun: 40, carrier: 10 },
      atLimit: [],
    });
  });

  it('should refuse an animation the mechanism does not declare, naming the ones it does', () => {
    expect(resolveModelPose(readModelMechanism(planetary())!, { animation: { id: 'spin', time: 0 } })).toStrictEqual({
      status: 'refused',
      message: "This model's mechanism has no animation spin; it offers four-sun-turns.",
    });
  });

  it('should refuse a follower or unknown coordinate with the solver path', () => {
    const outcome = resolveModelPose(readModelMechanism(planetary())!, { coordinates: { carrier: 5 } });

    expect(outcome.status).toBe('refused');
    expect(outcome).toHaveProperty('message', expect.stringContaining('/coordinates/carrier'));
    expect(outcome).toHaveProperty('message', expect.stringContaining('Its driver coordinates are sun.'));
  });
});

describe('poseModelGlb', () => {
  it('should leave a pose at the as-built coordinates drawing every node where it was', () => {
    const outcome = poseModelGlb(planetary(), { animation: { id: 'four-sun-turns', time: 0 } });

    expect(outcome.status).toBe('posed');
    const nodes = nodesOf((outcome as { content: Uint8Array<ArrayBuffer> }).content);
    close(nodes[1]?.['matrix'], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(nodes[0]).toStrictEqual({ name: 'Frame' });
  });

  it('should rotate each linked node about the joint in the scene frame, through its parent placement', () => {
    const outcome = poseModelGlb(planetary(), { coordinates: { sun: 360 } });

    expect(outcome).toMatchObject({ status: 'posed', coordinates: { sun: 360, carrier: 90 } });
    const nodes = nodesOf((outcome as { content: Uint8Array<ArrayBuffer> }).content);
    /* The carrier turns 90° about the scene's Z axis; under a parent at +X its local matrix is P⁻¹·R·P. */
    close(nodes[3]?.['matrix'], [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1]);
    expect(nodes[2]).toStrictEqual({ name: 'Group', translation: [1, 0, 0], children: [3] });
  });

  it('should keep the binary chunk byte for byte', () => {
    const source = planetary();
    const outcome = poseModelGlb(source, { coordinates: { sun: 90 } });

    expect(glbChunks((outcome as { content: Uint8Array<ArrayBuffer> }).content)?.bin).toStrictEqual(
      glbChunks(source)?.bin,
    );
  });

  it('should refuse a GLB that carries no mechanism', () => {
    expect(poseModelGlb(glbOf({ schemaVersion: 1, components: [] }, {}), { coordinates: {} })).toMatchObject({
      status: 'refused',
      message: expect.stringContaining('carries no mechanism') as string,
    });
  });
});
