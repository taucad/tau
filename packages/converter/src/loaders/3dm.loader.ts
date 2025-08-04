import type { Object3D } from 'three';
import { Rhino3dmLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class ThreeDmLoader extends ThreeJsBaseLoader<Object3D> {
  private readonly loader = new Rhino3dmLoader();

  public constructor() {
    super();
    // Set the library path for Rhino3dm - this may need to be configurable
    this.loader.setLibraryPath('../assets/rhino3dm');
  }

  protected async parseAsync(data: Uint8Array): Promise<Object3D> {
    const arrayBuffer = this.toArrayBuffer(data);

    return new Promise((resolve) => {
      this.loader.parse(arrayBuffer, (object: Object3D) => {
        resolve(object);
      });
    });
  }

  protected mapToObject(parseResult: Object3D): Object3D {
    return parseResult;
  }
}
