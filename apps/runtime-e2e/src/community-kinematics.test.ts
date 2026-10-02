import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitMechanism, evaluatePose, listDegreesOfFreedom } from '@taucad/kinematics';
import { createExampleRuntimeClient } from '@taucad/tau-examples/runtime';
import { expect, it } from 'vitest';

const examplesRoot = fileURLToPath(new URL('../../../libs/tau-examples/src/kernels/replicad/', import.meta.url));
const examples = [
  'kestrel-240-quadcopter',
  'bench-vise',
  'standing-fan',
  'spur-gearbox',
  'wheelbarrow',
  'planetary-gear-system',
  'worm-gear-system',
  'six-axis-arm',
  'v8-engine',
  'turbofan',
];
const posedParameters: Record<string, Record<string, number>> = {
  'kestrel-240-quadcopter': { pitchDeg: 20, yawDeg: -10 },
  'bench-vise': { opening: 80, handleOffset: -40 },
  'standing-fan': { headHeight: 1240, tilt: 20, yaw: 30, bladeCount: 7 },
  'spur-gearbox': { inputAngle: 40, coverLift: 12 },
};

// Read the exported wire payload, rather than the mechanism author's shape-name map.
function readTopology(bytes: Uint8Array<ArrayBuffer>): {
  components: Array<{ id: string; name: string }>;
  mechanism?: unknown;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    extensions: { TAU_cad_topology: { topologyBufferView: number } };
    bufferViews: Array<{ byteOffset?: number; byteLength: number }>;
  };
  const topology = gltf.bufferViews[gltf.extensions.TAU_cad_topology.topologyBufferView]!;
  const start = 28 + jsonLength + (topology.byteOffset ?? 0);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + topology.byteLength))) as {
    components: Array<{ id: string; name: string }>;
    mechanism?: unknown;
  };
}

it.each(examples)('should export complete, playable Community kinematics for %s', async (name) => {
  const runtime = await createExampleRuntimeClient(resolve(examplesRoot, name));
  try {
    await runtime.connect();
    for (const parameters of [{}, ...(posedParameters[name] ? [posedParameters[name]] : [])]) {
      const document = runtime.open({ source: { path: 'main.ts' }, parameters });
      let result;
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Each pose uses the same isolated kernel client serially.
        result = await document.export('glb', {
          options: { unit: { length: 'meter' } },
          content: { includeTopology: true },
        });
      } finally {
        document.close();
      }
      if (!result.success) {
        throw new Error(JSON.stringify(result.issues));
      }
      const { bytes } = result.files[0];
      expect(bytes.byteLength).toBeGreaterThan(0);
      const topology = readTopology(bytes);
      const admitted = admitMechanism(topology.mechanism);
      if (admitted.status !== 'admitted') {
        throw new Error(JSON.stringify(admitted.issues));
      }
      const { mechanism } = admitted;
      expect(mechanism.units).toEqual({ length: 'm', angle: 'deg' });
      const bound = Object.values(mechanism.links).flatMap((link) => link.components);
      expect(new Set(bound).size).toBe(bound.length);
      expect([...bound].sort()).toEqual(topology.components.map(({ id }) => id).sort());
      expect(mechanism.animations?.length).toBeGreaterThan(0);
      for (const clip of mechanism.animations ?? []) {
        for (const keyframe of clip.keyframes) {
          const pose = evaluatePose({ mechanism, coordinates: keyframe.coordinates });
          if (pose.status !== 'posed') {
            throw new Error(JSON.stringify(pose.issues));
          }
          for (const [id, requested] of Object.entries(keyframe.coordinates)) {
            expect(pose.pose.coordinates[id]).toBeCloseTo(requested, 9);
          }
          // A mixed-unit coupling can land a floating-point ulp beyond an endpoint.
          // Check the actual travel rather than treating that advisory flag as lost motion.
          for (const { id, limits } of listDegreesOfFreedom(mechanism)) {
            if (limits) {
              expect(pose.pose.coordinates[id]!).toBeGreaterThanOrEqual(limits.lower - 1e-12);
              expect(pose.pose.coordinates[id]!).toBeLessThanOrEqual(limits.upper + 1e-12);
            }
          }
        }
      }
    }
  } finally {
    runtime.terminate();
  }
});
