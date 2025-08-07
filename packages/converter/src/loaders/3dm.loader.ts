import type { Object3D, Group } from 'three';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import { Three3dmLoader } from '#loaders/3dm/3dm-three-loader.js';

/**
 * Loader for 3dm files for isomorphic environments.
 */
export class ThreeDmLoader extends ThreeJsBaseLoader<Group> {
  private readonly loader = new Three3dmLoader();

  protected async parseAsync(data: Uint8Array): Promise<Group> {
    return this.loader.parseAsync(data);
  }

  protected mapToObject(parseResult: Group): Object3D {
    return parseResult;
  }
}
