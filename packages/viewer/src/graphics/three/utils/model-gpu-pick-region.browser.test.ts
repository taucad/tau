import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPURenderer, WebGPUBackend } from 'three/webgpu';
import { createRenderer } from '#graphics/three/renderer.js';
import { setRaycasterFromCamera } from '#graphics/three/utils/raycaster-from-camera.js';
import { createModelGpuPicker } from '#graphics/three/utils/model-gpu-pick.js';

const executions = ['classic', 'webgpu', 'nodegl'] as const;

/** Exact object/depth oracle independent of crop math, including a detached camera rig. */
describe.each(executions)('bounded model picking on %s', (execution) => {
  it('should allocate only on demand and preserve pixel-centre hits at 5K and small viewports', async () => {
    const canvas = document.createElement('canvas');
    const renderer = await createRenderer(
      execution === 'nodegl' ? 'showcase' : 'viewport',
      execution === 'webgpu' ? 'webgpu' : 'webgl',
      canvas,
    );
    if (renderer instanceof WebGPURenderer) {
      expect(renderer.backend instanceof WebGPUBackend).toBe(execution === 'webgpu');
    }
    renderer.setPixelRatio(2);
    renderer.setSize(2560, 1440);
    const group = new THREE.Group();
    group.position.set(7, -3, 2);
    const material = new THREE.MeshBasicMaterial();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), material);
    const box = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2), material);
    box.position.set(1, -0.3, 1);
    group.add(floor, box);
    group.updateMatrixWorld(true);
    const meshes = [floor, box];
    const landed = vi.fn();
    const picker = createModelGpuPicker({
      renderer,
      sectionClip: undefined,
      onLanded: landed,
      settleMilliseconds: 0,
    });
    const read = vi.spyOn(renderer, 'readRenderTargetPixelsAsync');
    const targets = new Set<THREE.RenderTarget>();
    try {
      for (const perspective of [false, true]) {
        const camera = perspective
          ? new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100)
          : new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100);
        camera.position.set(0, 0, 10);
        group.add(camera);
        camera.setViewOffset(2560, 1440, 3, 2, 2560, 1440);
        group.updateMatrixWorld(true);
        const warm = new THREE.WebGLRenderTarget(1, 1);
        renderer.setRenderTarget(warm);
        renderer.render(new THREE.Scene(), camera);
        renderer.setRenderTarget(null);
        warm.dispose();
        for (const [width, height] of [
          [2560, 1440],
          [73, 51],
        ]) {
          picker.frame({ camera, width: width!, height: height!, meshes });
          if (read.mock.calls.length === 0) {
            // oxlint-disable-next-line no-await-in-loop -- Assert no speculative pass even through explicit refresh.
            await picker.refresh();
            expect(read).not.toHaveBeenCalled();
          }
          const projection = camera.projectionMatrix.clone();
          const world = camera.matrixWorld.clone();
          for (const [fx, fy] of [
            [0, 0],
            [0.99, 0],
            [0, 0.99],
            [0.99, 0.99],
            [0.5, 0.5],
            [0.4, 0.7],
            [0.1, 0.5],
          ]) {
            const column = Math.floor(fx! * width!);
            const row = Math.floor(fy! * height!);
            const ray = new THREE.Raycaster();
            setRaycasterFromCamera(
              ray,
              new THREE.Vector2((2 * (column + 0.5)) / width! - 1, 1 - (2 * (row + 0.5)) / height!),
              camera,
            );
            const expected = ray.intersectObjects(meshes, false)[0];
            picker.pick(ray);
            // oxlint-disable-next-line no-await-in-loop -- Read the requested tile before testing its cached answer.
            await picker.refresh();
            const actual = picker.pick(ray);
            expect(actual.status).toBe(expected ? 'hit' : 'miss');
            if (actual.status === 'hit' && expected) {
              expect(actual.intersection.object).toBe(expected.object);
              // Full-frame reference also has fixed-point raster interpolation error at 73×51.
              // Bound it to 1/256 of a CSS pixel footprint plus Float32 world-position error.
              const footprint =
                camera instanceof THREE.PerspectiveCamera
                  ? (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * expected.distance) / height!
                  : 9 / height!;
              expect(Math.abs(actual.intersection.distance - expected.distance)).toBeLessThan(
                40 * 2e-6 + footprint / 256,
              );
              ray.far = expected.distance * 0.5;
              expect(picker.pick(ray).status).toBe('miss');
              ray.far = Number.POSITIVE_INFINITY;
              ray.near = expected.distance * 1.5;
              expect(picker.pick(ray).status).toBe('miss');
              ray.near = 0;
              ray.layers.set(2);
              expect(picker.pick(ray).status).toBe('miss');
            }
            expect(camera.projectionMatrix.equals(projection)).toBe(true);
            expect(camera.matrixWorld.equals(world)).toBe(true);
          }
        }
        group.remove(camera);
      }
      for (const call of read.mock.calls) {
        const target = call[0] as THREE.RenderTarget;
        targets.add(target);
        expect(call[3]).toBeLessThanOrEqual(128);
        expect(call[4]).toBeLessThanOrEqual(128);
        expect(target.texture.type).toBe(THREE.FloatType);
        expect(target.samples).toBe(0);
        expect(target.depthBuffer).toBe(true);
      }
      // Capacity survives pointer motion; only viewport size changes retire it.
      expect(targets.size).toBeLessThanOrEqual(4);
      const ray = new THREE.Raycaster(new THREE.Vector3(100, 0, 0), new THREE.Vector3(1, 0, 0));
      expect(picker.pick(ray).status).toBe('unavailable');
    } finally {
      picker.dispose();
      read.mockRestore();
      floor.geometry.dispose();
      box.geometry.dispose();
      material.dispose();
      renderer.dispose();
    }
  });

  it('should invalidate cached visibility, layers and transforms without resizing the region', async () => {
    const renderer = await createRenderer(
      execution === 'nodegl' ? 'showcase' : 'viewport',
      execution === 'webgpu' ? 'webgpu' : 'webgl',
      document.createElement('canvas'),
    );
    renderer.setPixelRatio(2);
    renderer.setSize(2560, 1440);
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    camera.position.z = 10;
    camera.updateMatrixWorld();
    const material = new THREE.MeshBasicMaterial();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), material);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), material);
    front.position.z = 2;
    const picker = createModelGpuPicker({ renderer, sectionClip: undefined, settleMilliseconds: 0 });
    const read = vi.spyOn(renderer, 'readRenderTargetPixelsAsync');
    const ray = new THREE.Raycaster();
    const frame = (): void => {
      back.updateMatrixWorld();
      front.updateMatrixWorld();
      picker.frame({ camera, width: 2560, height: 1440, meshes: [back, front] });
      setRaycasterFromCamera(ray, new THREE.Vector2(), camera);
    };
    const hit = (): THREE.Object3D | undefined => {
      const answer = picker.pick(ray);
      return answer.status === 'hit' ? answer.intersection.object : undefined;
    };
    try {
      frame();
      expect(picker.pick(ray).status).toBe('pending');
      await picker.refresh();
      expect(hit()).toBe(front);
      front.visible = false;
      expect(picker.pick(ray).status).toBe('pending');
      frame();
      await picker.refresh();
      expect(hit()).toBe(back);
      front.visible = true;
      front.position.z = -2;
      frame();
      expect(picker.pick(ray).status).toBe('pending');
      await picker.refresh();
      expect(hit()).toBe(back);
      front.position.z = 2;
      front.layers.set(2);
      frame();
      await picker.refresh();
      expect(hit()).toBe(back);
      front.layers.set(0);
      frame();
      await picker.refresh();
      expect(hit()).toBe(front);
      const count = read.mock.calls.length;
      await picker.refresh();
      expect(read).toHaveBeenCalledTimes(count);
      expect(new Set(read.mock.calls.map((call) => call[0])).size).toBe(1);
      setRaycasterFromCamera(ray, new THREE.Vector2(2, 0), camera);
      expect(picker.pick(ray).status).toBe('miss');
      await picker.refresh();
      expect(read).toHaveBeenCalledTimes(count);
    } finally {
      picker.dispose();
      read.mockRestore();
      back.geometry.dispose();
      front.geometry.dispose();
      material.dispose();
      renderer.dispose();
    }
  });

  it('should coalesce pending regions and suppress replay after disposal', async () => {
    const renderer = await createRenderer(
      execution === 'nodegl' ? 'showcase' : 'viewport',
      execution === 'webgpu' ? 'webgpu' : 'webgl',
      document.createElement('canvas'),
    );
    const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100);
    camera.position.z = 10;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld();
    const warm = new THREE.WebGLRenderTarget(1, 1);
    renderer.setRenderTarget(warm);
    renderer.render(new THREE.Scene(), camera);
    renderer.setRenderTarget(null);
    const landed = vi.fn();
    const picker = createModelGpuPicker({
      renderer,
      sectionClip: undefined,
      onLanded: landed,
      settleMilliseconds: 0,
    });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hold = async <T>(result: Promise<T>): Promise<T> => {
      const data = await result;
      await gate;
      return data;
    };
    const read = (() => {
      if (renderer instanceof THREE.WebGLRenderer) {
        const original = renderer.readRenderTargetPixelsAsync.bind(renderer);
        return vi
          .spyOn(renderer, 'readRenderTargetPixelsAsync')
          .mockImplementationOnce(async (...args) => hold(original(...args)));
      }
      const original = renderer.readRenderTargetPixelsAsync.bind(renderer);
      return vi
        .spyOn(renderer, 'readRenderTargetPixelsAsync')
        .mockImplementationOnce(async (...args) => hold(original(...args)));
    })();
    try {
      picker.frame({ camera, width: 2560, height: 1440, meshes: [mesh] });
      const ray = new THREE.Raycaster();
      setRaycasterFromCamera(ray, new THREE.Vector2(-0.8, 0), camera);
      expect(picker.pick(ray).status).toBe('pending');
      const pending = picker.refresh();
      setRaycasterFromCamera(ray, new THREE.Vector2(0.8, 0), camera);
      expect(picker.pick(ray).status).toBe('pending');
      release!();
      await pending;
      expect(landed).not.toHaveBeenCalled();
      await vi.waitFor(() => {
        expect(landed).toHaveBeenCalledTimes(1);
      });
      expect(picker.pick(ray).status).toBe('hit');
      expect(read).toHaveBeenCalledTimes(2);
      landed.mockClear();
      setRaycasterFromCamera(ray, new THREE.Vector2(0, 0.8), camera);
      expect(picker.pick(ray).status).toBe('pending');
      const last = picker.refresh();
      picker.dispose();
      await last;
      expect(landed).not.toHaveBeenCalled();
      expect(picker.pick(ray).status).toBe('unavailable');
    } finally {
      release?.();
      picker.dispose();
      read.mockRestore();
      warm.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
      renderer.dispose();
    }
  });
});
