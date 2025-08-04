import type { Object3D } from 'three';
import type { Collada } from 'three/addons';
import { ColladaLoader as ColladaLoaderThreeJs } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class ColladaLoader extends ThreeJsBaseLoader<Collada> {
  private readonly loader = new ColladaLoaderThreeJs();

  protected async parseAsync(data: Uint8Array): Promise<Collada> {
    const text = this.uint8ArrayToText(data);
    return this.withPromise(() => this.loader.parse(text, ''));
  }

  protected mapToObject(parseResult: Collada): Object3D {
    return parseResult.scene;
  }
}
