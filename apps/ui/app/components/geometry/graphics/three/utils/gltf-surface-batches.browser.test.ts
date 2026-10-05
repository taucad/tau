import { describe, expect, it, vi } from 'vitest';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Matrix4,
  OrthographicCamera,
  RenderTarget,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { WebGPUBackend } from 'three/webgpu';
import type { RendererInstance } from '#components/geometry/graphics/three/renderer.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';
import {
  createSectionClip,
  installSectionClip,
  writeSectionClip,
} from '#components/geometry/graphics/three/materials/section-clip.js';
import { applyGltfSurfaceDepthBias } from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import {
  createGltfSurfaceBatches,
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

const size = 128;

describe.each(['webgl', 'webgpu'] as const)('surface batching actual %s', (backend) => {
  it('should submit one or two surface commands with shared uploads and unchanged clipped pixels', async () => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${backend} surface batching fixture`);
    canvas.width = size;
    canvas.height = size;
    const renderer = await createRenderer('viewport', backend, canvas);
    const resources: Array<{ dispose(): void }> = [renderer];
    const validation: unknown[] = [];
    const consoleErrors = vi.spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
      validation.push(values);
    });
    const scene = new Scene();
    scene.background = new Color(0);
    scene.add(new AmbientLight(0xff_ff_ff, 1));
    const light = new DirectionalLight(0xff_ff_ff, 2);
    light.position.set(0, 0, 10);
    scene.add(light);
    const root = new Group();
    scene.add(root);
    const geometry = new BoxGeometry(1.2, 1.2, 0.4);
    geometry.getAttribute('position').name = 'batch-position';
    geometry.getAttribute('normal').name = 'batch-normal';
    geometry.index!.name = 'batch-index';
    resources.push(geometry);
    const camera = new OrthographicCamera(-11, 11, 11, -11, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.updateMatrixWorld();
    const clip = createSectionClip(backend);
    const sources = Array.from({ length: 100 }, (_, index) => {
      const material = new MeshStandardMaterial({ color: 0xcc_cc_cc, roughness: 0.5 });
      material.name = `authored-${index}`;
      qualifyGltfSurfaceMaterial(material);
      applyGltfSurfaceDepthBias(material, backend);
      installSectionClip(material, clip);
      sealGltfSurfaceMaterial(material);
      resources.push(material);
      const mesh = new Mesh(geometry, material);
      mesh.position.set(((index % 10) - 4.5) * 2, (Math.floor(index / 10) - 4.5) * 2, 0);
      mesh.scale.set(1, 0.75, 1.5);
      root.add(mesh);
      return mesh;
    });
    const webGlTarget = renderer instanceof WebGLRenderer ? new WebGLRenderTarget(size, size) : undefined;
    const target = webGlTarget ?? new RenderTarget(size, size);
    resources.push(target);
    const instanceSizes = new Set([6400, 3200]);
    const rawCounts = { indexed: 0, nonIndexed: 0, positionUploads: 0, matrixUploads: 0 };
    let restoreRaw: () => void = () => undefined;
    let instanceLifetime: () => { allocated: number; destroyed: number } = () => ({ allocated: 0, destroyed: 0 });
    try {
      if (renderer instanceof WebGLRenderer) {
        const gl = renderer.getContext();
        if (!(gl instanceof WebGL2RenderingContext)) {
          throw new TypeError('Expected WebGL2 context');
        }
        const indexed = vi.spyOn(gl, 'drawElements');
        const instanced = vi.spyOn(gl, 'drawElementsInstanced');
        const arrays = vi.spyOn(gl, 'drawArrays');
        const bufferData = vi.spyOn(gl, 'bufferData');
        const invalid = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(invalid, 'this is intentionally invalid glsl;');
        gl.compileShader(invalid);
        expect(gl.getShaderParameter(invalid, gl.COMPILE_STATUS)).toBe(false);
        gl.deleteShader(invalid);
        restoreRaw = () => {
          indexed.mockRestore();
          instanced.mockRestore();
          arrays.mockRestore();
          bufferData.mockRestore();
        };
        Object.defineProperties(rawCounts, {
          indexed: { get: () => indexed.mock.calls.length + instanced.mock.calls.length },
          nonIndexed: { get: () => arrays.mock.calls.length },
          positionUploads: {
            get: () =>
              bufferData.mock.calls.filter((call) => call[1] === geometry.getAttribute('position').array).length,
          },
        });
      } else {
        const device = nativeDevice(renderer);
        const errors = (event: GPUUncapturedErrorEvent) => {
          validation.push(event.error.message);
        };
        device.addEventListener('uncapturederror', errors);
        const indexed = vi.spyOn(GPURenderPassEncoder.prototype, 'drawIndexed');
        const arrays = vi.spyOn(GPURenderPassEncoder.prototype, 'draw');
        const buffers = vi.spyOn(device, 'createBuffer');
        const destroys = vi.spyOn(GPUBuffer.prototype, 'destroy');
        instanceLifetime = () => {
          const owned = buffers.mock.calls.flatMap(([descriptor], index) => {
            const result = buffers.mock.results[index];
            return instanceSizes.has(descriptor.size) && result?.type === 'return' ? [result.value] : [];
          });
          return {
            allocated: owned.length,
            destroyed: destroys.mock.contexts.filter((buffer) => buffer instanceof GPUBuffer && owned.includes(buffer))
              .length,
          };
        };
        const { gpu } = navigator as Navigator & {
          readonly gpu: { requestAdapter: () => Promise<unknown> };
        };
        const adapter = await gpu.requestAdapter();
        let adapterDescription: unknown = adapter;
        if (adapter) {
          if (
            typeof adapter !== 'object' ||
            !('info' in adapter) ||
            typeof adapter.info !== 'object' ||
            adapter.info === null
          ) {
            throw new TypeError('Expected native adapter information');
          }
          const info = adapter.info as Record<string, unknown>;
          adapterDescription = {
            vendor: info['vendor'],
            architecture: info['architecture'],
            device: info['device'],
            description: info['description'],
            fallback: info['isFallbackAdapter'],
          };
        }
        console.info('E06 GPU adapter', JSON.stringify(adapterDescription));
        device.pushErrorScope('validation');
        const invalid = device.createShaderModule({ code: 'this is intentionally invalid wgsl;' });
        const invalidCompilation = await invalid.getCompilationInfo();
        expect(invalidCompilation.messages.some((message) => message.type === 'error')).toBe(true);
        const validationError = await device.popErrorScope();
        if (typeof validationError !== 'object' || validationError === null || !('message' in validationError)) {
          throw new TypeError('Expected native shader validation error');
        }
        expect(validationError.message).toContain('Error while parsing WGSL');
        Object.defineProperties(rawCounts, {
          indexed: { get: () => indexed.mock.calls.length },
          nonIndexed: { get: () => arrays.mock.calls.length },
          positionUploads: {
            get: () => buffers.mock.calls.filter(([descriptor]) => descriptor.label === 'batch-position').length,
          },
          matrixUploads: {
            get: () => buffers.mock.calls.filter(([descriptor]) => descriptor.label === 'batch-matrix').length,
          },
        });
        restoreRaw = () => {
          indexed.mockRestore();
          arrays.mockRestore();
          buffers.mockRestore();
          destroys.mockRestore();
          device.removeEventListener('uncapturederror', errors);
        };
      }
      const render = async (): Promise<Uint8Array<ArrayBuffer>> => {
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
          const pixels = new Uint8Array(size * size * 4);
          if (!webGlTarget) {
            throw new TypeError('Expected WebGL render target');
          }
          renderer.readRenderTargetPixels(webGlTarget, 0, 0, size, size, pixels);
          return pixels;
        }
        return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size));
      };
      const baselineDraws = rawCounts.indexed;
      const baseline = await render();
      expect(rawCounts.indexed - baselineDraws).toBe(100);
      expect(rawCounts.positionUploads).toBe(1);
      const batches = createGltfSurfaceBatches(root, sources);
      resources.push(batches);
      batches.sync();
      for (const object of batches.group.children) {
        if (object instanceof InstancedMesh) {
          object.instanceMatrix.name = 'batch-matrix';
        }
      }
      const first = rawCounts.indexed;
      expect(await render()).toEqual(baseline);
      expect(rawCounts.indexed - first).toBe(1);
      expect(rawCounts.positionUploads).toBe(1);
      expect(
        batches.group.children.reduce(
          (bytes, object) => bytes + (object instanceof InstancedMesh ? object.instanceMatrix.array.byteLength : 0),
          0,
        ),
      ).toBe(64 * 100);
      writeSectionClip(clip, [{ cutId: 'half', faces: [], halfSpaces: [{ normal: [1, 0, 0], constant: 0 }] }], 0);
      const clipped = await render();
      batches.dispose();
      console.info('E06 instance buffer lifetime after first dispose', JSON.stringify(instanceLifetime()));
      if (backend === 'webgpu') {
        expect(instanceLifetime()).toEqual({ allocated: 1, destroyed: 1 });
      }
      const directClipped = await render();
      expect(clipped).toEqual(directClipped);
      writeSectionClip(clip, [], 0);
      for (const [index, source] of sources.entries()) {
        if (index % 2 === 0) {
          source.material.color.setHex(0xff_33_33);
        }
      }
      const twoMaterialBaseline = await render();
      const split = createGltfSurfaceBatches(root, sources);
      resources.push(split);
      split.sync();
      const splitStart = rawCounts.indexed;
      expect(await render()).toEqual(twoMaterialBaseline);
      expect(rawCounts.indexed - splitStart).toBe(2);
      const buffers = split.group.children.map((object) =>
        object instanceof InstancedMesh ? object.instanceMatrix : undefined,
      );
      for (const source of sources.slice(0, 10)) {
        source.visible = false;
      }
      split.sync();
      await render();
      for (const source of sources.slice(0, 10)) {
        source.visible = true;
        source.material.opacity = 0.25;
        source.material.transparent = true;
        source.material.depthWrite = false;
      }
      split.sync();
      await render();
      for (const source of sources.slice(0, 10)) {
        source.material.opacity = 1;
        source.material.transparent = false;
        source.material.depthWrite = true;
      }
      split.sync();
      await render();
      expect(
        split.group.children.map((object) => (object instanceof InstancedMesh ? object.instanceMatrix : undefined)),
      ).toEqual(buffers);
      const moved = sources[1]!;
      moved.position.y += 0.5;
      split.syncMatrices([moved]);
      const posed = await render();
      split.dispose();
      expect(await render()).toEqual(posed);
      if (backend === 'webgpu') {
        const initialOwned = instanceLifetime().allocated;
        expect(instanceLifetime().destroyed).toBe(initialOwned);
        const sharedMaterial = new MeshStandardMaterial({ color: 0xcc_cc_cc });
        qualifyGltfSurfaceMaterial(sharedMaterial);
        sealGltfSurfaceMaterial(sharedMaterial);
        resources.push(sharedMaterial);
        const geometryDispose = vi.spyOn(geometry, 'dispose');
        const materialDispose = vi.fn();
        sharedMaterial.addEventListener('dispose', materialDispose);
        const owners = Array.from({ length: 2 }, () => {
          const ownerRoot = new Group();
          scene.add(ownerRoot);
          const members = Array.from({ length: 100 }, (_, index) => {
            const mesh = new Mesh(geometry, sharedMaterial);
            mesh.position.x = 30 + index;
            mesh.frustumCulled = false;
            ownerRoot.add(mesh);
            return mesh;
          });
          const owner = createGltfSurfaceBatches(ownerRoot, members);
          owner.sync();
          expect(owner.group.children).toHaveLength(1);
          resources.push(owner);
          return owner;
        });
        const sharedPixels = await render();
        expect(instanceLifetime()).toEqual({ allocated: initialOwned + 2, destroyed: initialOwned });
        owners[0]!.dispose();
        expect(await render()).toEqual(sharedPixels);
        expect(instanceLifetime()).toEqual({ allocated: initialOwned + 2, destroyed: initialOwned + 1 });
        owners[1]!.dispose();
        await render();
        expect(instanceLifetime()).toEqual({ allocated: initialOwned + 2, destroyed: initialOwned + 2 });
        const largeRoot = new Group();
        scene.add(largeRoot);
        const count = 2048;
        instanceSizes.add(count * 64);
        const members = Array.from({ length: count }, (_, index) => {
          const mesh = new Mesh(geometry, sharedMaterial);
          mesh.position.x = 30 + index;
          mesh.frustumCulled = false;
          largeRoot.add(mesh);
          return mesh;
        });
        const large = createGltfSurfaceBatches(largeRoot, members);
        large.sync();
        resources.push(large);
        await render();
        expect(instanceLifetime()).toEqual({ allocated: initialOwned + 3, destroyed: initialOwned + 2 });
        sharedMaterial.flatShading = true;
        sharedMaterial.needsUpdate = true;
        await render();
        sharedMaterial.flatShading = false;
        sharedMaterial.needsUpdate = true;
        await render();
        large.dispose();
        await render();
        expect(instanceLifetime().destroyed).toBe(instanceLifetime().allocated);
        const warmRoot = new Group();
        scene.add(warmRoot);
        const warmMembers = Array.from({ length: 100 }, () => {
          const mesh = new Mesh(geometry, sharedMaterial);
          mesh.position.x = 40;
          mesh.frustumCulled = false;
          warmRoot.add(mesh);
          return mesh;
        });
        const warm = createGltfSurfaceBatches(warmRoot, warmMembers);
        warm.sync();
        resources.push(warm);
        await renderer.compileAsync(scene, camera);
        await render();
        warm.dispose();
        await render();
        expect(instanceLifetime().destroyed).toBe(instanceLifetime().allocated);
        expect(instanceLifetime()).toEqual({ allocated: 12, destroyed: 12 });
        expect(geometryDispose).not.toHaveBeenCalled();
        expect(materialDispose).not.toHaveBeenCalled();
        geometryDispose.mockRestore();
        sharedMaterial.removeEventListener('dispose', materialDispose);
        console.info('E06 surviving/large owners', JSON.stringify(instanceLifetime()));
      }
      expect(validation).toEqual([]);
      console.info(
        'E06 commands',
        JSON.stringify({
          backend,
          canonical: 100,
          batched: 1,
          split: 2,
          geometryPositionUploads: rawCounts.positionUploads,
          ownedInstanceBytes: 6400,
          auxiliaryDraws: rawCounts.nonIndexed,
        }),
      );
    } finally {
      restoreRaw();
      consoleErrors.mockRestore();
      for (const resource of resources.reverse()) {
        resource.dispose();
      }
    }
  });
  it('should retain existing canonical instances and posed pixels while batching ordinary meshes', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const renderer = await createRenderer('viewport', backend, canvas);
    const resources: Array<{ dispose(): void }> = [renderer];
    const restore: Array<() => void> = [];
    const scene = new Scene();
    scene.background = new Color(0);
    scene.add(new AmbientLight(0xff_ff_ff, 1));
    const light = new DirectionalLight(0xff_ff_ff, 2);
    light.position.set(0, 0, 10);
    scene.add(light);
    const root = new Group();
    scene.add(root);
    const parent = new Group();
    parent.position.set(0.5, 1, 0);
    parent.rotation.z = 0.3;
    parent.scale.setScalar(1.25);
    root.add(parent);
    const geometry = new BoxGeometry(0.8, 0.8, 0.4);
    const material = new MeshStandardMaterial({ color: 0x44_cc_88, roughness: 0.5 });
    qualifyGltfSurfaceMaterial(material);
    resources.push(geometry, material);
    const canonical = [2, 3].map((count, index) => {
      const source = new InstancedMesh(geometry, material, count);
      source.position.set(index * 3 - 1.5, 0, 0);
      source.rotation.z = -0.2;
      for (let slot = 0; slot < count; slot++) {
        const matrix = new Matrix4().makeRotationZ(slot * 0.15);
        matrix.setPosition(slot * 0.9 - 0.5, slot * 0.8 - 0.5, 0);
        source.setMatrixAt(slot, matrix);
      }
      parent.add(source);
      resources.push(source);
      return source;
    });
    const ordinary = [-3, 3].map((x) => {
      const source = new Mesh(geometry, material);
      source.position.set(x, -3, 0);
      root.add(source);
      return source;
    });
    const camera = new OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.updateMatrixWorld();
    const webGlTarget = renderer instanceof WebGLRenderer ? new WebGLRenderTarget(size, size) : undefined;
    const target = webGlTarget ?? new RenderTarget(size, size);
    resources.push(target);
    let indexedCount = (): number => 0;
    try {
      if (renderer instanceof WebGLRenderer) {
        const gl = renderer.getContext();
        if (!(gl instanceof WebGL2RenderingContext)) {
          throw new TypeError('Expected WebGL2 context');
        }
        const direct = vi.spyOn(gl, 'drawElements');
        const instanced = vi.spyOn(gl, 'drawElementsInstanced');
        indexedCount = () => direct.mock.calls.length + instanced.mock.calls.length;
        restore.push(
          () => {
            direct.mockRestore();
          },
          () => {
            instanced.mockRestore();
          },
        );
      } else {
        nativeDevice(renderer);
        const indexed = vi.spyOn(GPURenderPassEncoder.prototype, 'drawIndexed');
        indexedCount = () => indexed.mock.calls.length;
        restore.push(() => {
          indexed.mockRestore();
        });
      }
      const render = async (): Promise<Uint8Array<ArrayBuffer>> => {
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
          if (!webGlTarget) {
            throw new TypeError('Expected WebGL render target');
          }
          const pixels = new Uint8Array(size * size * 4);
          renderer.readRenderTargetPixels(webGlTarget, 0, 0, size, size, pixels);
          return pixels;
        }
        return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size));
      };
      const before = indexedCount();
      const baseline = await render();
      expect(indexedCount() - before).toBe(4);
      expect(baseline.some((value, index) => index % 4 !== 3 && value > 0)).toBe(true);
      const owner = createGltfSurfaceBatches(root, [...ordinary, ...canonical]);
      resources.push(owner);
      owner.sync();
      const batchedStart = indexedCount();
      expect(await render()).toEqual(baseline);
      expect(indexedCount() - batchedStart).toBe(3);
      expect(canonical.map((source) => source.count)).toEqual([2, 3]);
      expect(canonical.map((source) => source.layers.mask)).toEqual([1, 1]);
      expect(ordinary.map((source) => source.layers.mask)).toEqual([0, 0]);
      parent.position.x += 0.75;
      parent.rotation.z += 0.25;
      owner.syncMatrices([parent]);
      const posedStart = indexedCount();
      const posed = await render();
      expect(indexedCount() - posedStart).toBe(3);
      expect(posed).not.toEqual(baseline);
      owner.dispose();
      const directPosedStart = indexedCount();
      expect(await render()).toEqual(posed);
      expect(indexedCount() - directPosedStart).toBe(4);
      const successor = createGltfSurfaceBatches(root, [...ordinary, ...canonical]);
      resources.push(successor);
      successor.sync();
      const successorStart = indexedCount();
      expect(await render()).toEqual(posed);
      expect(indexedCount() - successorStart).toBe(3);
      console.info(
        'C6 canonical instance registration',
        JSON.stringify({ backend, canonicalSlots: 5, directCommands: 4, batchedCommands: 3, changedParent: true }),
      );
    } finally {
      for (const dispose of restore.reverse()) {
        dispose();
      }
      for (const resource of resources.reverse()) {
        resource.dispose();
      }
    }
  });
});
