// @vitest-environment node
import { createHash } from 'node:crypto';

import { validateTauCadTopology } from '@taucad/geometry-core';
import type { TauCadTopologyPayload } from '@taucad/geometry-core';
import { describe, expect, it } from 'vitest';

import { picogkArtifactToGlb } from '#picogk-mesh.js';
import type { PicogkBuild } from '#picogk.protocol.js';

const artifact = (
  options: {
    readonly positions?: readonly number[];
    readonly normals?: readonly number[];
    readonly indices?: readonly number[];
    readonly color?: string;
  } = {},
) => {
  const positions = options.positions ?? [1000, 2000, 3000, 2000, 2000, 3000, 1000, 3000, 3000];
  const normals = options.normals ?? [0, 0, 1, 0, 0, 1, 0, 0, 1];
  const indices = options.indices ?? [0, 1, 2];
  const bytes = new Uint8Array((positions.length + normals.length + indices.length) * 4);
  const view = new DataView(bytes.buffer);
  for (const [index, value] of positions.entries()) {
    view.setFloat32(index * 4, value, true);
  }
  for (const [index, value] of normals.entries()) {
    view.setFloat32((positions.length + index) * 4, value, true);
  }
  for (const [index, value] of indices.entries()) {
    view.setUint32((positions.length + normals.length + index) * 4, value, true);
  }
  const result: PicogkBuild = {
    artifactPath: '/private/model.tau-mesh',
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    components: [
      {
        name: 'Asymmetric',
        color: options.color ?? '#ff000080',
        positionOffset: 0,
        positionCount: positions.length,
        normalOffset: positions.length * 4,
        normalCount: normals.length,
        indexOffset: (positions.length + normals.length) * 4,
        indexCount: indices.length,
      },
    ],
    recycleAfterResponse: false,
    timings: {
      compileCacheHit: true,
      sourceRead: 0,
      parse: 0,
      analyze: 0,
      emit: 0,
      libraryInitialize: 0,
      modelInvoke: 0,
      meshConstruction: 0,
      meshExtraction: 0,
      normalGeneration: 0,
      artifactWrite: 0,
      unload: 0,
    },
    metrics: { managedHeapBytes: 0, picoGkNativeBytes: 0, processWorkingSetBytes: 0 },
  };
  return { bytes, result };
};

const glbJson = (bytes: Uint8Array<ArrayBuffer>) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    readonly nodes: ReadonlyArray<{ readonly mesh?: number }>;
    readonly meshes: ReadonlyArray<{
      readonly primitives: ReadonlyArray<{ readonly mode?: number; readonly indices?: number }>;
    }>;
    readonly accessors: ReadonlyArray<{ readonly count: number }>;
    readonly extensions: { readonly TAU_cad_topology: { readonly topologyBufferView: number } };
    readonly bufferViews: ReadonlyArray<{ readonly byteOffset?: number; readonly byteLength: number }>;
  };
};

describe('PicoGK mesh artifact adapter', () => {
  it('converts millimetre Z-up typed arrays to canonical GLB and mesh-only topology', () => {
    const { bytes, result } = artifact();
    const glb = picogkArtifactToGlb(bytes, result);
    const json = glbJson(glb);
    expect(json.nodes).toHaveLength(1);
    expect(json.meshes[0]?.primitives[0]?.mode).toBe(4);

    const binaryStart = 20 + new DataView(glb.buffer).getUint32(12, true) + 8;
    const topologyView = json.bufferViews[json.extensions.TAU_cad_topology.topologyBufferView]!;
    const start = binaryStart + (topologyView.byteOffset ?? 0);
    const topology = JSON.parse(
      new TextDecoder().decode(glb.subarray(start, start + topologyView.byteLength)),
    ) as unknown as TauCadTopologyPayload;
    expect(topology.components[0]).toMatchObject({
      id: 'component:asymmetric',
      name: 'Asymmetric',
      kind: 'mesh',
      color: [1, 0, 0, expect.closeTo(128 / 255)],
      capabilities: { hasPreciseTopology: false },
    });
    expect(
      validateTauCadTopology(topology, {
        nodes: json.nodes.map(({ mesh }) => ({ meshIndex: mesh })),
        meshes: json.meshes.map(({ primitives }) =>
          primitives.map(({ mode = 4, indices }) => ({ mode, indexCount: json.accessors[indices!]!.count })),
        ),
      }),
    ).toEqual([]);
  });

  it('uses a generated component id and an opaque material for generated names', () => {
    const { bytes, result } = artifact({ color: '#00ff00ff' });
    const glb = picogkArtifactToGlb(bytes, {
      ...result,
      components: [{ ...result.components[0]!, name: 'Shape 1' }],
    });
    expect(new TextDecoder().decode(glb)).toContain('component:node-0');
    expect(new TextDecoder().decode(glb)).not.toContain('"alphaMode":"BLEND"');
  });

  it.each([
    [
      'descriptor size',
      ({ bytes, result }: ReturnType<typeof artifact>) => ({ bytes, result: { ...result, byteLength: 1 } }),
      /byte length/,
    ],
    [
      'digest',
      ({ bytes, result }: ReturnType<typeof artifact>) => ({ bytes, result: { ...result, sha256: '0'.repeat(64) } }),
      /integrity/,
    ],
    ['empty positions', () => artifact({ positions: [] }), /mesh shape/],
    ['normal count', () => artifact({ normals: [0, 0, 1] }), /mesh shape/],
    ['triangle count', () => artifact({ indices: [0, 1] }), /mesh shape/],
    [
      'unaligned range',
      ({ bytes, result }: ReturnType<typeof artifact>) => ({
        bytes,
        result: {
          ...result,
          components: [
            {
              ...result.components[0]!,
              positionOffset: 1,
              positionCount: 3,
              normalOffset: 16,
              normalCount: 3,
              indexOffset: 28,
            },
          ],
        },
      }),
      /Float32 artifact range/,
    ],
    [
      'out-of-bounds range',
      ({ bytes, result }: ReturnType<typeof artifact>) => ({
        bytes,
        result: { ...result, components: [{ ...result.components[0]!, indexOffset: bytes.byteLength }] },
      }),
      /Uint32 artifact range/,
    ],
    [
      'overlap',
      ({ bytes, result }: ReturnType<typeof artifact>) => ({
        bytes,
        result: { ...result, components: [{ ...result.components[0]!, normalOffset: 0 }] },
      }),
      /overlapping/,
    ],
    ['non-finite', () => artifact({ positions: [Number.NaN, 0, 0, 1, 0, 0, 0, 1, 0] }), /mesh values/],
    ['index range', () => artifact({ indices: [0, 1, 3] }), /mesh values/],
  ])('rejects an invalid %s', (_name, mutate, message) => {
    const value = mutate(artifact());
    expect(() => picogkArtifactToGlb(value.bytes, value.result as PicogkBuild)).toThrow(message);
  });
});
