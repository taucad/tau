import { describe, expect, it, vi } from 'vitest';
import type { ExportFile } from '@taucad/types';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import {
  canonicalPartPreview,
  canonicalPartPreviews,
  sourceGlbDigest,
  visualGlbDigest,
} from '#services/part-thumbnail-visual.js';

const glb = (
  topology: number,
  visual: number,
  {
    extension = 'TAU_cad_topology',
    extraExtension,
    accessorCount = 4,
  }: { extension?: string; extraExtension?: string; accessorCount?: number } = {},
): Uint8Array<ArrayBuffer> => {
  const bin = new Uint8Array([visual, 0, 0, 0, topology, 0, 0, 0]);
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 4 },
      { buffer: 0, byteOffset: 4, byteLength: 4 },
    ],
    accessors: [{ bufferView: 0, componentType: 5121, count: accessorCount, type: 'SCALAR' }],
    extensionsUsed: extraExtension ? [extension, extraExtension] : [extension],
    extensions: {
      [extension]: { bufferView: 1, density: topology },
      ...(extraExtension ? { [extraExtension]: { bufferView: 1 } } : {}),
    },
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.byteLength / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + padded + 8 + bin.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.fill(0x20, 20, 20 + padded);
  bytes.set(encoded, 20);
  view.setUint32(20 + padded, bin.byteLength, true);
  view.setUint32(24 + padded, 0x00_4e_49_42, true);
  bytes.set(bin, 28 + padded);
  return bytes;
};

describe('visualGlbDigest', () => {
  it('ignores Tau physical topology but keeps visual bytes in its key', async () => {
    const first = await visualGlbDigest(glb(1, 5));
    expect(await visualGlbDigest(glb(2, 5))).toBe(first);
    expect(await visualGlbDigest(glb(1, 6))).not.toBe(first);
  });

  it('retains the full artifact for unknown extensions with unclassified byte ownership', async () => {
    const first = await visualGlbDigest(glb(1, 5, { extension: 'VENDOR_visual_payload' }));
    expect(await visualGlbDigest(glb(2, 5, { extension: 'VENDOR_visual_payload' }))).not.toBe(first);
  });

  it('does not drop payloads from an unrecognized KHR material extension', async () => {
    const first = await visualGlbDigest(glb(1, 5, { extraExtension: 'KHR_materials_future' }));
    expect(await visualGlbDigest(glb(2, 5, { extraExtension: 'KHR_materials_future' }))).not.toBe(first);
  });
});

