import type { Document } from '@gltf-transform/core';
import { BaseLoader, type BaseLoaderOptions } from '#loaders/base.loader.js';
import type { File } from '#types.js';
import { GltfDracoDecoder } from '#loaders/draco/gltf-draco-decoder.js';
import { createNodeIO } from '#gltf.utils.js';
import { createCoordinateTransform, createScalingTransform } from '#gltf.transforms.js';

type DracoLoaderOptions = {
  transformYtoZup?: boolean;
  scaleMetersToMillimeters?: boolean;
} & BaseLoaderOptions;

export class DracoLoader extends BaseLoader<Document, DracoLoaderOptions> {
  private readonly decoder = new GltfDracoDecoder();

  protected async parseAsync(files: File[], _options: DracoLoaderOptions): Promise<Document> {
    await this.decoder.initialize();
    this.decoder.setVerbosity(0);

    const { data } = this.findPrimaryFile(files);
    const arrayBuffer = this.uint8ArrayToArrayBuffer(data);

    try {
      // Decode Draco file to get raw geometry data
      const decodedData = await this.decoder.decodeDracoFile(arrayBuffer);

      // Create glTF Document from decoded data
      const document = await this.decoder.createGltfDocument(decodedData);

      return document;
    } catch (error) {
      throw new Error(`Failed to decode Draco geometry: ${String(error)}`);
    }
  }

  protected async mapToGlb(document: Document, options: DracoLoaderOptions): Promise<Uint8Array> {
    const io = await createNodeIO();

    // For DRC files, transformations are typically not needed by default
    // since they are already in the expected coordinate system and units
    await document.transform(
      createCoordinateTransform(options.transformYtoZup ?? false),
      createScalingTransform(options.scaleMetersToMillimeters ?? false),
    );

    // Export to GLB
    const glb = await io.writeBinary(document);
    return new Uint8Array(glb);
  }
}
