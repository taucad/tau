import type { BufferGeometry, Object3D } from 'three';
import { Mesh, Points, MeshStandardMaterial, PointsMaterial } from 'three';
import { BaseLoader } from '#loaders/base.loader.js';
import type { InputFile } from '#types.js';
import { NodeDracoLoader } from '#loaders/draco/node-draco-loader.js';
import { GltfExporter } from '#exporters/gltf.exporter.js';

export class DracoLoader extends BaseLoader<BufferGeometry> {
  private readonly loader = new NodeDracoLoader();
  private readonly gltfExporter = new GltfExporter();

  public dispose(): void {
    this.loader.dispose();
  }

  protected async parseAsync(files: InputFile[]): Promise<BufferGeometry> {
    await this.loader.initialize();

    const { data } = this.findPrimaryFile(files);
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);
    return new Promise((resolve, reject) => {
      this.loader.parse(
        arrayBuffer,
        (geometry: BufferGeometry) => {
          resolve(geometry);
        },
        (error: unknown) => {
          reject(new Error(`Failed to decode Draco geometry: ${String(error)}`));
        },
      );
    });
  }

  protected async mapToGlb(parseResult: BufferGeometry): Promise<Uint8Array> {
    // Check if geometry has indices (is a mesh) or is a point cloud
    let object3d: Object3D;
    if (parseResult.index === null) {
      const material = new PointsMaterial({ size: 0.01 });
      material.vertexColors = parseResult.hasAttribute('color');
      object3d = new Points(parseResult, material);
    } else {
      const material = new MeshStandardMaterial();
      object3d = new Mesh(parseResult, material);
    }

    // Generate GLB from the created Object3D using our GltfExporter
    return this.gltfExporter.exportObject3DToGlb(object3d);
  }
}
