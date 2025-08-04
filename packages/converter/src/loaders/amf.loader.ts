import type { Group, Object3D } from 'three';
import { AMFLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class AmfLoader extends ThreeJsBaseLoader<Group> {
  private readonly loader = new AMFLoader();

  protected async parseAsync(data: Uint8Array): Promise<Group> {
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer));
  }

  protected mapToObject(parseResult: Group): Object3D {
    return parseResult;
  }
}
