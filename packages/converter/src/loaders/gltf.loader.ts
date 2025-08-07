import type { Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons';
import { Matrix4 } from 'three';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import type { BaseLoaderOptions } from '#loaders/threejs.base.loader.js';
import { NodeDracoLoader } from '#loaders/draco/node-draco-loader.js';

type GltfLoaderOptions = {
  transformYtoZup?: boolean;
  scaleMetersToMillimeters?: boolean;
} & BaseLoaderOptions;

export class GltfLoader extends ThreeJsBaseLoader<GLTF, GltfLoaderOptions> {
  private readonly loader = new GLTFLoader();
  private readonly dracoLoader = new NodeDracoLoader();

  /**
   * Transformation matrix to convert from y-up (glTF format) to z-up (app coordinate system)
   * Y-up to Z-up transformation: x' = x, y' = -z, z' = y
   */
  private readonly coordinateTransformMatrix = new Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

  /**
   * Scaling matrix to convert from meters to millimeters (multiply by 1000)
   */
  private readonly scalingMatrix = new Matrix4().makeScale(1000, 1000, 1000);

  protected async parseAsync(data: Uint8Array): Promise<GLTF> {
    await this.dracoLoader.initialize();
    this.loader.setDRACOLoader(this.dracoLoader);

    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.loader.parseAsync(arrayBuffer, '');
  }

  protected mapToObject(parseResult: GLTF): Object3D {
    // Apply transformations to all geometries in the scene
    parseResult.scene.traverse((child) => {
      if (child.type === 'Mesh') {
        const mesh = child as Mesh;

        // Apply coordinate system transformation (Y-up to Z-up)
        if (this.options.transformYtoZup ?? true) {
          mesh.geometry.applyMatrix4(this.coordinateTransformMatrix);
        }

        // Apply scaling transformation (meters to millimeters)
        if (this.options.scaleMetersToMillimeters ?? true) {
          mesh.geometry.applyMatrix4(this.scalingMatrix);
        }
      }
    });

    return parseResult.scene;
  }
}
