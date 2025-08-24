import { Group } from 'three';
import { VOXLoader, VOXMesh } from 'three/addons';
import type { Chunk } from 'three/addons';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import type { InputFile } from '#types.js';
import { GltfExporter } from '#exporters/gltf.exporter.js';

type VoxChunk = Chunk; // VOX chunk type from the loader

export class VoxLoader extends ThreeJsBaseLoader<VoxChunk[]> {
  private readonly loader = new VOXLoader();
  private readonly gltfExporter = new GltfExporter();

  protected async parseAsync(files: InputFile[]): Promise<VoxChunk[]> {
    const { data } = this.findPrimaryFile(files);
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return this.withPromise(() => this.loader.parse(arrayBuffer) as VoxChunk[]);
  }

  protected async mapToGlb(parseResult: VoxChunk[]): Promise<Uint8Array> {
    const group = new Group();

    for (const chunk of parseResult) {
      const mesh = new VOXMesh(chunk);
      group.add(mesh);
    }

    // Generate GLB from the created Object3D using our GltfExporter
    return this.gltfExporter.exportObject3DToGlb(group);
  }
}
