// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Vector2 } from 'three';
import type { Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Line2NodeMaterial as ThreeLine2NodeMaterial } from 'three/webgpu';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';
import {
  applyFatLineSegments,
  createWebGpuGltfFatLineMaterial,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

/**
 * Build a minimal GLTF-like object with `lineSegmentsCount` `LineSegments` children attached
 * to the scene group. Each child has a tiny non-indexed `BufferGeometry` (one edge) so the
 * fat-line wrapper's position-extraction path runs end-to-end. Used by the allocation-count
 * regression guards.
 */
function makeGltfWithLineSegments(lineSegmentsCount: number): GLTF {
  const scene = new Group();
  for (let i = 0; i < lineSegmentsCount; i++) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    const lineSegments = new LineSegments(geometry, new LineBasicMaterial());
    scene.add(lineSegments);
  }
  return { scene } as unknown as GLTF;
}

/**
 * After {@link applyFatLineSegments} has run, traverse the scene for any `LineSegments2`
 * meshes (their `.type` is set by three's addon) and return their materials in traversal
 * order. The collector intentionally widens to `unknown[]` so we can deduplicate by
 * identity without leaning on the upstream class shape.
 */
function collectFatLineMaterials(scene: Object3D): unknown[] {
  const materials: unknown[] = [];
  scene.traverse((object) => {
    if ('type' in object && object.type === 'LineSegments2') {
      const mesh = object as unknown as { material: unknown };
      materials.push(mesh.material);
    }
  });
  return materials;
}

describe('createWebGpuGltfFatLineMaterial TSL snapshots', () => {
  /**
   * Smoking-gun regression: the WebGPU fat-line material must apply a coplanar bias so edge
   * lines win the depth comparison against the surface they overlay. The bias used to live
   * as a hardcoded `material.depthNode = viewZToReversedPerspectiveDepth(...)` in the
   * factory, but that locked the encoder to the reversed-Z viewport and broke the log-depth
   * screenshot/offscreen renderers (occluded edges leaked through opaque surfaces). The
   * factory now sets `material.depthBias` and the renderer-aware encoder dispatch lives
   * inside `Line2NodeMaterial.setupDepth(builder)` per-frame. See
   * `docs/research/webgpu-fat-line-renderer-aware-depth.md`.
   */
  it('forwards a non-identity depthBias to Line2NodeMaterial.setupDepth (regression guard)', () => {
    const material = createWebGpuGltfFatLineMaterial();
    expect(material.depthBias).toBeGreaterThan(0);
    expect(material.depthBias).toBeLessThan(1);
  });

  /**
   * The fat-line edge material must use the in-tree `Line2NodeMaterial` (which fixes the
   * upstream `nearEstimate = b * -0.5 / a` reversed-Z trim flip — collapses to `-far/2`,
   * making any edge that crosses the camera near plane snap to the opposite hemisphere).
   * The toJSON snapshot can't catch a regression here because both classes serialise
   * `type: 'Line2NodeMaterial'` and TSL graphs aren't built until `setup()`.
   */
  it('uses the in-tree Line2NodeMaterial (reversed-Z trim fix)', () => {
    const material = createWebGpuGltfFatLineMaterial();
    expect(material).toBeInstanceOf(Line2NodeMaterial);
    expect(material.constructor).not.toBe(ThreeLine2NodeMaterial);
  });

  /**
   * Smoking-gun regression guard for the screenshot crispness gap. Upstream
   * `Line2NodeMaterial` defaults `_useAlphaToCoverage = true`, which routes endcap
   * fragments through the smoothstep + hardware alpha-to-coverage path; the
   * alpha→sample-mask conversion is vendor-defined (gpuweb/gpuweb#4867 documents
   * Qualcomm's 4×4 area-dither LUT) and produces visibly grainy edges on dithered
   * drivers vs the deterministic 5-level MSAA `discard` path WebGL takes by default.
   * The Tau factory must opt out so WebGPU joins WebGL on the discard path. See
   * `docs/research/webgpu-edge-line-crispness-gap.md`.
   */
  it('opts out of alphaToCoverage to match WebGL crispness (regression guard)', () => {
    const material = createWebGpuGltfFatLineMaterial();
    expect(material.alphaToCoverage).toBe(false);
  });

  it('matches stable stripped WebGPU fat-line material JSON snapshot', async () => {
    const material = createWebGpuGltfFatLineMaterial();
    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'gltf-fat-line-webgpu-node-material.json'),
    );
  });
});

describe('applyFatLineSegments WebGPU material allocation (R1 perf guard)', () => {
  /**
   * Smoking-gun regression guard for the per-primitive material allocation the structural
   * audit flagged as `F1 (P0)` in `docs/research/gltf-edges-fat-line-performance.md`. Before
   * the fix, `applyFatLineSegments` allocated one fresh `Line2NodeMaterial` per source
   * `LineSegments`, which under cold pipeline cache produced one `createRenderPipelineAsync`
   * per part of a CAD assembly. The fix shares a single material instance across every
   * wrapped mesh in the call.
   */
  it('allocates exactly one Line2NodeMaterial for a single LineSegments source', () => {
    const gltf = makeGltfWithLineSegments(1);
    applyFatLineSegments(gltf, new Vector2(1024, 768), 'webgpu');

    const materials = collectFatLineMaterials(gltf.scene);
    expect(materials).toHaveLength(1);
    expect(materials[0]).toBeInstanceOf(Line2NodeMaterial);
  });

  it('shares a single Line2NodeMaterial instance across many LineSegments sources', () => {
    // The middleware-side merge collapses multi-part inputs to one LineSegments under normal
    // operation, but `applyFatLineSegments` must remain tolerant of multi-source scenes (test
    // fixtures, future kernels that bypass the middleware). When that fan-out occurs, every
    // wrapped mesh must point at the same material so we still get one pipeline.
    const gltf = makeGltfWithLineSegments(5);
    applyFatLineSegments(gltf, new Vector2(1024, 768), 'webgpu');

    const materials = collectFatLineMaterials(gltf.scene);
    expect(materials).toHaveLength(5);
    const unique = new Set(materials);
    expect(unique.size).toBe(1);
  });
});
