import type { Object3D } from 'three';
// @ts-expect-error -- three types are behind.
import { USDLoader } from 'three/addons';
import type { USDZLoader as USDZLoaderType } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class UsdzLoader extends ThreeJsBaseLoader<Object3D> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- three types are behind.
  private readonly loader = new USDLoader() as USDZLoaderType;

  protected async parseAsync(data: Uint8Array): Promise<Object3D> {
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer));
  }

  protected mapToObject(parseResult: Object3D): Object3D {
    return parseResult;
  }
}
