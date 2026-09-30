// @vitest-environment node
import { createHash } from 'node:crypto';

import {
  transformGltfExportBytes,
  transformNormalArray,
  transformVertexArray,
  validateTauCadTopology,
} from '@taucad/geometry-core';
import type { TauCadTopologyPayload } from '@taucad/geometry-core';
import { describe, expect, it } from 'vitest';

import { picogkArtifactToGlb } from '#picogk-mesh.js';
import type { PicogkBuild } from '#picogk.protocol.js';

const artifact = (
  options: {
    readonly positions?: readonly number[];
    readonly normals?: readonly number[];
    readonly indices?: readonly number[];
    readonly color?: [number, number, number, number];
    readonly kind?: 'triangles' | 'lines';
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
  const componentBase = {
    id: 'component:picogk-1',
    name: 'Asymmetric',
    color: options.color ?? [1, 0, 0, 128 / 255],
    metallic: 0.25,
    roughness: 0.75,
    positionOffset: 0,
    positionCount: positions.length,
    normalOffset: positions.length * 4,
    indexOffset: (positions.length + normals.length) * 4,
    indexCount: indices.length,
  };
  const component: PicogkBuild['components'][number] =
    options.kind === 'lines'
      ? { ...componentBase, kind: 'lines', normalCount: 0 }
      : { ...componentBase, kind: 'triangles', normalCount: normals.length };
  const result: PicogkBuild = {
    artifactPath: '/private/model.tau-mesh',
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    components: [component],
    recycleAfterResponse: false,
    timings: {
      compileCacheHit: true,
      sourceRead: 0,
      parse: 0,
      analyze: 0,
      emit: 0,
      libraryInitialize: 0,
      entryPointInvoke: 0,
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
    readonly nodes: ReadonlyArray<{
      readonly mesh?: number;
      readonly name?: string;
      readonly extras?: { readonly tauComponentId?: string };
    }>;
    readonly meshes: ReadonlyArray<{
      readonly primitives: ReadonlyArray<{
        readonly mode?: number;
        readonly indices?: number;
        readonly material?: number;
        readonly attributes: Record<string, number>;
      }>;
    }>;
    readonly materials: ReadonlyArray<{ readonly pbrMetallicRoughness: Readonly<Record<string, unknown>> }>;
    readonly accessors: ReadonlyArray<{ readonly count: number; readonly bufferView: number }>;
    readonly extensions?: { readonly TAU_cad_topology?: { readonly topologyBufferView: number } };
    readonly bufferViews: ReadonlyArray<{ readonly byteOffset?: number; readonly byteLength: number }>;
  };
};

const topologyOf = (glb: Uint8Array<ArrayBuffer>): TauCadTopologyPayload => {
  const json = glbJson(glb);
  const binaryStart = 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true) + 8;
  const view = json.bufferViews[json.extensions?.TAU_cad_topology?.topologyBufferView ?? -1]!;
  return JSON.parse(
    new TextDecoder().decode(
      glb.subarray(binaryStart + (view.byteOffset ?? 0), binaryStart + (view.byteOffset ?? 0) + view.byteLength),
    ),
  ) as TauCadTopologyPayload;
};

/** Read one buffer view's bytes back out of the GLB's binary chunk. */
const viewBytes = (glb: Uint8Array<ArrayBuffer>, accessor: number): Uint8Array<ArrayBuffer> => {
  const json = glbJson(glb);
  const start = 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true) + 8;
  const view = json.bufferViews[json.accessors[accessor]!.bufferView]!;
  const offset = start + (view.byteOffset ?? 0);
  return Uint8Array.from(glb.subarray(offset, offset + view.byteLength));
};

