import type { BufferGeometry } from 'three';
import { Mesh, MeshStandardMaterial } from 'three';
import { VTKLoader } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import type { InputFile } from '#types.js';
import { GltfExporter } from '#exporters/gltf.exporter.js';

export class VtkLoader extends ThreeJsBaseLoader<BufferGeometry> {
  private readonly loader = new VTKLoader();
  private readonly gltfExporter = new GltfExporter();

  protected async parseAsync(files: InputFile[]): Promise<BufferGeometry> {
    const { data } = this.findPrimaryFile(files);
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer, ''));
  }

  protected async mapToGlb(parseResult: BufferGeometry): Promise<Uint8Array> {
    const material = new MeshStandardMaterial();
    const mesh = new Mesh(parseResult, material);

    // Generate GLB from the created Object3D using our GltfExporter
    return this.gltfExporter.exportObject3DToGlb(mesh);
  }
}