const placedGlb = ({
  translation,
  rotation,
  scale,
  intrinsicRotation = [0, 0, 0, 1],
  topology = 1,
  accessorCount = 4,
}: {
  readonly translation: number;
  readonly rotation: readonly number[];
  readonly scale: readonly number[];
  readonly intrinsicRotation?: readonly number[];
  readonly topology?: number;
  readonly accessorCount?: number;
}): Uint8Array<ArrayBuffer> => {
  const id = `occ:${Array.from(new TextEncoder().encode(JSON.stringify(['occurrence', 'placed'])), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
  const source = glb(topology, 5, { accessorCount });
  const view = new DataView(source.buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(source.subarray(20, 20 + jsonLength))) as Record<string, unknown>;
  json['nodes'] = [
    { extras: { tauComponentId: id }, translation: [translation, 0, 0], rotation, scale, children: [1] },
    { mesh: 0, rotation: intrinsicRotation },
  ];
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF uses uppercase semantic names.
  json['meshes'] = [{ primitives: [{ attributes: { POSITION: 0 } }] }];
  const bin = source.subarray(28 + jsonLength);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.byteLength / 4) * 4;
  const result = new Uint8Array(12 + 8 + padded + 8 + bin.byteLength);
  const output = new DataView(result.buffer);
  output.setUint32(0, 0x46_54_6c_67, true);
  output.setUint32(4, 2, true);
  output.setUint32(8, result.byteLength, true);
  output.setUint32(12, padded, true);
  output.setUint32(16, 0x4e_4f_53_4a, true);
  result.fill(0x20, 20, 20 + padded);
  result.set(encoded, 20);
  output.setUint32(20 + padded, bin.byteLength, true);
  output.setUint32(24 + padded, 0x00_4e_49_42, true);
  result.set(bin, 28 + padded);
  return result;
};

it('keeps a rigid occurrence preview key while source bytes and pose change', async () => {
  const identity = [0, 0, 0, 1];
  const quarterTurn = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  const first = placedGlb({ translation: 0, rotation: identity, scale: [1, 1, 1] });
  const moved = placedGlb({ translation: 12, rotation: quarterTurn, scale: [1, 1, 1] });
  const reference = [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }];
  expect(await sourceGlbDigest(moved)).not.toBe(await sourceGlbDigest(first));
  const original = await canonicalPartPreview(first, reference);
  const changed = await canonicalPartPreview(moved, reference);
  expect(changed?.key).toBe(original?.key);
  const scaled = await canonicalPartPreview(
    placedGlb({ translation: 12, rotation: identity, scale: [2, 2, 2] }),
    reference,
  );
  expect(scaled?.key).not.toBe(original?.key);
  expect(
    await canonicalPartPreview(
      placedGlb({ translation: 12, rotation: identity, scale: [1.0000005, 1.0000005, 1.0000005] }),
      reference,
    ),
  ).toBeUndefined();
  expect(
    await canonicalPartPreview(placedGlb({ translation: 12, rotation: identity, scale: [-1, 1, 1] }), reference),
  ).toBeUndefined();
  const internal = await canonicalPartPreview(
    placedGlb({
      translation: 0,
      rotation: identity,
      scale: [1, 1, 1],
      intrinsicRotation: quarterTurn,
    }),
    reference,
  );
  expect(internal?.key).not.toBe(original?.key);
});

const rewriteGlb = (
  source: Uint8Array<ArrayBuffer>,
  edit: (json: Record<string, unknown>) => void,
): Uint8Array<ArrayBuffer> => {
  const jsonLength = new DataView(source.buffer).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(source.subarray(20, 20 + jsonLength))) as Record<string, unknown>;
  edit(json);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.byteLength / 4) * 4;
  const remainder = source.subarray(20 + jsonLength);
  const result = new Uint8Array(20 + padded + remainder.byteLength);
  result.set(source.subarray(0, 12));
  const output = new DataView(result.buffer);
  output.setUint32(8, result.byteLength, true);
  output.setUint32(12, padded, true);
  output.setUint32(16, 0x4e_4f_53_4a, true);
  result.fill(0x20, 20, 20 + padded);
  result.set(encoded, 20);
  result.set(remainder, 20 + padded);
  return result;
};

function reusableScene({
  prefix = false,
  translation = 0,
  topology = 1,
  color = 0.5,
  texture = 'AA==',
  scale = [1, 1, 1],
  unrelatedColor = 0.1,
} = {}): Readonly<{
  content: Uint8Array<ArrayBuffer>;
  parts: Array<Array<{ nodeIndex: number; meshIndex: number; primitiveIndex: number }>>;
}> {
  const wrapper = (name: string, child: number) => ({
    name,
    extras: {
      tauComponentId: `occ:${Array.from(new TextEncoder().encode(JSON.stringify(['occurrence', name])), (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
    },
    translation: [translation, 0, 0],
    scale,
    children: [child],
  });
  const offset = prefix ? 2 : 0;
  const selectedMesh = prefix ? 1 : 0;
  const content = rewriteGlb(glb(topology, 5), (json) => {
    json['nodes'] = [
      ...(prefix ? [wrapper('unrelated', 1), { mesh: 0 }] : []),
      wrapper(`first-${prefix}`, offset + 1),
      { mesh: selectedMesh },
      wrapper(`second-${prefix}`, offset + 3),
      { mesh: selectedMesh },
      ...(prefix ? [] : [wrapper('unrelated', 5), { mesh: 1 }]),
    ];
    // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF names its position semantic POSITION.
    json['meshes'] = [0, 1].map((material) => ({ primitives: [{ attributes: { POSITION: selectedMesh }, material }] }));
    json['materials'] = (prefix ? [unrelatedColor, color] : [color, unrelatedColor]).map((shade) => ({
      pbrMetallicRoughness: { baseColorFactor: [shade, shade, shade, 1], baseColorTexture: { index: selectedMesh } },
    }));
    if (prefix) {
      json['accessors'] = [
        { bufferView: 0, componentType: 5121, count: 4, type: 'SCALAR' },
        ...(json['accessors'] as unknown[]),
      ];
    }
    json['textures'] = [...(prefix ? [{ source: 0 }] : []), { source: selectedMesh }];
    json['images'] = [
      ...(prefix ? [{ uri: 'data:image/png;base64,Ag==' }] : []),
      { uri: `data:image/png;base64,${texture}` },
    ];
  });
  return {
    content,
    parts: [offset + 1, offset + 3].map((nodeIndex) => [{ nodeIndex, meshIndex: selectedMesh, primitiveIndex: 0 }]),
  };
}

