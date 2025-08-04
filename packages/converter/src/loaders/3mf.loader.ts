import type { Group, Object3D } from 'three';
import { ThreeMFLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class ThreeMfLoader extends ThreeJsBaseLoader<Group> {
  private readonly loader = new ThreeMFLoader();

  protected async parseAsync(data: Uint8Array): Promise<Group> {
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer));
  }

  protected mapToObject(parseResult: Group): Object3D {
    return parseResult;
  }
}
