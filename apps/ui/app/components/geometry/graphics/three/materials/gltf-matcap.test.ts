import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  Scene,
  Texture,
  TextureLoader,
} from 'three';
import { applyMatcap } from '#components/geometry/graphics/three/materials/gltf-matcap.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function createTriangleGeometry({ vertexColors = false }: { readonly vertexColors?: boolean } = {}): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));

  if (vertexColors) {
    geometry.setAttribute('color', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3));
  }

  return geometry;
}

function getMatcapMaterial(mesh: Mesh): MeshMatcapMaterial {
  if (Array.isArray(mesh.material) || !(mesh.material instanceof MeshMatcapMaterial)) {
    throw new Error('Expected mesh material to be a MeshMatcapMaterial');
  }

  return mesh.material;
}

describe('applyMatcap', () => {
  it('should disable depth writes when replacing a translucent source material', async () => {
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
    const sourceMaterial = new MeshBasicMaterial({ color: 0xaa_55_22, opacity: 0.4, transparent: true });
    const mesh = new Mesh(createTriangleGeometry(), sourceMaterial);
    const scene = new Scene();
    scene.add(mesh);

    await applyMatcap({ scene });

    const material = getMatcapMaterial(mesh);
    expect(material.color.getHex()).toBe(0xaa_55_22);
    expect(material.opacity).toBe(0.4);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('should preserve translucent render state for vertex-colored matcap replacements', async () => {
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
    const sourceMaterial = new MeshBasicMaterial({ opacity: 0.35, transparent: true });
    const mesh = new Mesh(createTriangleGeometry({ vertexColors: true }), sourceMaterial);
    const scene = new Scene();
    scene.add(mesh);

    await applyMatcap({ scene });

    const material = getMatcapMaterial(mesh);
    expect(material.vertexColors).toBe(true);
    expect(material.opacity).toBe(0.35);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });
});
