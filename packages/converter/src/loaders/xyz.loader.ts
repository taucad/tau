import type { BufferGeometry, Object3D } from 'three';
import { Points, PointsMaterial } from 'three';
import { XYZLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

export class XyzLoader extends ThreeJsBaseLoader<BufferGeometry> {
  private readonly loader = new XYZLoader();

  protected async parseAsync(data: Uint8Array): Promise<BufferGeometry> {
    const text = this.uint8ArrayToText(data);
    return this.withPromise(
      () =>
        this.loader.parse(text, () => {
          // No-op, load data is handled in function result.
        }) as BufferGeometry,
    );
  }

  protected mapToObject(parseResult: BufferGeometry): Object3D {
    const material = new PointsMaterial();
    material.vertexColors = parseResult.hasAttribute('color');
    const points = new Points(parseResult, material);
    return points;
  }
}
