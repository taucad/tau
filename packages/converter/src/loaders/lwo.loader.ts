import { Group } from 'three';
import type { Object3D } from 'three';
import type { LWO } from 'three/addons';
import { LWOLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class LwoLoader extends ThreeJsBaseLoader<LWO> {
  private readonly loader = new LWOLoader();

  protected async parseAsync(data: Uint8Array): Promise<LWO> {
    const arrayBuffer = this.toArrayBuffer(data);

    return this.withPromise(() => this.loader.parse(arrayBuffer, '', ''));
  }

  protected mapToObject(parseResult: LWO): Object3D {
    const group = new Group();
    for (const mesh of parseResult.meshes) {
      group.add(mesh);
    }

    return group;
  }
}
