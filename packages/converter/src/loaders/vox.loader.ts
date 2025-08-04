import type { Object3D } from 'three';
import { Group } from 'three';
import { VOXLoader, VOXMesh } from 'three/addons';
import type { Chunk } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

type VoxChunk = Chunk; // VOX chunk type from the loader

export class VoxLoader extends ThreeJsBaseLoader<VoxChunk[]> {
  private readonly loader = new VOXLoader();

  protected async parseAsync(data: Uint8Array): Promise<VoxChunk[]> {
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer) as VoxChunk[]);
  }

  protected mapToObject(parseResult: VoxChunk[]): Object3D {
    const group = new Group();

    for (const chunk of parseResult) {
      const mesh = new VOXMesh(chunk);
      group.add(mesh);
    }

    return group;
  }
}
