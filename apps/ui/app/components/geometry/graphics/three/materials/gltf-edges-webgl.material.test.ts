// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Vector2 } from 'three';
import type { Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { LineMaterial } from 'three/addons';
import { createCameraView } from '@taucad/camera';
import { createThreeCameraRig } from '@taucad/three/camera';
import {
  applyFatLineSegments,
  createGltfFatLineMaterial,
  createGltfFatLineSegmentsFromPositions,
  createWebGlGltfFatLineMaterial,
  setGltfFatLineMaterialColor,
  updateGltfEdgeColor,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  gltfEdgeDepthBiasFactor,
  gltfEdgeOrthographicDepthBiasCoefficient,
  gltfEdgeDepthBiasReferenceTanHalfFov,
} from '#components/geometry/graphics/three/materials/edge-depth-bias.js';

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

type ShaderProbe = {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
};

function compileShaderProbe(material: LineMaterial): ShaderProbe {
  const shader: ShaderProbe = {
    uniforms: {},
    vertexShader: `
      #include <logdepthbuf_pars_vertex>
      void main() {
        #include <logdepthbuf_vertex>
        #include <clipping_planes_vertex>
      }
    `,
    fragmentShader: '',
  };

  (material.onBeforeCompile as (shaderProbe: ShaderProbe) => void)(shader);

  return shader;
}

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
      expect(key).toBe('tau-gltf-edge-logdepth-bias-v2');
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
      expect(uniformA!.value).toBe(gltfEdgeDepthBiasFactor);
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

    it('injects the shared FOV-adaptive perspective bias into the WebGL shader', () => {
      const material = createWebGlGltfFatLineMaterial(new Vector2(1024, 768));
      const shader = compileShaderProbe(material);
      const sharedUniform = material.userData['depthBiasUniform'] as DepthBiasUniform;
      const referenceTanHalfFovGlsl = gltfEdgeDepthBiasReferenceTanHalfFov.toPrecision(8);

      expect(shader.uniforms['depthBias']).toBe(sharedUniform);
      expect(shader.vertexShader).toContain('uniform float depthBias;');
      expect(shader.vertexShader).toContain('float tanHalfFov = 1.0 / projectionMatrix[1][1];');
      expect(shader.vertexShader).toContain(`float fovScale = tanHalfFov / ${referenceTanHalfFovGlsl};`);
      expect(shader.vertexShader).toContain('vFragDepth *= pow(depthBias, fovScale);');
      expect(shader.vertexShader).toContain('if (projectionMatrix[3][3] != 0.0)');
      expect(shader.vertexShader).toContain(
        `float orthographicBias = ${gltfEdgeOrthographicDepthBiasCoefficient.toPrecision(8)} / projectionMatrix[1][1];`,
      );
      expect(shader.vertexShader).toContain(
        'gl_Position.z += projectionMatrix[2][2] * orthographicBias * gl_Position.w;',
      );
    });

    it('keeps the orthographic edge pull larger than one depth-buffer step under the main viewer clip policy', () => {
      const rig = createThreeCameraRig({
        initialView: createCameraView({
          requestedVerticalFieldOfView: 60,
          target: [0, 0, 0],
          direction: [1, -1, 0.7],
          up: [0, 0, 1],
          verticalSpan: 600,
          viewport: { width: 1536, height: 900, pixelRatio: 2 },
          bounds: { min: [-220, -180, -55], max: [220, 180, 55] },
        }),
      });
      rig.actorRef.start();
      rig.setClipPlanes({
        near: 1e-3,
        minimumPerspectiveFar: 10_000_000_000,
        orthographicFarMultiplier: 5,
      });
      rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });

      const camera = rig.orthographicCamera;
      const depthBufferStep = (camera.far - camera.near) / (2 ** 24 - 1);
      const edgePull = gltfEdgeOrthographicDepthBiasCoefficient / camera.projectionMatrix.elements[5];

      expect(edgePull).toBeGreaterThan(depthBufferStep);
      rig.dispose();
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
      applyFatLineSegments(gltf, { resolution: new Vector2(1024, 768), backend: 'webgl' });

      const materials = collectFatLineMaterials(gltf.scene);
      expect(materials).toHaveLength(4);
      const unique = new Set(materials);
      expect(unique.size).toBe(1);
      expect(materials[0]).toBeInstanceOf(LineMaterial);
    });
  });

  describe('raw endpoint fat-line helper', () => {
    it('should create WebGL LineSegments2 from raw endpoint positions with the shared material', () => {
      const material = createGltfFatLineMaterial({
        backend: 'webgl',
        resolution: new Vector2(1024, 768),
        edgeColor: 0x11_22_33,
      });
      const fatLine = createGltfFatLineSegmentsFromPositions({
        backend: 'webgl',
        material,
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0]),
      });

      expect(fatLine).toBeDefined();
      expect(fatLine!.type).toBe('LineSegments2');
      expect(fatLine!.material).toBe(material);
      expect(material).toBeInstanceOf(LineMaterial);
    });

    it('should update the shared WebGL material color without rebuilding geometry', () => {
      const material = createGltfFatLineMaterial({
        backend: 'webgl',
        resolution: new Vector2(1024, 768),
        edgeColor: 0x11_22_33,
      });
      const fatLine = createGltfFatLineSegmentsFromPositions({
        backend: 'webgl',
        material,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
      })!;
      const { geometry } = fatLine;

      setGltfFatLineMaterialColor(material, 0xaa_bb_cc);

      expect((material as LineMaterial).color.getHex()).toBe(0xaa_bb_cc);
      expect(fatLine.geometry).toBe(geometry);
    });

    it('should return deduped WebGL materials touched by a scene edge color update', () => {
      const material = createGltfFatLineMaterial({
        backend: 'webgl',
        resolution: new Vector2(1024, 768),
        edgeColor: 0x11_22_33,
      });
      const firstFatLine = createGltfFatLineSegmentsFromPositions({
        backend: 'webgl',
        material,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
      })!;
      const secondFatLine = createGltfFatLineSegmentsFromPositions({
        backend: 'webgl',
        material,
        positions: new Float32Array([1, 0, 0, 1, 1, 0]),
      })!;
      const scene = new Group();
      scene.add(firstFatLine, secondFatLine);
      const firstGeometry = firstFatLine.geometry;
      const secondGeometry = secondFatLine.geometry;

      const updatedMaterials = updateGltfEdgeColor(scene, 0xaa_bb_cc);

      expect(updatedMaterials.size).toBe(1);
      expect(updatedMaterials.has(material)).toBe(true);
      expect((material as LineMaterial).color.getHex()).toBe(0xaa_bb_cc);
      expect(firstFatLine.geometry).toBe(firstGeometry);
      expect(secondFatLine.geometry).toBe(secondGeometry);
    });
  });
});
