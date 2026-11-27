import { expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import { createRenderer } from '#graphics/three/renderer.js';

type LoopInternals = Readonly<{
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Three's own field holds `null` when stopped.
  _animation: Readonly<{ _requestId: number | null }>;
  _nodes: Readonly<{ nodeFrame: Readonly<{ frameId: number }> }>;
}>;

// UI Policy, steady-state decorations: an unchanged scene requests no frames. Three's node renderer starts a loop in
// `init` that requests one every vsync; the viewport preset stops it and renders on demand.
it('should request no frames while an on-demand node viewport is idle, and still advance its node frame per render', async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  document.body.append(canvas);
  const renderer = await createRenderer('viewport', 'webgl', { canvas, nodePipeline: true });
  const internals = renderer as unknown as LoopInternals;
  const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');

  await new Promise((resolve) => {
    setTimeout(resolve, 200);
  });

  expect(internals._animation._requestId).toBeNull();
  expect(requestFrame).not.toHaveBeenCalled();

  const scene = new Scene();
  scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  const camera = new PerspectiveCamera();
  camera.position.z = 3;
  const before = internals._nodes.nodeFrame.frameId;
  renderer.render(scene, camera);
  await Promise.resolve();
  renderer.render(scene, camera);

  expect(internals._nodes.nodeFrame.frameId).toBe(before + 2);
  expect(requestFrame).not.toHaveBeenCalled();
  requestFrame.mockRestore();
  renderer.dispose();
  canvas.remove();
});
