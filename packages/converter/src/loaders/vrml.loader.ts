import type { Object3D, Scene } from 'three';
import { VRMLLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class VrmlLoader extends ThreeJsBaseLoader<Scene> {
  private readonly loader = new VRMLLoader();

  protected async parseAsync(data: Uint8Array): Promise<Scene> {
    const text = this.uint8ArrayToText(data);
    return this.withPromise(() => this.loader.parse(text, ''));
  }

  protected mapToObject(parseResult: Scene): Object3D {
    return parseResult;
  }
}
