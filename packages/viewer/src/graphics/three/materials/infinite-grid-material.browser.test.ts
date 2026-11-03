import { expect, it } from 'vitest';
import { Color, Mesh, NoToneMapping, PerspectiveCamera, PlaneGeometry, Scene, UnsignedByteType } from 'three';
import { MeshBasicNodeMaterial, RenderTarget, WebGLBackend, WebGPUBackend, WebGPURenderer } from 'three/webgpu';
import { createRenderer } from '#graphics/three/renderer.js';
import { applyGltfSurfaceDepthBias } from '#graphics/three/materials/gltf-surface-depth-bias.js';
import { createInfiniteGridNodeMaterial } from '#graphics/three/materials/infinite-grid-material.node.js';

// 64 RGBA8 texels fill one 256-byte WebGPU readback row, so rows are unpadded.
const size = 64;

it.each(['webgpu', 'webgl'] as const)(
  'should keep the grid behind a part face lying on the grid plane on %s',
  async (backend) => {
    const renderer = await createRenderer('viewport', backend, {
      canvas: document.createElement('canvas'),
      nodePipeline: true,
    });
    if (!(renderer instanceof WebGPURenderer)) {
      throw new Error('Expected the node renderer');
    }
    expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
    renderer.setSize(size, size);
    renderer.toneMapping = NoToneMapping;
    const target = new RenderTarget(size, size, { type: UnsignedByteType, samples: 0 });
    // Dense, opaque green lines on the XZ plane; the face under them is red.
    const grid = createInfiniteGridNodeMaterial({
      axes: 'xzy',
      color: new Color(0, 1, 0),
      lineOpacity: 1,
      smallSize: 0.05,
      smallThickness: 3,
      gridDistance: 50,
    });
    const faceMaterial = new MeshBasicNodeMaterial({ color: new Color(1, 0, 0) });
    applyGltfSurfaceDepthBias(faceMaterial, 'webgpu');
    const faceGeometry = new PlaneGeometry(20, 20).rotateX(-Math.PI / 2);
    const proxyGeometry = new PlaneGeometry(1, 1);
    const face = new Mesh(faceGeometry, faceMaterial);
    const gridMesh = new Mesh(proxyGeometry, grid.material);
    gridMesh.frustumCulled = false;
    const camera = new PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(0, 1.5, 2.5);
    camera.lookAt(0, 0, 0);
    const countGreen = async (scene: Scene): Promise<number> => {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size);
      let green = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 1]! > 64) {
          green++;
        }
      }
      return green;
    };
    try {
      const control = new Scene();
      control.background = new Color(0);
      control.add(gridMesh);
      // Negative control: the grid alone must draw lines across the frame.
      expect(await countGreen(control)).toBeGreaterThan(size * 4);
      const scene = new Scene();
      scene.background = new Color(0);
      scene.add(face, gridMesh);
      expect(await countGreen(scene)).toBe(0);
    } finally {
      renderer.setRenderTarget(null);
      target.dispose();
      faceGeometry.dispose();
      proxyGeometry.dispose();
      faceMaterial.dispose();
      grid.material.dispose();
      renderer.dispose();
    }
  },
);
