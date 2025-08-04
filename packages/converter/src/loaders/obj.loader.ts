import type { Group, Object3D } from 'three';
import { OBJLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

// eslint-disable-next-line unicorn/prevent-abbreviations -- OBJ is a valid name
export class ObjLoader extends ThreeJsBaseLoader<Group> {
  private readonly loader = new OBJLoader();

  protected async parseAsync(data: Uint8Array): Promise<Group> {
    const arrayBuffer = this.toArrayBuffer(data);
    const text = new TextDecoder().decode(arrayBuffer);

    return this.withPromise(() => this.loader.parse(text));
  }

  protected mapToObject(parseResult: Group): Object3D {
    return parseResult;
  }
}
