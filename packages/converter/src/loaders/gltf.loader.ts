import type { Object3D } from 'three';
import { DRACOLoader, GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class GltfLoader extends ThreeJsBaseLoader<GLTF> {
  private readonly loader = new GLTFLoader();
  private readonly dracoLoader = new DRACOLoader();

  public constructor() {
    super();
    // Set the decoder path for DRACO - this may need to be configurable
    this.dracoLoader.setDecoderPath('/Users/rifont/git/tau/packages/converter/src/assets/draco3d/');
    this.loader.setDRACOLoader(this.dracoLoader);
  }

  protected async parseAsync(data: Uint8Array): Promise<GLTF> {
    const arrayBuffer = this.toArrayBuffer(data);

    return this.loader.parseAsync(arrayBuffer, '');
  }

  protected mapToObject(parseResult: GLTF): Object3D {
    return parseResult.scene;
  }
}
