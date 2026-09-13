// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Vector2 } from 'three';
import type { Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { LineMaterial } from 'three/addons';
import {
  applyFatLineSegments,
  createWebGlGltfFatLineMaterial,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';

/**
 * Build a minimal GLTF-like object with `lineSegmentsCount` `LineSegments` children attached
 * to the scene group. Mirrors the helper in `gltf-edges-webgpu.material.test.ts` — kept
 * inline here so both files stay independently runnable.
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
 * Collect every `LineSegments2` material across the scene, returned in traversal order.
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

/**
 * Shape of the depthBias uniform attached by {@link createWebGlGltfFatLineMaterial}. Defined
 * locally so we can assert reference equality across multiple factory calls without leaking
 * private module types.
 */
type DepthBiasUniform = { value: number };

describe('createWebGlGltfFatLineMaterial', () => {
  describe('R7 — WebGLPrograms cache deduplication', () => {
    /**
     * The shader source emitted by `onBeforeCompile` is identical across every consumer of
     * the factory, so a stable `customProgramCacheKey` collapses three's `WebGLPrograms`
     * cache to a single compiled GLSL program. Three.js identity-keys materials by default,
     * so without this override every material instance forces a fresh shader compile + link.
     *
     * The literal string is intentionally pinned: shipping the policy doc references it as
     * a debugging anchor, and the trailing `v1` is the manual bump-token for shader patches.
     */
    it('returns the stable tau-gltf-edge-logdepth-bias-v1 cache key', () => {
      const material = createWebGlGltfFatLineMaterial(new Vector2(1024, 768));

      const key = material.customProgramCacheKey();
      expect(key).toBe('tau-gltf-edge-logdepth-bias-v1');
    });

    /**
     * Smoking-gun regression guard: the depthBias uniform must be a single shared reference
     * across every material the factory produces. The previous shape allocated a fresh
     * `{ value: depthBiasFactor }` per call, so although the cache key collapsed the program,
     * the per-material uniform identities still defeated three's per-program uniform
     * batching for any future cross-cutting bias mutation.
     */
    it('shares a single depthBias uniform reference across every factory call', () => {
      const a = createWebGlGltfFatLineMaterial(new Vector2(1024, 768));
      const b = createWebGlGltfFatLineMaterial(new Vector2(800, 600));
      const c = createWebGlGltfFatLineMaterial(new Vector2(1, 1));

      const uniformA = a.userData['depthBiasUniform'] as DepthBiasUniform | undefined;
      const uniformB = b.userData['depthBiasUniform'] as DepthBiasUniform | undefined;
      const uniformC = c.userData['depthBiasUniform'] as DepthBiasUniform | undefined;

      expect(uniformA).toBeDefined();
      expect(uniformA).toBe(uniformB);
      expect(uniformB).toBe(uniformC);
      expect(uniformA!.value).toBeGreaterThan(0);
      expect(uniformA!.value).toBeLessThan(1);
    });

    /**
     * Mutating the shared uniform must propagate to every material that obtained it. This
     * is the cross-cutting bias mutation pathway used by debug overlays and the screenshot
     * capture clone path.
     */
    it('propagates depthBias mutations through the shared uniform', () => {
      const a = createWebGlGltfFatLineMaterial(new Vector2(1024, 768));
      const b = createWebGlGltfFatLineMaterial(new Vector2(1024, 768));
      const uniformA = a.userData['depthBiasUniform'] as DepthBiasUniform;
      const uniformB = b.userData['depthBiasUniform'] as DepthBiasUniform;

      const originalValue = uniformA.value;
      // Non-default, in-range probe value; restored to the original below.
      const probeValue = 0.875_25;
      uniformA.value = probeValue;
      try {
        expect(uniformB.value).toBe(probeValue);
      } finally {
        uniformA.value = originalValue;
      }
    });
  });

  describe('R1 — material allocation parity with WebGPU path', () => {
    /**
     * Mirrors the WebGPU allocation-count regression guard. `applyFatLineSegments` must
     * allocate exactly one `LineMaterial` per call regardless of how many source
     * `LineSegments` the scene contains. The middleware-side merge collapses production
     * scenes to a single source, but the UI must remain tolerant of multi-source fan-outs.
     */
    it('shares a single LineMaterial instance across many LineSegments sources', () => {
      const gltf = makeGltfWithLineSegments(4);
      applyFatLineSegments(gltf, new Vector2(1024, 768), 'webgl');

      const materials = collectFatLineMaterials(gltf.scene);
      expect(materials).toHaveLength(4);
      const unique = new Set(materials);
      expect(unique.size).toBe(1);
      expect(materials[0]).toBeInstanceOf(LineMaterial);
    });
  });
});
