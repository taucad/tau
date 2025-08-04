import type { BufferGeometry, Object3D } from 'three';
import { Mesh, MeshStandardMaterial } from 'three';
import { VTKLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class VtkLoader extends ThreeJsBaseLoader<BufferGeometry> {
  private readonly loader = new VTKLoader();

  protected async parseAsync(data: Uint8Array): Promise<BufferGeometry> {
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer, ''));
  }

  protected mapToObject(parseResult: BufferGeometry): Object3D {
    const material = new MeshStandardMaterial();
    const mesh = new Mesh(parseResult, material);
    return mesh;
  }
}
