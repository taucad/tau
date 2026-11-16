import { expect, it } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Vector4,
  WebGPUCoordinateSystem,
} from 'three';
import { createEmphasisMaskCrop } from '#graphics/three/materials/model-emphasis-crop.js';
import { createEmphasisCompositeRegion } from '#graphics/three/materials/model-emphasis-region.js';

it.each([false, true])('should preserve crop depth and pixel placement: perspective=%s', (perspective) => {
  const geometry = new PlaneGeometry(2, 2);
  const source = new Mesh(new BoxGeometry(0.4, 0.6, 0.2));
  const camera = perspective
    ? new PerspectiveCamera(40, 16 / 9, 0.01, 10_000)
    : new OrthographicCamera(-4, 4, 2.25, -2.25, 0.01, 10_000);
  camera.position.z = 5;
  camera.updateMatrixWorld();
  const update = createEmphasisCompositeRegion(geometry);
  const crop = createEmphasisMaskCrop();
  const size = { width: 5120, height: 2880, pixelRatio: 2 };
  const original = camera.projectionMatrix.toArray();
  for (const x of [-1.003, 0.007, 1.345]) {
    source.position.set(x, 0.237, 0);
    source.updateMatrixWorld();
    const region = update([{ source }], camera, size);
    const cropped = crop.update(camera, region, size);
    expect(camera.projectionMatrix.toArray()).toEqual(original);
    expect(crop.pixels.z * crop.pixels.w).toBeLessThan((size.width * size.height) / 4);
    expect(crop.pixels.toArray().every((value) => Number.isInteger(value))).toBe(true);
    const world = new Vector4(0.1, 0.2, 0.03, 1)
      .applyMatrix4(source.matrixWorld)
      .applyMatrix4(camera.matrixWorldInverse);
    const full = world.clone().applyMatrix4(camera.projectionMatrix);
    const bounded = world.clone().applyMatrix4(cropped.projectionMatrix);
    expect(bounded.z).toBe(full.z);
    expect(bounded.w).toBe(full.w);
    expect(((bounded.x / bounded.w + 1) * crop.pixels.z) / 2 + crop.pixels.x).toBeCloseTo(
      ((full.x / full.w + 1) * size.width) / 2,
      8,
    );
    expect(((1 - bounded.y / bounded.w) * crop.pixels.w) / 2 + crop.pixels.y).toBeCloseTo(
      ((1 - full.y / full.w) * size.height) / 2,
      8,
    );
  }
  const capacity = crop.pixels.z * crop.pixels.w;
  source.scale.setScalar(0.1);
  source.updateMatrixWorld();
  crop.update(camera, update([{ source }], camera, size), size);
  expect(crop.pixels.z * crop.pixels.w).toBe(capacity);
  crop.reset();
  crop.update(camera, update([{ source }], camera, size), size);
  expect(crop.pixels.z * crop.pixels.w).toBeLessThan(capacity);
  crop.update(camera, new Vector4(-1, -1, 1, 1), size);
  expect(crop.uv.toArray()).toEqual([0, 0, 1, 1]);
  const resized = { width: 320, height: 240, pixelRatio: 1.5 };
  crop.update(camera, update([{ source }], camera, resized), resized);
  expect(crop.pixels.z).toBeLessThan(320);
  geometry.dispose();
  source.geometry.dispose();
});

it('should preserve a parented camera world transform when the renderer updates cameras', () => {
  const rig = new Group();
  rig.position.set(2, 3, 4);
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
  camera.position.z = 5;
  rig.add(camera);
  rig.updateMatrixWorld(true);
  const crop = createEmphasisMaskCrop();
  const cropped = crop.update(camera, new Vector4(-0.5, -0.5, 0.5, 0.5), { width: 5120, height: 2880, pixelRatio: 2 });
  if (cropped.parent === null && cropped.matrixWorldAutoUpdate) {
    cropped.updateMatrixWorld();
  }
  expect(cropped.matrixWorld.toArray()).toEqual(camera.matrixWorld.toArray());
  expect(cropped.matrixWorldInverse.toArray()).toEqual(camera.matrixWorldInverse.toArray());
});

// Finding 6 of docs/research/orthographic-controls-distance-clip-and-low-fov-grid-blueprint.md: the node renderer
// recomputes a fresh crop camera's projection on first use, which dropped the crop for one frame.
it.each([false, true])('should keep the crop through a projection recompute: perspective=%s', (perspective) => {
  const camera = perspective
    ? new PerspectiveCamera(40, 16 / 9, 0.1, 100)
    : new OrthographicCamera(-4, 4, 2.25, -2.25, 0.1, 100);
  const crop = createEmphasisMaskCrop();
  const size = { width: 5120, height: 2880, pixelRatio: 2 };
  const region = new Vector4(-0.5, -0.5, 0.5, 0.5);
  const cropped = crop.update(camera, region, size) as PerspectiveCamera | OrthographicCamera;
  const expected = cropped.projectionMatrix.clone();
  expect(expected.equals(camera.projectionMatrix)).toBe(false);
  cropped.updateProjectionMatrix();
  expect(cropped.projectionMatrix.equals(expected)).toBe(true);

  // `Renderer._renderScene` on a camera whose depth convention or coordinate system differs from the renderer's.
  Object.assign(camera, { _reversedDepth: true });
  camera.coordinateSystem = WebGPUCoordinateSystem;
  camera.updateProjectionMatrix();
  crop.update(camera, region, size);
  Object.assign(cropped, { _reversedDepth: true });
  cropped.coordinateSystem = WebGPUCoordinateSystem;
  const reversed = cropped.projectionMatrix.clone();
  cropped.updateProjectionMatrix();
  expect(cropped.projectionMatrix.equals(reversed)).toBe(true);
  expect(cropped.projectionMatrix.equals(camera.projectionMatrix)).toBe(false);

  // A later source projection: the crop camera follows it, and a recompute keeps the new crop.
  camera.near = 0.5;
  camera.updateProjectionMatrix();
  crop.update(camera, region, size);
  const changed = cropped.projectionMatrix.clone();
  expect(changed.equals(reversed)).toBe(false);
  cropped.updateProjectionMatrix();
  expect(cropped.projectionMatrix.equals(changed)).toBe(true);
  expect(cropped.projectionMatrixInverse.equals(changed.clone().invert())).toBe(true);
});
