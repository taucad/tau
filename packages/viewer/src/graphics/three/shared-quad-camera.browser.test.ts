import { expect, it } from 'vitest';
import {
  BoxGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  PerspectiveCamera,
  QuadMesh,
  Scene,
  WebGPURenderer,
} from 'three/webgpu';
import { createRenderer } from '#graphics/three/renderer.js';

it('should present a showcase canvas after a reversed-depth viewport has drawn a quad', async () => {
  const viewport = await createRenderer('viewport', 'webgpu', document.createElement('canvas'));
  if (!(viewport instanceof WebGPURenderer)) {
    throw new Error('Expected the node renderer');
  }
  // Every QuadMesh, including each renderer's output pass, shares one camera that the viewport flags reversed.
  new QuadMesh(new MeshBasicNodeMaterial()).render(viewport);
  const canvas = document.createElement('canvas');
  const showcase = await createRenderer('showcase', 'webgpu', { canvas });
  try {
    showcase.setSize(16, 16, false);
    const scene = new Scene();
    scene.add(new Mesh(new BoxGeometry(3, 3, 3), new MeshBasicNodeMaterial({ color: 0xff_00_00 })));
    const camera = new PerspectiveCamera();
    camera.position.z = 5;
    showcase.render(scene, camera);
    const copy = document.createElement('canvas').getContext('2d')!;
    copy.drawImage(canvas, 0, 0);
    // A still-reversed output quad lands at the far plane and fails the depth test, so nothing presents.
    expect(copy.getImageData(8, 8, 1, 1).data[3]).toBe(255);
  } finally {
    showcase.dispose();
    viewport.dispose();
  }
});
