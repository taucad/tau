import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import { NodeDracoLoader } from '#loaders/draco/node-draco-loader.js';

export class GltfLoader extends ThreeJsBaseLoader<GLTF> {
  private readonly loader = new GLTFLoader();
  private readonly dracoLoader = new NodeDracoLoader();

  public constructor() {
    super();
  }

  protected async parseAsync(data: Uint8Array): Promise<GLTF> {
    // Set the decoder path for DRACO - this may need to be configurable
    await this.dracoLoader.initialize();
    this.loader.setDRACOLoader(this.dracoLoader);

    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.loader.parseAsync(arrayBuffer, '');
  }

  protected mapToObject(parseResult: GLTF): Object3D {
    return parseResult.scene;
  }
}
