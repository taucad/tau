import type { Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons';
import { Matrix4 } from 'three';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import type { BaseLoaderOptions } from '#loaders/threejs.base.loader.js';
import { NodeDracoLoader } from '#loaders/draco/node-draco-loader.js';

type GltfLoaderOptions = {
  transformYUpToZUp?: boolean;
} & BaseLoaderOptions;

export class GltfLoader extends ThreeJsBaseLoader<GLTF, GltfLoaderOptions> {
  private readonly loader = new GLTFLoader();
  private readonly dracoLoader = new NodeDracoLoader();

  /**
   * Create a transformation matrix to convert from y-up (glTF format) to z-up (app coordinate system)
   * and scale from meters back to millimeters.
   *
   * Y-up to Z-up transformation: x' = x, y' = -z, z' = y
   * Unit conversion: meters to millimeters (multiply by 1000)
   */
  private readonly transformationMatrix = new Matrix4().set(1000, 0, 0, 0, 0, 0, -1000, 0, 0, 1000, 0, 0, 0, 0, 0, 1);

  protected async parseAsync(data: Uint8Array): Promise<GLTF> {
    await this.dracoLoader.initialize();
    this.loader.setDRACOLoader(this.dracoLoader);

    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.loader.parseAsync(arrayBuffer, '');
  }

  protected mapToObject(parseResult: GLTF): Object3D {
    if (this.options.transformYUpToZUp ?? true) {
      // Apply transformation to all geometries in the scene
      parseResult.scene.traverse((child) => {
        if (child.type === 'Mesh') {
          const mesh = child as Mesh;
          mesh.geometry.applyMatrix4(this.transformationMatrix);
        }
      });
    }

    return parseResult.scene;
  }
}