it('should key each selected visual closure independently of occurrence addresses and unrelated appearance', async () => {
  const first = reusableScene();
  const prepared = await canonicalPartPreviews(first.content, first.parts);
  expect(prepared.previews[0]?.key).toBeDefined();
  expect(prepared.previews[0]?.key).toBe(prepared.previews[1]?.key);
  const changed = reusableScene({ prefix: true, translation: 12, topology: 7, unrelatedColor: 0.9 });
  const moved = await canonicalPartPreviews(changed.content, changed.parts);
  expect(changed.parts).not.toEqual(first.parts);
  expect(moved.previews.map((preview) => preview?.key)).toEqual(prepared.previews.map((preview) => preview?.key));
  const unrelated = await canonicalPartPreview(first.content, [{ nodeIndex: 5, meshIndex: 1, primitiveIndex: 0 }]);
  expect(unrelated?.key).not.toBe(prepared.previews[0]?.key);
});

it('should preserve differing intrinsic child occurrence transforms beneath a common rigid ancestor', async () => {
  const nested = (translation: number, childOffset: number) =>
    rewriteGlb(reusableScene({ translation }).content, (json) => {
      const nodes = json['nodes'] as Array<Record<string, unknown>>;
      const first = { ...nodes[0], children: [1, 3] };
      const second = { ...nodes[2], children: [2], translation: [childOffset, 0, 0] };
      json['nodes'] = [
        first,
        second,
        { mesh: 0 },
        { ...second, children: [4], translation: [-childOffset, 0, 0] },
        { mesh: 0 },
      ];
    });
  const primitives = [
    { nodeIndex: 2, meshIndex: 0, primitiveIndex: 0 },
    { nodeIndex: 4, meshIndex: 0, primitiveIndex: 0 },
  ];
  const first = await canonicalPartPreviews(nested(0, 2), [primitives]);
  const moved = await canonicalPartPreviews(nested(12, 2), [primitives]);
  const changed = await canonicalPartPreviews(nested(0, 3), [primitives]);
  expect(first.previews[0]?.key).toBeDefined();
  expect(moved.previews[0]?.key).toBe(first.previews[0]?.key);
  expect(moved.renderContent?.()).toEqual(first.renderContent?.());
  expect(changed.previews[0]?.key).not.toBe(first.previews[0]?.key);
  const mixed = await canonicalPartPreviews(nested(0, 2), [primitives, [primitives[0]!]]);
  expect(mixed.previews).toEqual([undefined, undefined]);
  expect(mixed.renderContent).toBeUndefined();
});

