import { describe, expect, it } from 'vitest';
import { Box3, Frustum, Plane, Vector3 } from 'three';
import type { AdmittedAssemblyGlbMetadata } from '@taucad/geometry-core';
import type { RenderFrame } from '@taucad/spatial';
import { createThreeRenderMatrix } from '@taucad/three/spatial';
import { createCanonicalGltfToTauMatrix } from '#components/geometry/graphics/three/gltf-world.js';
import {
  buildAssemblyDemandIndex,
  collectAssemblyResidentAncestorIndices,
  queryAssemblyDemandIndex,
} from '#components/geometry/graphics/three/utils/assembly-demand-index.js';

const frame = (x = 0, y = 0): readonly number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, 0, 1];
const boxFrustum = (min: readonly [number, number, number], max: readonly [number, number, number]): Frustum =>
  new Frustum(
    new Plane(new Vector3(1, 0, 0), -min[0]),
    new Plane(new Vector3(-1, 0, 0), max[0]),
    new Plane(new Vector3(0, 1, 0), -min[1]),
    new Plane(new Vector3(0, -1, 0), max[1]),
    new Plane(new Vector3(0, 0, 1), -min[2]),
    new Plane(new Vector3(0, 0, -1), max[2]),
  );

const warehouse = (count: number): AdmittedAssemblyGlbMetadata => ({
  bounds: { min: [0, 0, 0], max: [9991, Math.ceil(count / 1000) * 10, 1] },
  occurrences: [
    { id: 'warehouse', ancestry: ['warehouse'], worldTransform: frame() },
    ...Array.from({ length: count }, (_value, index) => {
      const x = (index % 1000) * 10;
      const y = Math.floor(index / 1000) * 10;
      return {
        id: `copy-${index}`,
        ancestry: ['warehouse', `copy-${index}`],
        parentId: 'warehouse',
        definition: { part: `part-${index % 1000}`, variant: 'default' },
        worldTransform: frame(x, y),
        bounds: { min: [x, y, 0] as const, max: [x + 1, y + 1, 1] as const },
      };
    }),
  ],
  components: [],
  materials: [],
});

