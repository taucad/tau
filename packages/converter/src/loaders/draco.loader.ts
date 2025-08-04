import type { BufferGeometry, Object3D } from 'three';
import { Mesh, Points, MeshStandardMaterial, PointsMaterial } from 'three';
import { DRACOLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class DracoLoader extends ThreeJsBaseLoader<BufferGeometry> {
  private readonly loader = new DRACOLoader();

  public constructor() {
    super();
    // Set the decoder path for DRACO - this may need to be configurable
    this.loader.setDecoderPath('../assets/draco3d');
  }

  public dispose(): void {
    this.loader.dispose();
  }

  protected async parseAsync(data: Uint8Array): Promise<BufferGeometry> {
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return new Promise((resolve, reject) => {
      this.loader.parse(
        arrayBuffer,
        (geometry: BufferGeometry) => {
          resolve(geometry);
        },
        (error: unknown) => {
          if (error instanceof ErrorEvent) {
            reject(new Error(`Failed to parse DRACO data: ${error.message}`));
          } else {
            reject(new Error(`Failed to parse DRACO data: ${String(error)}`));
          }
        },
      );
    });
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
