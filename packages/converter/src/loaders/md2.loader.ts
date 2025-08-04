import type { BufferGeometry, Object3D } from 'three';
import { Mesh, MeshStandardMaterial, AnimationMixer } from 'three';
import { MD2Loader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class Md2Loader extends ThreeJsBaseLoader<BufferGeometry> {
  private readonly loader = new MD2Loader();

  protected async parseAsync(data: Uint8Array): Promise<BufferGeometry> {
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer));
  }

  protected mapToObject(parseResult: BufferGeometry): Object3D {
    const material = new MeshStandardMaterial();
    const mesh = new Mesh(parseResult, material);

    // Add animation mixer for MD2 models
    // @ts-expect-error - mixer is not typed
    mesh.mixer = new AnimationMixer(mesh);

    // Copy animations from geometry to mesh
    // @ts-expect-error - animations is not typed
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- animations is not typed
    mesh.animations.push(...parseResult.animations);

    return mesh;
  }
}
