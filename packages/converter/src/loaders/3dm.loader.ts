import type { Group } from 'three';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import type { InputFile } from '#types.js';
import { Three3dmLoader } from '#loaders/3dm/3dm-three-loader.js';
import { GltfExporter } from '#exporters/gltf.exporter.js';

/**
 * Loader for 3dm files for isomorphic environments.
 */
export class ThreeDmLoader extends ThreeJsBaseLoader<Group> {
  private readonly loader = new Three3dmLoader();
  private readonly gltfExporter = new GltfExporter();

  protected async parseAsync(files: InputFile[]): Promise<Group> {
    const { data } = this.findPrimaryFile(files);
    return this.loader.parseAsync(data);
  }

  protected async mapToGlb(parseResult: Group): Promise<Uint8Array> {
    // Generate GLB from the created Object3D using our GltfExporter
    return this.gltfExporter.exportObject3DToGlb(parseResult);
  }
}
