import type { BufferGeometry, Object3D } from 'three';
import { Mesh, Points, MeshStandardMaterial, PointsMaterial } from 'three';
import { PLYLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class PlyLoader extends ThreeJsBaseLoader<BufferGeometry> {
  private readonly loader = new PLYLoader();

  protected async parseAsync(data: Uint8Array): Promise<BufferGeometry> {
    const arrayBuffer = this.toArrayBuffer(data);

    return this.withPromise(() => this.loader.parse(arrayBuffer));
  }

  protected mapToObject(parseResult: BufferGeometry): Object3D {
    // Check if geometry has indices (is a mesh) or is a point cloud
    if (parseResult.index !== null) {
      const material = new MeshStandardMaterial();
      const mesh = new Mesh(parseResult, material);
      return mesh;
    }

    const material = new PointsMaterial({ size: 0.01 });
    material.vertexColors = parseResult.hasAttribute('color');
    const points = new Points(parseResult, material);
    return points;
  }
}
