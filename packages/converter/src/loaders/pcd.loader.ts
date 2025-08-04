import type { Object3D, Points } from 'three';
import { PCDLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class PcdLoader extends ThreeJsBaseLoader<Points> {
  private readonly loader = new PCDLoader();

  protected async parseAsync(data: Uint8Array): Promise<Points> {
    const arrayBuffer = this.toArrayBuffer(data);

    return this.withPromise(() => this.loader.parse(arrayBuffer));
  }

  protected mapToObject(parseResult: Points): Object3D {
    return parseResult;
  }
}
