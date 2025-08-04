import type { Group, Object3D } from 'three';
import { TDSLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class ThreeDsLoader extends ThreeJsBaseLoader<Group> {
  private readonly loader = new TDSLoader();

  protected async parseAsync(data: Uint8Array): Promise<Group> {
    const arrayBuffer = this.toArrayBuffer(data);

    return this.withPromise(() => this.loader.parse(arrayBuffer, ''));
  }

  protected mapToObject(parseResult: Group): Object3D {
    return parseResult;
  }
}
