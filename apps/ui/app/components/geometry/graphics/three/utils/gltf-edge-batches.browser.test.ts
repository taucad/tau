import { describe, it, expect, vi, afterAll } from 'vitest';
import {
  Matrix4,
  BoxGeometry,
  MeshStandardMaterial,
  Mesh,
  Group,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  Scene,
  OrthographicCamera,
  Vector2,
  Color,
  WebGLRenderer,
  WebGLRenderTarget,
  RenderTarget,
  InstancedMesh,
  InstancedBufferGeometry,
  InterleavedBufferAttribute,
  BufferAttribute,
} from 'three';
import type { Object3D, Material } from 'three';
import { LineMaterial } from 'three/addons';
import { WebGPUBackend } from 'three/webgpu';
import type { RendererInstance } from '#components/geometry/graphics/three/renderer.js';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';
import type { GltfFatLineMaterial } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';
import {
  createGltfFatLineMaterial,
  createGltfFatLineSegmentsFromPositions,
  applyFatLineSegments,
  setGltfFatLineEmphasis,
  updateGltfEdgeColor,
  collectGltfFatLineMaterials,
  updateLineMaterialResolution,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { createEdgeBatch, writeEdgePlacement } from '#components/geometry/graphics/three/utils/gltf-edge-batches.js';
import {
  createSectionClip,
  installSectionClip,
  writeSectionClip,
} from '#components/geometry/graphics/three/materials/section-clip.js';

import {
  createGltfSurfaceBatches,
  getGltfOccurrenceLayers,
  qualifyGltfSurfaceMaterial,
  sealGltfSurfaceMaterial,
} from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';

/** Narrow native test surface missing from the installed Three backend declarations. */
type NativeGpuDevice = {
  createBuffer: (
    descriptor: Readonly<{ label?: string; size: number; usage: number; mappedAtCreation?: boolean }>,
  ) => GPUBuffer;
  createShaderModule: (descriptor: Readonly<{ code: string }>) => {
    getCompilationInfo: () => Promise<{ messages: ReadonlyArray<{ type: 'error' | 'warning' | 'info' }> }>;
  };
  pushErrorScope: (filter: 'validation') => void;
  popErrorScope: () => Promise<unknown>;
  addEventListener: (type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void) => void;
  removeEventListener: (type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void) => void;
};

function nativeDevice(renderer: RendererInstance): NativeGpuDevice {
  if (
    renderer instanceof WebGLRenderer ||
    !(renderer.backend instanceof WebGPUBackend) ||
    !('device' in renderer.backend)
  ) {
    throw new TypeError('Expected the native WebGPU backend');
  }
  const { device } = renderer.backend;
  if (
    typeof device !== 'object' ||
    device === null ||
    !('createBuffer' in device) ||
    typeof device.createBuffer !== 'function'
  ) {
    throw new TypeError('Expected a native WebGPU device');
  }
  return device as NativeGpuDevice;
}

function fatLineMaterial(material: Material | Material[]): GltfFatLineMaterial {
  if (material instanceof LineMaterial || material instanceof Line2NodeMaterial) {
    return material;
  }
  throw new TypeError('Expected a fat-line material');
}

function fatLine(object: Object3D | undefined): Mesh<BufferGeometry, GltfFatLineMaterial> {
  if (!(object instanceof Mesh)) {
    throw new TypeError('Expected a fat-line mesh');
  }
  fatLineMaterial((object as Mesh).material);
  return object as Mesh<BufferGeometry, GltfFatLineMaterial>;
}

function edgeBatch(object: Object3D | undefined): ReturnType<typeof createEdgeBatch> {
  const mesh = fatLine(object);
  if (!(mesh.geometry instanceof InstancedBufferGeometry)) {
    throw new TypeError('Expected occurrence edge geometry');
  }
  return mesh as ReturnType<typeof createEdgeBatch>;
}

const renderers: Array<{ dispose(): void }> = [];
afterAll(() => {
  for (const r of renderers) {
    r.dispose();
  }
});

describe.each(['webgl', 'webgpu'] as const)('edge prototype occurrence %s', (backend) => {
  it('should replace the initial lines-off owner once and reuse off/on cohorts', async () => {
    const renderer = await createRenderer('viewport', backend, document.createElement('canvas'));
    renderers.push(renderer);
    const root = new Group();
    const scene = new Scene();
    scene.add(root);
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.z = 20;
    const surfaceGeometry = new BoxGeometry();
    const surfaceMaterial = new MeshStandardMaterial();
    qualifyGltfSurfaceMaterial(surfaceMaterial);
    sealGltfSurfaceMaterial(surfaceMaterial);
    const surfaces = [new Mesh(surfaceGeometry, surfaceMaterial), new Mesh(surfaceGeometry, surfaceMaterial)];
    for (const [i, s] of surfaces.entries()) {
      s.position.x = i * 2;
      root.add(s);
    }
    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3));
    const edgeMaterial = new LineBasicMaterial();
    const lines = surfaces.map((surface) => {
      const line = new LineSegments(edgeGeometry, edgeMaterial);
      line.visible = false;
      surface.add(line);
      return line;
    });
    const resolution = new Vector2(128, 128);
    let owner = createGltfSurfaceBatches(root, surfaces);
    const allocations = backend === 'webgpu' ? vi.spyOn(nativeDevice(renderer), 'createBuffer') : undefined;
    const destroys = backend === 'webgpu' ? vi.spyOn(GPUBuffer.prototype, 'destroy') : undefined;

    try {
      owner.sync();
      const surfaceBatch = owner.group.children[0];
      if (!(surfaceBatch instanceof InstancedMesh)) {
        throw new TypeError('Expected surface instance batch');
      }
      surfaceBatch.instanceMatrix.name = 'late-toggle-matrix';
      renderer.render(scene, camera);
      const old = owner;
      const oldGeometryDispose = vi.spyOn(surfaceBatch, 'dispose');
      for (const line of lines) {
        line.visible = true;
      }
      applyFatLineSegments({ scene: root }, { backend, resolution, preserveSourceNodes: true });
      const fatLines: Array<Mesh<BufferGeometry, GltfFatLineMaterial>> = [];
      root.traverse((node) => {
        if (node.type === 'LineSegments2') {
          fatLines.push(fatLine(node));
        }
      });
      old.dispose();
      old.dispose();
      expect(oldGeometryDispose).toHaveBeenCalledTimes(1);
      expect(surfaces.every((s) => s.layers.mask === 1)).toBe(true);
      if (allocations) {
        expect(destroys!.mock.contexts.length).toBe(2);
        expect(new Set(destroys!.mock.contexts).size).toBe(2);
        for (const buffer of destroys!.mock.contexts) {
          expect(
            allocations.mock.results.flatMap((result) => (result.type === 'return' ? [result.value] : [])),
          ).toContain(buffer);
        }
      }
      owner = createGltfSurfaceBatches(root, surfaces, {
        sources: fatLines,
        backend,
        resolution,
        prepareMaterial() {
          return undefined;
        },
      });
      owner.sync();
      renderer.render(scene, camera);
      const edgeGroup = owner.group.children[0];
      if (!edgeGroup) {
        throw new TypeError('Expected edge presentation group');
      }
      const initialEdgeBatch = edgeBatch(edgeGroup.children[0]);
      for (const line of lines) {
        line.visible = false;
      }
      owner.sync();
      expect(initialEdgeBatch.visible).toBe(false);
      for (const line of lines) {
        line.visible = true;
      }
      owner.sync();
      renderer.render(scene, camera);
      expect(edgeGroup.children[0]).toBe(initialEdgeBatch);
      expect(initialEdgeBatch.visible).toBe(true);
      owner.dispose();
      owner.dispose();
      expect(surfaces.every((s) => s.layers.mask === 1)).toBe(true);
      expect(fatLines.every((s) => s.layers.mask === 1)).toBe(true);
      fatLines[0]!.geometry.dispose();
      for (const m of new Set(fatLines.flatMap((line) => collectGltfFatLineMaterials(line)))) {
        m.dispose();
      }
    } finally {
      owner.dispose();
      allocations?.mockRestore();
      destroys?.mockRestore();
      surfaceGeometry.dispose();
      surfaceMaterial.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
    }
  });

  it('should retain canonical identity and finite line cohorts across appearance and pose events', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const renderer = await createRenderer('viewport', backend, canvas);
    renderers.push(renderer);
    if (backend === 'webgpu') {
      expect(nativeDevice(renderer).createBuffer).toBeTypeOf('function');
    }
    const scene = new Scene();
    scene.background = new Color(0xff_ff_ff);
    const root = new Group();
    scene.add(root);
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.z = 20;
    camera.updateMatrixWorld();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0], 3));
    geometry.setIndex([0, 1]);
    const originalMaterial = new LineBasicMaterial();
    for (let i = 0; i < 100; i++) {
      const source = new LineSegments(geometry, originalMaterial);
      source.name = `occurrence-${i}`;
      source.position.set(((i % 10) - 4.5) * 0.9, (Math.floor(i / 10) - 4.5) * 0.9, 0);
      root.add(source);
    }
    applyFatLineSegments(
      { scene: root },
      {
        backend,
        resolution: new Vector2(128, 128),
        preserveSourceNodes: true,
      },
    );
    const sources: Array<Mesh<BufferGeometry, GltfFatLineMaterial>> = [];
    root.traverse((o) => {
      if (o.type === 'LineSegments2') {
        sources.push(fatLine(o));
      }
    });
    expect(new Set(sources.map((s) => s.geometry)).size).toBe(1);
    const layers = new Map(sources.map((s) => [s, s.layers.mask]));
    const clip = createSectionClip(backend);
    const owner = createGltfSurfaceBatches(root, [], {
      sources,
      backend,
      resolution: new Vector2(128, 128),
      prepareMaterial(m) {
        installSectionClip(m, clip);
      },
    });
    const edgeGroup = owner.group.children[0]!;
    const errors = vi.spyOn(console, 'error');
    let lifetime = () => ({ allocated: 0, destroyed: 0 });
    let restoreLifetime: () => void = () => undefined;
    if (!(renderer instanceof WebGLRenderer)) {
      const buffers = vi.spyOn(nativeDevice(renderer), 'createBuffer');
      const destroys = vi.spyOn(GPUBuffer.prototype, 'destroy');
      lifetime = () => {
        const owned = buffers.mock.calls.flatMap(([descriptor], index) => {
          const result = buffers.mock.results[index];
          return descriptor.label?.startsWith('tau-edge-') && result?.type === 'return' ? [result.value] : [];
        });
        return {
          allocated: owned.length,
          destroyed: destroys.mock.contexts.filter((buffer) => buffer instanceof GPUBuffer && owned.includes(buffer))
            .length,
        };
      };
      restoreLifetime = () => {
        buffers.mockRestore();
        destroys.mockRestore();
      };
    }

    try {
      owner.sync();
      expect(sources.every((s) => getGltfOccurrenceLayers(s).mask === layers.get(s))).toBe(true);
      expect(edgeGroup.children.length).toBe(1);
      renderer.render(scene, camera);
      const first = edgeBatch(edgeGroup.children[0]);
      owner.sync();
      expect(edgeGroup.children[0]).toBe(first);
      sources[0]!.parent!.visible = false;
      owner.sync();
      expect(first.geometry.instanceCount).toBe(99);
      sources[0]!.parent!.visible = true;
      setGltfFatLineEmphasis(sources[0]!, 'hover');
      setGltfFatLineEmphasis(sources[1]!, 'hover');
      owner.sync();
      expect(edgeGroup.children.length).toBe(2);
      const hoverBatch = edgeBatch(edgeGroup.children[1]);
      expect(hoverBatch.material.depthWrite).toBe(sources[0]!.material.depthWrite);
      setGltfFatLineEmphasis(sources[2]!, 'selected');
      setGltfFatLineEmphasis(sources[3]!, 'selected');
      owner.sync();
      expect(edgeGroup.children.length).toBe(3);
      updateGltfEdgeColor(root, 0xee_ee_ee);
      owner.sync();
      sources[4]!.parent!.position.z = 0.2;
      owner.syncMatrices([sources[4]!.parent!]);
      renderer.render(scene, camera);
      for (const source of sources) {
        setGltfFatLineEmphasis(source, 'none');
      }
      owner.sync();
      expect(edgeGroup.children.length).toBe(3);
      expect(sources.map((s) => s.name)).toEqual(Array.from({ length: 100 }, (_, i) => `occurrence-${i}`));
      const base = sources[0]!.material;
      base.transparent = true;
      base.opacity = 0.5;
      owner.sync();
      expect(first.visible).toBe(false);
      expect(sources.every((s) => s.layers.mask === layers.get(s))).toBe(true);
      base.transparent = false;
      base.opacity = 1;
      owner.sync();
      updateLineMaterialResolution(root, new Vector2(256, 128));
      if (backend === 'webgl') {
        expect(
          fatLineMaterial(first.material) instanceof LineMaterial && (first.material as LineMaterial).resolution.x,
        ).toBe(256);
      }
      expect(first.geometry.getAttribute('instanceStart').array[0]).toBeCloseTo(-0.2);
      const endpoints = sources[0]!.geometry.getAttribute('instanceStart');
      if (!(endpoints instanceof InterleavedBufferAttribute)) {
        throw new TypeError('Expected interleaved canonical endpoints');
      }
      endpoints.data.array[0] = -0.4;
      endpoints.data.needsUpdate = true;
      owner.sync();
      const replacement = edgeGroup.children.at(-1) as Mesh;
      expect(replacement).not.toBe(first);
      expect(replacement.geometry.getAttribute('instanceStart').array[0]).toBeCloseTo(-0.4);
      renderer.render(scene, camera);
      owner.dispose();
      if (backend === 'webgpu') {
        expect(lifetime()).toEqual({ allocated: 36, destroyed: 36 });
      }
      owner.dispose();
      expect(sources.every((s) => s.layers.mask === layers.get(s))).toBe(true);
      expect(owner.group.parent).toBeNull();
      expect(errors.mock.calls).toEqual([]);
    } finally {
      owner.dispose();
      sources[0]!.geometry.dispose();
      const materials = new Set(sources.flatMap((s) => collectGltfFatLineMaterials(s)));
      for (const m of materials) {
        m.dispose();
      }
      geometry.dispose();
      originalMaterial.dispose();
      restoreLifetime();
      errors.mockRestore();
    }
  });

  it('should preserve pixels and release actual occurrence buffers through material changes', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const renderer = await createRenderer('viewport', backend, canvas);
    renderers.push(renderer);
    const validation: unknown[] = [];
    const errors = vi.spyOn(console, 'error').mockImplementation((...args) => validation.push(args));
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.z = 20;
    camera.updateMatrixWorld();
    const scene = new Scene();
    scene.background = new Color(0xff_ff_ff);
    const webGlTarget = renderer instanceof WebGLRenderer ? new WebGLRenderTarget(128, 128) : undefined;
    const target = webGlTarget ?? new RenderTarget(128, 128);
    const positions = new Float32Array([-0.3, -0.3, 0, 0.3, 0.3, 0, -0.3, 0.3, 0, 0.3, -0.3, 0]);
    const resolution = new Vector2(128, 128);
    const material = createGltfFatLineMaterial({
      backend,
      resolution,
      edgeColor: 0,
    });
    const canonical = Array.from({ length: 100 }, (_, i) => {
      const mesh = createGltfFatLineSegmentsFromPositions({
        backend,
        positions,
        material,
      })!;
      mesh.position.set(((i % 10) - 4.5) * 0.9, (Math.floor(i / 10) - 4.5) * 0.9, 0);
      scene.add(mesh);
      return mesh;
    });
    const batch = createEdgeBatch(positions, 100, {
      backend,
      resolution,
      color: 0,
    });
    const clip = createSectionClip(backend);
    installSectionClip(batch.material, clip);
    installSectionClip(material, clip);
    const { geometry } = batch;
    for (let i = 0; i < 100; i++) {
      writeEdgePlacement(
        geometry,
        i,
        new Matrix4().makeTranslation(canonical[i]!.position.x, canonical[i]!.position.y, 0),
      );
    }
    geometry.instanceCount = 100;
    const render = async () => {
      if (renderer instanceof WebGLRenderer) {
        if (!webGlTarget) {
          throw new TypeError('Expected WebGL render target');
        }
        renderer.setRenderTarget(webGlTarget);
      } else {
        renderer.setRenderTarget(target);
      }
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      if (renderer instanceof WebGLRenderer) {
        const p = new Uint8Array(128 * 128 * 4);
        if (!webGlTarget) {
          throw new TypeError('Expected WebGL render target');
        }
        renderer.readRenderTargetPixels(webGlTarget, 0, 0, 128, 128, p);
        return p;
      }
      return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 128, 128));
    };
    let allocated = (): GPUBuffer[] => [];
    let destroyed = (): GPUBuffer[] => [];
    const restores: Array<() => void> = [];
    let draws = () => 0;
    try {
      if (renderer instanceof WebGLRenderer) {
        const gl = renderer.getContext();
        if (!(gl instanceof WebGL2RenderingContext)) {
          throw new TypeError('Expected WebGL2 context');
        }
        const draw = vi.spyOn(gl, 'drawElementsInstanced');
        draws = () => draw.mock.calls.length;
        restores.push(() => {
          draw.mockRestore();
        });
        const invalid = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(invalid, 'bad shader');
        gl.compileShader(invalid);
        expect(gl.getShaderParameter(invalid, gl.COMPILE_STATUS)).toBe(false);
        gl.deleteShader(invalid);
      } else {
        expect(nativeDevice(renderer).createBuffer).toBeTypeOf('function');
        const device = nativeDevice(renderer);
        const gpuErrors = (event: GPUUncapturedErrorEvent) => {
          validation.push(event.error.message);
        };
        device.addEventListener('uncapturederror', gpuErrors);
        restores.push(() => {
          device.removeEventListener('uncapturederror', gpuErrors);
        });
        const draw = vi.spyOn(GPURenderPassEncoder.prototype, 'drawIndexed');
        draws = () => draw.mock.calls.length;
        restores.push(() => {
          draw.mockRestore();
        });
        device.pushErrorScope('validation');
        const invalid = device.createShaderModule({ code: 'bad shader' });
        const invalidCompilation = await invalid.getCompilationInfo();
        expect(invalidCompilation.messages.some((message) => message.type === 'error')).toBe(true);
        expect(await device.popErrorScope()).not.toBeNull();
        const allocations = vi.spyOn(device, 'createBuffer');
        const deletions = vi.spyOn(GPUBuffer.prototype, 'destroy');
        restores.push(() => {
          allocations.mockRestore();
          deletions.mockRestore();
        });
        allocated = () =>
          allocations.mock.calls.flatMap(([descriptor], index) => {
            const result = allocations.mock.results[index];
            return /^tau-edge-[0-3]$/.test(descriptor.label ?? '') && result?.type === 'return' ? [result.value] : [];
          });
        destroyed = () => deletions.mock.contexts.filter((buffer): buffer is GPUBuffer => buffer instanceof GPUBuffer);
        for (let c = 0; c < 4; c++) {
          geometry.getAttribute(`tauOccurrence${c}`).name = `tau-edge-${c}`;
        }
      }
      let prior = draws();
      const before = await render();
      expect(draws() - prior).toBe(100);
      for (const mesh of canonical) {
        scene.remove(mesh);
      }
      scene.add(batch);
      prior = draws();
      const after = await render();
      expect(draws() - prior).toBe(1);
      expect([...after]).toEqual([...before]);
      if (!(renderer instanceof WebGLRenderer)) {
        const shader = await renderer.debug.getShaderAsync(scene, camera, batch);
        if (shader.vertexShader === null) {
          throw new TypeError('Expected generated vertex shader');
        }
        expect(shader.vertexShader).toContain('tauOccurrence0');
        const result = await nativeDevice(renderer)
          .createShaderModule({ code: shader.vertexShader })
          .getCompilationInfo();
        expect(result.messages.filter((m) => m.type === 'error')).toEqual([]);
      }

      const parity = async () => {
        batch.visible = true;
        for (const m of canonical) {
          scene.remove(m);
        }
        const a = await render();
        batch.visible = false;
        for (const m of canonical) {
          scene.add(m);
        }
        const b = await render();
        expect(a).toEqual(b);
        for (const m of canonical) {
          scene.remove(m);
        }
        batch.visible = true;
      };
      writeSectionClip(
        clip,
        [
          {
            cutId: 'half',
            faces: [],
            halfSpaces: [{ normal: [1, 0, 0], constant: 0 }],
          },
        ],
        0,
      );
      await parity();
      writeSectionClip(clip, [], 0);
      canonical[0]!.position.set(0, 0, 0.25);
      writeEdgePlacement(geometry, 0, new Matrix4().makeTranslation(0, 0, 0.25));
      await parity();
      canonical[99]!.visible = false;
      geometry.instanceCount = 99;
      await parity();
      canonical[99]!.visible = true;
      geometry.instanceCount = 100;
      material.color.setHex(0xff_cc_00);
      batch.material.color.setHex(0xff_cc_00);
      await parity();
      const endpointAttribute = geometry.getAttribute('instanceStart');
      if (!(endpointAttribute instanceof BufferAttribute)) {
        throw new TypeError('Expected expanded endpoint attribute');
      }
      const endpoint = endpointAttribute.array;
      const { version } = endpointAttribute;
      writeEdgePlacement(geometry, 0, new Matrix4().makeTranslation(0, 0, 0.25));
      expect(geometry.getAttribute('instanceStart').array).toBe(endpoint);
      expect(endpointAttribute.version).toBe(version);

      for (const count of [1, 2, 100, 1000]) {
        const b = createEdgeBatch(positions, count, {
          backend,
          resolution,
          color: 0,
        });
        expect(b.geometry.getAttribute('instanceStart').count).toBe(16);
        expect(b.geometry.getAttribute('tauOccurrence0').array.byteLength * 4).toBe(count * 64);
        b.geometry.dispose();
        b.material.dispose();
      }
      batch.material.color.setHex(0xff_cc_00);
      await render();
      batch.material.transparent = true;
      batch.material.opacity = 0.6;
      batch.material.needsUpdate = true;
      await render();
      batch.material.transparent = false;
      batch.material.opacity = 1;
      batch.material.needsUpdate = true;
      await render();
      geometry.dispose();
      batch.material.dispose();
      if (!(renderer instanceof WebGLRenderer)) {
        const owned = allocated();
        expect(owned.length).toBe(4);
        expect(owned.every((b) => destroyed().includes(b))).toBe(true);
      }
      expect(validation).toEqual([]);
    } finally {
      for (const mesh of canonical) {
        mesh.geometry.dispose();
      }
      material.dispose();
      geometry.dispose();
      batch.material.dispose();
      target.dispose();
      for (const f of restores) {
        f();
      }
      errors.mockRestore();
    }
  });
});
