import type { Object3D } from 'three';
import type { Collada } from 'three/addons';
import { KMZLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class KmzLoader extends ThreeJsBaseLoader<Collada> {
  private readonly loader = new KMZLoader();

  protected async parseAsync(data: Uint8Array): Promise<Collada> {
    const arrayBuffer = this.toArrayBuffer(data);

    return this.withPromise(() => this.loader.parse(arrayBuffer));
  }

  protected mapToObject(parseResult: Collada): Object3D {
    return parseResult.scene;
  }
}