describe('candidate assembly demand index', () => {
  it('queries a local region of 100,000 placed occurrences without scanning all occurrence bounds', () => {
    const index = buildAssemblyDemandIndex(warehouse(100_000));
    const result = queryAssemblyDemandIndex({ index, frustum: boxFrustum([5000, 500, -1], [5021, 521, 2]) });
    const expected = new Set(
      Array.from({ length: 3 }, (_value, row) =>
        Array.from({ length: 3 }, (_column, column) =>
          JSON.stringify(['warehouse', `copy-${(row + 50) * 1000 + column + 500}`]),
        ),
      ).flat(),
    );
    expect(result.occurrenceKeys).toEqual(expected);
    expect(result.visitedNodes).toBeLessThan(1000);
    expect(result.testedLeaves).toBeLessThan(30);
    expect(index.byteLength).toBeGreaterThan(100_000 * 6 * Float64Array.BYTES_PER_ELEMENT);
    expect(index.byteLength).toBeLessThan(20 * 1024 * 1024);
    const ancestors = collectAssemblyResidentAncestorIndices(index, result.occurrenceKeys);
    expect(ancestors).toHaveLength(10);
    expect(ancestors[0]).toBe(0);
    expect(
      new Set(ancestors.slice(1).map((occurrence) => JSON.stringify(index.metadata.occurrences[occurrence]!.ancestry))),
    ).toEqual(expected);
  });

  it('matches the existing Three.js bounds oracle for changing camera regions', () => {
    const metadata = warehouse(2000);
    const index = buildAssemblyDemandIndex(metadata);
    for (const x of [0, 50, 955, 4000, 9990, 11_000]) {
      const frustum = boxFrustum([x, -1, -1], [x + 45, 15, 2]);
      const expected = new Set(
        metadata.occurrences
          .filter(
            (occurrence) =>
              occurrence.definition &&
              occurrence.bounds &&
              frustum.intersectsBox(
                new Box3(new Vector3(...occurrence.bounds.min), new Vector3(...occurrence.bounds.max)),
              ),
          )
          .map((occurrence) => JSON.stringify(occurrence.ancestry)),
      );
      expect(queryAssemblyDemandIndex({ index, frustum }).occurrenceKeys).toEqual(expected);
    }
  });

  it('retains sub-metre placed bounds at large authored coordinates instead of packing them into float32', () => {
    const origin = 1e12;
    const metadata: AdmittedAssemblyGlbMetadata = {
      ...warehouse(0),
      bounds: { min: [origin, 0, 0], max: [origin + 2, 1, 1] },
      occurrences: [0, 1].map((index) => ({
        id: `near-${index}`,
        ancestry: [`near-${index}`],
        definition: { part: 'part', variant: 'default' },
        worldTransform: frame(origin + index),
        bounds: { min: [origin + index + 0.125, 0, 0] as const, max: [origin + index + 0.25, 1, 1] as const },
      })),
    };
    const index = buildAssemblyDemandIndex(metadata);
    expect(Math.fround(origin + 0.125)).not.toBe(origin + 0.125);
    const result = queryAssemblyDemandIndex({
      index,
      frustum: boxFrustum([origin + 0.18, 0, 0], [origin + 0.2, 1, 1]),
    });
    expect(result.occurrenceKeys).toEqual(new Set(['["near-0"]']));
  });

  it('keeps canonical demand unchanged through the existing axis conversion and rebased render frames', () => {
    const index = buildAssemblyDemandIndex(warehouse(2000));
    const sourceBounds = new Box3(new Vector3(4000, -1, -1), new Vector3(4021, 15, 2));
    const expected = queryAssemblyDemandIndex({
      index,
      frustum: boxFrustum([4000, -1, -1], [4021, 15, 2]),
    }).occurrenceKeys;
    const frames: readonly RenderFrame[] = [
      { anchorFrameId: 'main', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
      { anchorFrameId: 'main', originMeters: [4000, -0.5, 5], metersPerRenderUnit: 0.01 },
      { anchorFrameId: 'main', originMeters: [4001, 1, 0], metersPerRenderUnit: 100 },
    ];
    for (const renderFrame of frames) {
      const placement = createThreeRenderMatrix(renderFrame).multiply(createCanonicalGltfToTauMatrix());
      const renderBounds = sourceBounds.clone().applyMatrix4(placement);
      const renderFrustum = boxFrustum(
        [renderBounds.min.x, renderBounds.min.y, renderBounds.min.z],
        [renderBounds.max.x, renderBounds.max.y, renderBounds.max.z],
      );
      const inversePlacement = placement.clone().invert();
      const canonicalFrustum = renderFrustum.clone();
      for (const plane of canonicalFrustum.planes) {
        plane.applyMatrix4(inversePlacement);
      }
      expect(queryAssemblyDemandIndex({ index, frustum: canonicalFrustum }).occurrenceKeys).toEqual(expected);
    }
  });

  it('moves a previously offscreen occurrence into demand and removes its stale source bounds', () => {
    const index = buildAssemblyDemandIndex(warehouse(1000));
    const movedKey = '["warehouse","copy-900"]';
    const removedKey = '["warehouse","copy-0"]';
    const result = queryAssemblyDemandIndex({
      index,
      frustum: boxFrustum([-1, -1, -1], [2, 2, 2]),
      posedBounds: new Map<string, AdmittedAssemblyGlbMetadata['bounds']>([
        [movedKey, { min: [0, 0, 0], max: [1, 1, 1] }],
        [removedKey, { min: [9000, 0, 0], max: [9001, 1, 1] }],
      ]),
    });
    expect(result.occurrenceKeys).toEqual(new Set([movedKey]));
    expect(result.visitedNodes).toBeLessThan(100);
  });

  it('preserves offscreen selected demand and complete selection without a visibility limit', () => {
    const index = buildAssemblyDemandIndex(warehouse(1000));
    const frustum = boxFrustum([-100, -100, -100], [-99, -99, -99]);
    const selected = index.keys[900]!;
    expect(
      queryAssemblyDemandIndex({ index, frustum, forcedKeys: new Set([selected, 'unknown']) }).occurrenceKeys,
    ).toEqual(new Set([selected]));
    expect(queryAssemblyDemandIndex({ index, frustum, forcedKeys: new Set(index.keys) }).occurrenceKeys.size).toBe(
      1000,
    );
  });

  it('retains only actual nested parents and drops unrelated wrappers when demand changes', () => {
    const metadata: AdmittedAssemblyGlbMetadata = {
      ...warehouse(0),
      occurrences: [
        { id: 'root', ancestry: ['root'], worldTransform: frame() },
        { id: 'group', ancestry: ['root', 'group'], parentId: 'root', worldTransform: frame() },
        ...['left', 'right'].map((id) => ({
          id,
          ancestry: ['root', 'group', id],
          parentId: 'group',
          worldTransform: frame(),
          definition: { part: id, variant: 'default' },
          bounds: { min: [0, 0, 0] as const, max: [1, 1, 1] as const },
        })),
        { id: 'empty', ancestry: ['root', 'empty'], parentId: 'root', worldTransform: frame() },
      ],
    };
    const index = buildAssemblyDemandIndex(metadata);
    const left = '["root","group","left"]';
    const right = '["root","group","right"]';
    expect(collectAssemblyResidentAncestorIndices(index, new Set([left]))).toEqual([0, 1, 2]);
    expect(collectAssemblyResidentAncestorIndices(index, new Set([right]))).toEqual([0, 1, 3]);
    expect(collectAssemblyResidentAncestorIndices(index, new Set([right, left, 'unknown']))).toEqual([0, 1, 3, 2]);
    expect(collectAssemblyResidentAncestorIndices(index, new Set())).toEqual([]);
  });

  it('allocates no bounds for empty groups and preserves the admitted full bounds descriptor', () => {
    const metadata = warehouse(0);
    const fullBounds = metadata.bounds;
    const index = buildAssemblyDemandIndex(metadata);
    const result = queryAssemblyDemandIndex({
      index,
      frustum: boxFrustum([-1, -1, -1], [1, 1, 1]),
      forcedKeys: new Set(['["warehouse"]']),
    });
    expect(index.byteLength).toBe(0);
    expect(result.occurrenceKeys.size).toBe(0);
    expect(result.visitedNodes).toBe(0);
    expect(index.metadata.bounds).toBe(fullBounds);
  });
});
