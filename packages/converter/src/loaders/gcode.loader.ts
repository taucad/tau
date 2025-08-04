import type { Group, Object3D } from 'three';
import { GCodeLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class GcodeLoader extends ThreeJsBaseLoader<Group> {
  private readonly loader = new GCodeLoader();

  protected async parseAsync(data: Uint8Array): Promise<Group> {
    const text = this.uint8ArrayToText(data);
    return this.withPromise(() => this.loader.parse(text));
  }

  protected mapToObject(parseResult: Group): Object3D {
    return parseResult;
  }
}
