import { expect, it } from 'vitest';
import { PerspectiveCamera, UnsignedByteType, Vector3, WebGPUCoordinateSystem } from 'three';
import { NodeMaterial, QuadMesh, RenderTarget, WebGLBackend, WebGPUBackend } from 'three/webgpu';
import { sample, screenUV, select, uniform, vec3, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { createRenderer } from '#graphics/three/renderer.js';
import { gtao } from '#graphics/three/gtao-node.js';

// A floor facing the camera 30 radii away, cut at the screen's centre column by a step whose top sits `h` radii
// closer. A floor pixel just left of the step sees samples on the step's top, 3D distance about h from it.
const size = 256;
const radius = 1;
const floorDistance = 30 * radius;
// Three r184's hard slab: the viewer's former `thicknessRatio`, 1 / 0.09 radii of view depth.
const oldSlabRatio = 1 / 0.09;

it.each(['webgpu', 'webgl'] as const)(
  'should weight GTAO samples by the smooth 3D-distance falloff, not the hard slab, on %s',
  async (backend) => {
    const renderer = await createRenderer('showcase', backend, document.createElement('canvas'));
    expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    const camera = new PerspectiveCamera(90, 1, 0.5, 100);
    camera.coordinateSystem = renderer.coordinateSystem;
    camera.updateProjectionMatrix();
    const depthAt = (distance: number): number => {
      const ndc = new Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix).z;
      return renderer.coordinateSystem === WebGPUCoordinateSystem ? ndc : ndc * 0.5 + 0.5;
    };
    const floorDepth = uniform(depthAt(floorDistance));
    const stepDepth = uniform(depthAt(floorDistance));
    const aoNode = gtao(
      sample((uv: Node) => select<'float'>((uv as Node<'vec2'>).x.lessThan(0.5), floorDepth, stepDepth)),
      sample(() => vec4(0, 0, 1, 1)),
      camera,
    );
    aoNode.resolutionScale = 1;
    aoNode.useTemporalFiltering = false;
    aoNode.samples.value = 16;
    aoNode.radius.value = radius;
    aoNode.scale.value = 1;
    aoNode.distanceFallOff.value = 0.5;
    const material = new NodeMaterial();
    material.fragmentNode = vec4(vec3(aoNode.getTextureNode().sample(screenUV).r), 1);
    material.depthTest = false;
    material.depthWrite = false;
    const quad = new QuadMesh(material);
    const target = new RenderTarget(size, size, { type: UnsignedByteType });
    // Visibility of the floor pixels two columns left of the step, over the middle rows (the noise varies per pixel).
    const render = async ({
      height,
      end = 22,
      range = 0.8,
    }: {
      height: number;
      end?: number;
      range?: number;
    }): Promise<number[]> => {
      stepDepth.value = depthAt(floorDistance - height * radius);
      aoNode.falloffEnd.value = end;
      aoNode.falloffRange.value = range;
      renderer.setRenderTarget(target);
      quad.render(renderer);
      const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size)) as Uint8Array<ArrayBuffer>;
      const values: number[] = [];
      for (let y = size / 2 - 8; y < size / 2 + 8; y++) {
        values.push(pixels[(y * size + size / 2 - 2) * 4]! / 255);
      }
      return values;
    };
    const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
    const expectSame = (actual: number[], expected: number[]): void => {
      for (const [index, value] of actual.entries()) {
        expect(Math.abs(value - expected[index]!)).toBeLessThanOrEqual(2 / 255);
      }
    };
    try {
      const open = await render({ height: 0 });
      expect(Math.min(...open)).toBeGreaterThan(0.98);

      // Weight 1 inside (1 - range) × end = 4.4 radii: a longer falloff changes nothing there.
      const near = await render({ height: 3 });
      expect(mean(near)).toBeLessThan(mean(open) - 0.05);
      expectSame(await render({ height: 3, end: 1000 }), near);

      // Weight 0 from end = 22 radii: the step no longer occludes at all.
      expectSame(await render({ height: 22.5 }), open);
      expectSame(await render({ height: 28 }), open);

      // Linear in between: occlusion fades monotonically with distance, and a second (end, range) pair with the
      // same linear weight at 15 radii, (end - d) / (range × end), shades identically.
      const fading = [await render({ height: 8 }), await render({ height: 13 }), await render({ height: 18 })];
      expect(mean(fading[0]!)).toBeLessThan(mean(fading[1]!));
      expect(mean(fading[1]!)).toBeLessThan(mean(fading[2]!));
      expect(mean(fading[2]!)).toBeLessThan(mean(open));
      const beyondSlab = await render({ height: 15 });
      expectSame(await render({ height: 15, end: 20, range: (20 - 15) / (20 * ((22 - 15) / (22 * 0.8))) }), beyondSlab);

      // The hard-slab regression: a step taller than the old slab (11.1 radii of view depth) still shades its foot.
      expect(15).toBeGreaterThan(oldSlabRatio);
      expect(mean(beyondSlab)).toBeLessThan(mean(open) - 0.03);
    } finally {
      renderer.setRenderTarget(null);
      target.dispose();
      material.dispose();
      aoNode.dispose();
      renderer.dispose();
    }
  },
);
