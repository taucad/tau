import type { Object3D } from 'three';
import type { Collada } from 'three/addons';
import { KMZLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import type { InputFile } from '#types.js';

export class KmzLoader extends ThreeJsBaseLoader<Collada> {
  private readonly loader = new KMZLoader();

  protected async parseAsync(files: InputFile[]): Promise<Collada> {
    const { data } = this.findPrimaryFile(files);
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer));
  }

  protected mapToObject(parseResult: Collada): Object3D {
    return parseResult.scene;
  }
}