it('should share reusable occurrence previews and miss only on selected appearance, texture, scale or mirror changes', async () => {
  const exportImage = vi.fn(
    async (): Promise<ExportFile[]> => [
      { name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) },
      { name: 'render-part-1.webp', mimeType: 'image/webp', bytes: new Uint8Array([4, 5, 6]) },
    ],
  );
  const service = new PartThumbnailService({ export: exportImage });
  const request = async (scene: ReturnType<typeof reusableScene>): Promise<void> => {
    const prepared = await canonicalPartPreviews(scene.content, scene.parts);
    service.request(
      {
        sourcePath: 'main.ts',
        geometryHash: await sourceGlbDigest(scene.content),
        visualKey: prepared.visualKey,
        content: scene.content,
        renderContent: prepared.renderContent,
      },
      scene.parts.map((primitives, partIndex) => ({
        id: `part-${partIndex}`,
        primitives,
        visualKey: prepared.previews[partIndex]?.key,
      })),
    );
    await vi.waitFor(() => {
      expect([...service.snapshot().values()].map((state) => state.status)).toEqual(['ready', 'ready']);
    });
  };
  try {
    await request(reusableScene());
    expect(exportImage).toHaveBeenCalledOnce();
    expect(service.get('part-0')?.bytes).toBe(service.get('part-1')?.bytes);
    await request(reusableScene({ prefix: true, translation: 12, topology: 7, unrelatedColor: 0.9 }));
    expect(exportImage).toHaveBeenCalledOnce();
    await request(reusableScene({ color: 0.8 }));
    expect(exportImage).toHaveBeenCalledTimes(2);
    await request(reusableScene({ texture: 'AQ==' }));
    expect(exportImage).toHaveBeenCalledTimes(3);
    await request(reusableScene({ scale: [2, 2, 2] }));
    expect(exportImage).toHaveBeenCalledTimes(4);
    await request(reusableScene({ scale: [-1, 1, 1] }));
    expect(exportImage).toHaveBeenCalledTimes(5);
  } finally {
    service.dispose();
  }
});

it('renders from one canonical GLB while preserving source transforms and current source hashes', async () => {
  const identity = [0, 0, 0, 1];
  const quarterTurn = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  const first = placedGlb({ translation: 0, rotation: identity, scale: [1, 1, 1] });
  const moved = placedGlb({ translation: 11, rotation: quarterTurn, scale: [1, 1, 1] });
  const parts = [[{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }]];
  const original = await canonicalPartPreviews(first, parts);
  const changed = await canonicalPartPreviews(moved, parts);
  expect(await sourceGlbDigest(first)).not.toBe(await sourceGlbDigest(moved));
  expect(original.previews[0]?.key).toBe(changed.previews[0]?.key);
  expect(original.renderContent?.()).toEqual(changed.renderContent?.());
  expect(original.renderContent?.()).toBe(original.renderContent?.());
  expect(first).not.toEqual(original.renderContent?.());
});

it('rejects a tiny sparse-style GLB with a huge decoded accessor before native allocation', async () => {
  const tiny = placedGlb({
    translation: 0,
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    accessorCount: 16_000_000,
  });
  expect(tiny.byteLength).toBeLessThan(1024);
  await expect(canonicalPartPreviews(tiny, [[{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }]])).rejects.toThrow(
    /decoded geometry exceeds 128 MiB/u,
  );
});

it('reuses the production preview without an image export after rigid pose or density-only changes', async () => {
  const reference = [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }];
  const first = placedGlb({ translation: 0, rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
  const moved = placedGlb({
    translation: 11,
    rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    scale: [1, 1, 1],
  });
  const changedDensity = placedGlb({
    translation: 11,
    rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    scale: [1, 1, 1],
    topology: 7,
  });
  const exportImage = vi.fn(
    async (): Promise<ExportFile[]> => [
      { name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) },
    ],
  );
  const service = new PartThumbnailService({ export: exportImage });
  try {
    for (const content of [first, moved, changedDensity]) {
      // oxlint-disable-next-line no-await-in-loop -- Each preview must settle before the next source changes its cache key.
      const prepared = await canonicalPartPreviews(content, [reference]);
      // oxlint-disable-next-line no-await-in-loop -- Hash each source in the same serial cache transition.
      const geometryHash = await sourceGlbDigest(content);
      service.request(
        {
          sourcePath: 'main.ts',
          geometryHash,
          content,
          renderContent: prepared.renderContent,
        },
        [{ id: 'part', primitives: reference, visualKey: prepared.previews[0]?.key ?? prepared.visualKey }],
      );
      // oxlint-disable-next-line no-await-in-loop -- Verify each complete cache state before changing the source.
      await vi.waitFor(() => {
        expect(service.get('part')?.status).toBe('ready');
      });
    }
    expect(exportImage).toHaveBeenCalledOnce();
  } finally {
    service.dispose();
  }
});