describe('PicoGK mesh artifact adapter', () => {
  it('converts millimetre Z-up typed arrays to canonical GLB and mesh-only topology', () => {
    const { bytes, result } = artifact();
    const glb = picogkArtifactToGlb(bytes, result);
    const json = glbJson(glb);
    expect(json.nodes).toHaveLength(1);
    expect(json.meshes[0]?.primitives[0]?.mode).toBe(4);

    const binaryStart = 20 + new DataView(glb.buffer).getUint32(12, true) + 8;
    const topologyView = json.bufferViews[json.extensions?.TAU_cad_topology?.topologyBufferView ?? -1]!;
    const start = binaryStart + (topologyView.byteOffset ?? 0);
    const topology = JSON.parse(
      new TextDecoder().decode(glb.subarray(start, start + topologyView.byteLength)),
    ) as unknown as TauCadTopologyPayload;
    expect(topology.components[0]).toMatchObject({
      id: 'component:picogk-1',
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

  it('should encode exactly the canonical geometry-core transform of the worker arrays', () => {
    // The adapter fuses validation into its own rotation loop rather than calling these helpers,
    // so this pins the encoded bytes to the canonical transform they replaced.
    const positions = [1000, -2000, 3000, 2000, 0, -3000, -0, 3000, 3000];
    const normals = [0, 0, 1, 0, -1, 0, -0, 0, 1];
    const indices = [0, 2, 1];
    const { bytes, result } = artifact({ positions, normals, indices });

    const glb = picogkArtifactToGlb(bytes, result);

    const primitive = glbJson(glb).meshes[0]!.primitives[0]!;
    expect(viewBytes(glb, primitive.attributes['POSITION']!)).toEqual(
      new Uint8Array(transformVertexArray(new Float32Array(positions)).buffer),
    );
    expect(viewBytes(glb, primitive.attributes['NORMAL']!)).toEqual(
      new Uint8Array(transformNormalArray(new Float32Array(normals)).buffer),
    );
    // The index view is shared straight through from the artifact; the writer makes the only copy.
    expect(viewBytes(glb, primitive.indices!)).toEqual(new Uint8Array(new Uint32Array(indices).buffer));
  });

  it('validates mapped material attributes and encoded resource ranges before GLB writing', () => {
    const base = artifact();
    const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
    const tangent = new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
    const image = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const bytes = Uint8Array.from([
      ...base.bytes,
      ...new Uint8Array(uv.buffer),
      ...new Uint8Array(tangent.buffer),
      ...image,
    ]);
    const component = {
      ...base.result.components[0]!,
      texCoordOffset: 84,
      texCoordCount: 6,
      tangentOffset: 108,
      tangentCount: 12,
      material: { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
    };
    const result: PicogkBuild = {
      ...base.result,
      components: [component],
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      images: [{ offset: 156, byteLength: image.length, mimeType: 'image/png' }],
      textures: [{ source: 0 }],
    };
    const glb = picogkArtifactToGlb(bytes, result);
    const primitive = glbJson(glb).meshes[0]!.primitives[0]!;
    // Optional offsets default to zero; the encoded attribute may precede the geometry ranges.
    for (const variant of [
      {
        bytes: Uint8Array.from([
          ...new Uint8Array(uv.buffer),
          ...base.bytes,
          ...new Uint8Array(tangent.buffer),
          ...image,
        ]),
        component: { ...component, positionOffset: 24, normalOffset: 60, indexOffset: 96, texCoordOffset: undefined },
      },
      {
        bytes: Uint8Array.from([
          ...new Uint8Array(tangent.buffer),
          ...base.bytes,
          ...new Uint8Array(uv.buffer),
          ...image,
        ]),
        component: {
          ...component,
          positionOffset: 48,
          normalOffset: 84,
          indexOffset: 120,
          texCoordOffset: 132,
          tangentOffset: undefined,
        },
      },
    ]) {
      const encoded = picogkArtifactToGlb(variant.bytes, {
        ...result,
        components: [variant.component],
        sha256: createHash('sha256').update(variant.bytes).digest('hex'),
      });
      const { attributes } = glbJson(encoded).meshes[0]!.primitives[0]!;
      expect(viewBytes(encoded, attributes['TEXCOORD_0']!)).toEqual(new Uint8Array(uv.buffer));
    }

    expect(viewBytes(glb, primitive.attributes['TEXCOORD_0']!)).toEqual(new Uint8Array(uv.buffer));
    expect(viewBytes(glb, primitive.attributes['TANGENT']!)).toEqual(
      new Uint8Array(new Float32Array([1, 0, -0, 1, 1, 0, -0, 1, 1, 0, -0, 1]).buffer),
    );
    for (const change of [{ texCoordCount: 4 }, { tangentCount: 8 }, { texCoordOffset: 0 }, { tangentOffset: 1000 }]) {
      expect(() => picogkArtifactToGlb(bytes, { ...result, components: [{ ...component, ...change }] })).toThrow();
    }
    for (const range of [
      { offset: 0, byteLength: image.length },
      { offset: 156, byteLength: 1000 },
    ]) {
      expect(() => picogkArtifactToGlb(bytes, { ...result, images: [{ ...result.images![0]!, ...range }] })).toThrow(
        'image artifact range',
      );
    }
    expect(() => picogkArtifactToGlb(bytes, { ...result, textures: [{ source: 99 }] })).toThrow();
    expect(() =>
      picogkArtifactToGlb(bytes, {
        ...result,
        components: [{ ...component, kind: 'lines', normalCount: 0, indexCount: 2 }],
      }),
    ).toThrow('material attribute counts');
    const invalid = Uint8Array.from(bytes);
    new DataView(invalid.buffer).setFloat32(84, Number.NaN, true);
    expect(() =>
      picogkArtifactToGlb(invalid, { ...result, sha256: createHash('sha256').update(invalid).digest('hex') }),
    ).toThrow();
  });

  it('rejects duplicate authored names and warns on invalid mechanism structure', () => {
    const { bytes, result } = artifact();
    expect(() =>
      picogkArtifactToGlb(bytes, { ...result, components: [result.components[0]!, result.components[0]!] }),
    ).toThrow('already in use');
    const warnings: unknown[] = [];
    const glb = picogkArtifactToGlb(bytes, { ...result, mechanism: { schemaVersion: 2 } }, (issues) =>
      warnings.push(...issues),
    );
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'INVALID_ANNOTATION' })]));
    expect(topologyOf(glb).mechanism).toBeUndefined();
  });

  it('keeps the worker component id stable when its display name changes', () => {
    const { bytes, result } = artifact({ color: [0, 1, 0, 1] });
    const glb = picogkArtifactToGlb(bytes, {
      ...result,
      components: [{ ...result.components[0]!, name: 'Shape 1' }],
    });
    expect(new TextDecoder().decode(glb)).toContain('component:picogk-1');
    expect(new TextDecoder().decode(glb)).not.toContain('"alphaMode":"BLEND"');
  });

  it('resolves authored names to IDs and transforms the full mechanism into GLB vertex space', () => {
    const first = artifact();
    const bytes = Uint8Array.from([...first.bytes, ...first.bytes]);
    const second = {
      ...first.result.components[0]!,
      id: 'component:picogk-2',
      name: 'Arm',
      positionOffset: first.bytes.byteLength,
      normalOffset: first.bytes.byteLength + first.result.components[0]!.normalOffset,
      indexOffset: first.bytes.byteLength + first.result.components[0]!.indexOffset,
    };
    const result = {
      ...first.result,
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      components: [{ ...first.result.components[0]!, name: 'Base' }, second],
      mechanism: {
        schemaVersion: 1,
        units: { length: 'mm', angle: 'rad' },
        root: 'base',
        links: { base: { shapes: ['Base'] }, arm: { shapes: ['Arm'] } },
        joints: {
          hinge: {
            type: 'revolute',
            parent: 'base',
            child: 'arm',
            origin: [0, 0, 3000],
            axis: [0, 0, 1],
            limits: { lower: -1, upper: 1 },
          },
        },
        animations: [
          {
            id: 'spin',
            duration: 1,
            keyframes: [
              { time: 0, coordinates: { hinge: 0 } },
              { time: 1, coordinates: { hinge: 1 } },
            ],
          },
        ],
      },
    } satisfies PicogkBuild;
    const warnings: unknown[] = [];
    const glb = picogkArtifactToGlb(bytes, result, (issues) => warnings.push(...issues));
    const topology = topologyOf(glb);
    expect(warnings).toEqual([]);
    expect(glbJson(glb).nodes.map(({ extras }) => extras?.tauComponentId)).toEqual([
      'component:picogk-1',
      'component:picogk-2',
    ]);
    expect(topology.mechanism).toMatchObject({
      units: { length: 'm', angle: 'rad' },
      links: { base: { components: ['component:picogk-1'] }, arm: { components: ['component:picogk-2'] } },
      joints: { hinge: { origin: [0, 3, 0], axis: [0, 1, 0], limits: { lower: -1, upper: 1 } } },
      animations: [{ id: 'spin', keyframes: [{ coordinates: { hinge: 0 } }, { coordinates: { hinge: 1 } }] }],
    });
  });

  it('keeps valid geometry when mechanism metadata is invalid and reserves authored Shape N labels', () => {
    const { bytes, result } = artifact();
    const warnings: Array<{ code: string }> = [];
    const glb = picogkArtifactToGlb(
      bytes,
      {
        ...result,
        components: [{ ...result.components[0]!, name: undefined }],
        mechanism: {
          schemaVersion: 1,
          units: { length: 'mm', angle: 'deg' },
          root: 'base',
          links: { base: { shapes: ['Shape 1'] } },
          joints: {},
        },
      },
      (issues) => warnings.push(...issues),
    );
    expect(glbJson(glb).nodes[0]?.name).toBe('Shape 1');
    expect(topologyOf(glb).mechanism).toBeUndefined();
    expect(warnings).toMatchObject([{ code: 'INVALID_REFERENCE' }]);
  });

  it('keeps authored Shape N names ahead of generated fallback labels', () => {
    const first = artifact();
    const bytes = Uint8Array.from([...first.bytes, ...first.bytes]);
    const source = first.result.components[0]!;
    const glb = picogkArtifactToGlb(bytes, {
      ...first.result,
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      components: [
        { ...source, name: undefined },
        {
          ...source,
          id: 'component:picogk-2',
          name: 'Shape 1',
          positionOffset: source.positionOffset + first.bytes.byteLength,
          normalOffset: source.normalOffset + first.bytes.byteLength,
          indexOffset: source.indexOffset + first.bytes.byteLength,
        },
      ],
    });
    expect(glbJson(glb).nodes.map(({ name }) => name)).toEqual(['Shape 2', 'Shape 1']);
    expect(topologyOf(glb).components.map(({ name }) => name)).toEqual(['Shape 2', 'Shape 1']);
  });

  it('preserves mesh topology and re-expresses mechanism on millimetre Z-up export', async () => {
    const base = artifact();
    const slider = artifact({ kind: 'lines', positions: [0, 0, 0, 1000, 0, 0], normals: [], indices: [0, 1] });
    const bytes = Uint8Array.from([...base.bytes, ...slider.bytes]);
    const line = slider.result.components[0]!;
    const result: PicogkBuild = {
      ...base.result,
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      components: [
        { ...base.result.components[0]!, name: 'Base' },
        {
          ...line,
          id: 'component:picogk-2',
          name: 'Slider',
          positionOffset: line.positionOffset + base.bytes.byteLength,
          normalOffset: line.normalOffset + base.bytes.byteLength,
          indexOffset: line.indexOffset + base.bytes.byteLength,
        },
      ],
      mechanism: {
        schemaVersion: 1,
        units: { length: 'mm', angle: 'rad' },
        root: 'base',
        links: { base: { shapes: ['Base'] }, slider: { shapes: ['Slider'] } },
        joints: {
          slide: {
            type: 'prismatic',
            parent: 'base',
            child: 'slider',
            origin: [0, 0, 3000],
            axis: [1, 0, 0],
            limits: { lower: 0, upper: 1000 },
          },
        },
        animations: [
          {
            id: 'move',
            duration: 1,
            keyframes: [
              { time: 0, coordinates: { slide: 0 } },
              { time: 1, coordinates: { slide: 500 } },
            ],
          },
        ],
      },
    };
    const glb = picogkArtifactToGlb(bytes, {
      ...result,
    });
    const exported = await transformGltfExportBytes(glb, {
      format: 'glb',
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      preserveMeshTopology: true,
    });
    const json = glbJson(exported);
    const topology = topologyOf(exported);
    expect(json.nodes.map(({ extras }) => extras?.tauComponentId)).toEqual([
      'component:picogk-1',
      'component:picogk-2',
    ]);
    expect(topology.components.map(({ primitiveRefs }) => primitiveRefs)).toEqual([
      [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
      [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }],
    ]);
    expect(topology.mechanism).toMatchObject({
      units: { length: 'mm', angle: 'rad' },
      links: { base: { components: ['component:picogk-1'] }, slider: { components: ['component:picogk-2'] } },
      joints: { slide: { origin: [0, 0, 3000], axis: [1, 0, 0], limits: { lower: 0, upper: 1000 } } },
      animations: [{ id: 'move', keyframes: [{ coordinates: { slide: 0 } }, { coordinates: { slide: 500 } }] }],
    });
    expect(
      validateTauCadTopology(topology, {
        nodes: json.nodes.map(({ mesh }) => ({ meshIndex: mesh })),
        meshes: json.meshes.map(({ primitives }) =>
          primitives.map(({ mode = 4, indices }) => ({
            mode,
            indexCount: json.accessors[indices!]!.count,
          })),
        ),
      }),
    ).toEqual([]);
    const stripped = await transformGltfExportBytes(glb, {
      format: 'glb',
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });
    expect(glbJson(stripped).extensions?.TAU_cad_topology).toBeUndefined();
    expect(glbJson(stripped).nodes.every(({ extras }) => extras?.tauComponentId === undefined)).toBe(true);
  });

  it('should write roughnessFactor only when it differs from the glTF default of 1', () => {
    const { bytes, result } = artifact();
    const material = (roughness: number) => {
      const json = glbJson(
        picogkArtifactToGlb(bytes, { ...result, components: [{ ...result.components[0]!, roughness }] }),
      );
      return json.materials[json.meshes[0]!.primitives[0]!.material!]!.pbrMetallicRoughness;
    };
    expect(material(0.75)).toMatchObject({ metallicFactor: 0.25, roughnessFactor: 0.75 });
    expect(material(1)).toHaveProperty('metallicFactor', 0.25);
    expect(material(1)).not.toHaveProperty('roughnessFactor');
  });

  it('preserves captured polylines as GLB line primitives and edge topology', () => {
    const { bytes, result } = artifact({
      kind: 'lines',
      positions: [0, 0, 0, 10, 0, 0],
      normals: [],
      indices: [0, 1],
      color: [0, 0, 1, 1],
    });
    const glb = picogkArtifactToGlb(bytes, result);
    const json = glbJson(glb);
    expect(json.meshes[0]?.primitives[0]?.mode).toBe(1);
    expect(new TextDecoder().decode(glb)).toContain('node/0/edges');
    expect(new TextDecoder().decode(glb)).toContain('polyline');
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
    ['empty positions', () => artifact({ positions: [] }), /triangles shape/],
    ['normal count', () => artifact({ normals: [0, 0, 1] }), /triangles shape/],
    ['triangle count', () => artifact({ indices: [0, 1] }), /triangles shape/],
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
    [
      'positive infinity',
      () => artifact({ positions: [0, 0, 0, 1, 0, 0, 0, Number.POSITIVE_INFINITY, 0] }),
      /mesh values/,
    ],
    [
      'negative infinity',
      () => artifact({ positions: [0, 0, Number.NEGATIVE_INFINITY, 1, 0, 0, 0, 1, 0] }),
      /mesh values/,
    ],
    ['non-finite normal', () => artifact({ normals: [0, 0, 1, 0, Number.NaN, 1, 0, 0, 1] }), /mesh values/],
    ['infinite normal', () => artifact({ normals: [0, 0, 1, 0, 0, 1, Number.POSITIVE_INFINITY, 0, 1] }), /mesh values/],
    ['index range', () => artifact({ indices: [0, 1, 3] }), /mesh values/],
  ])('rejects an invalid %s', (_name, mutate, message) => {
    const value = mutate(artifact());
    expect(() => picogkArtifactToGlb(value.bytes, value.result as PicogkBuild)).toThrow(message);
  });
});
