// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Vector2 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { LineSegments2 } from 'three/addons';
import {
  applyFatLineSegments,
  collectGltfFatLineMaterials,
  setGltfFatLineEmphasis,
  updateGltfEdgeColor,
  updateLineMaterialResolution,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import type { GltfFatLineMaterial } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
  gltfEdgeHoverColor,
  gltfEdgeSelectedColor,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';

function makeScene(): { scene: Group; lines: LineSegments2[] } {
  const scene = new Group();
  for (let index = 0; index < 2; index++) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    scene.add(new LineSegments(geometry, new LineBasicMaterial()));
  }
  applyFatLineSegments({ scene } as unknown as GLTF, { backend: 'webgl', resolution: new Vector2(800, 600) });
  const lines: LineSegments2[] = [];
  scene.traverse((object) => {
    if (object.type === 'LineSegments2') {
      lines.push(object as LineSegments2);
    }
  });
  return { scene, lines };
}

const colorOf = (material: unknown): number => (material as GltfFatLineMaterial).color.getHex();

describe('setGltfFatLineEmphasis', () => {
  it('swaps only the emphasised line to a shared yellow overlay material and restores the base', () => {
    const { lines } = makeScene();
    const [first, second] = lines as [LineSegments2, LineSegments2];
    const base = first.material;

    setGltfFatLineEmphasis(first, 'hover');
    expect(colorOf(first.material)).toBe(gltfEdgeHoverColor);
    expect(first.material.depthTest).toBe(false);
    expect(first.material.depthWrite).toBe(false);
    expect(first.renderOrder).toBe(viewportRenderTiers.modelEdgeEmphasis);
    expect(second.material).toBe(base);
    expect(second.renderOrder).toBe(viewportRenderTiers.model);

    setGltfFatLineEmphasis(second, 'selected');
    setGltfFatLineEmphasis(first, 'focused');
    expect(colorOf(second.material)).toBe(gltfEdgeSelectedColor);
    expect(first.material).toBe(second.material);

    setGltfFatLineEmphasis(first, 'none');
    expect(first.material).toBe(base);
    expect(first.renderOrder).toBe(viewportRenderTiers.model);
    expect(collectGltfFatLineMaterials(first)).toHaveLength(3);
  });

  it('keeps theme colour on the base material and fans resolution out to the overlays', () => {
    const { scene, lines } = makeScene();
    const [first] = lines as [LineSegments2];
    const base = first.material;
    expect(colorOf(base)).toBe(gltfEdgeColorLightMode);

    setGltfFatLineEmphasis(first, 'hover');
    updateGltfEdgeColor(scene, gltfEdgeColorDarkMode);
    expect(colorOf(base)).toBe(gltfEdgeColorDarkMode);
    expect(colorOf(first.material)).toBe(gltfEdgeHoverColor);

    updateLineMaterialResolution(scene, new Vector2(1920, 1080));
    for (const material of collectGltfFatLineMaterials(first)) {
      expect((material as { resolution: Vector2 }).resolution.x).toBe(1920);
    }
  });
});
