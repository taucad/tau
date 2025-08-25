import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { unpartition } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { createCoordinateTransform, createScalingTransform } from '#gltf.transforms.js';
import { BaseLoader } from '#loaders/base.loader.js';
import type { BaseLoaderOptions } from '#loaders/base.loader.js';
import type { InputFile } from '#types.js';
import { allExtensions } from '#gltf.extensions.js';

type GltfLoaderOptions = {
  transformYtoZup?: boolean;
  scaleMetersToMillimeters?: boolean;
} & BaseLoaderOptions;

export class GltfLoader extends BaseLoader<Uint8Array, GltfLoaderOptions> {
  protected async parseAsync(files: InputFile[]): Promise<Uint8Array> {
    const io = new NodeIO().registerExtensions(allExtensions).registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
    const { data, name } = this.findPrimaryFile(files);

    // Determine if this is a GLTF (JSON) or GLB (binary) file
    const isGltf = name.toLowerCase().endsWith('.gltf');
    let document: Document;

    if (isGltf) {
      // For GLTF files, convert to text and use readJSON
      const jsonText = new TextDecoder().decode(data);
      const json = JSON.parse(jsonText);
      
      // Build resources map from additional files (e.g., .bin files)
      const resources: Record<string, Uint8Array> = {};
      files.forEach((file) => {
        if (file.name !== name) {
          // Add other files as resources using their filename as the URI
          // gltf-transform expects Uint8Array, not ArrayBuffer
          resources[file.name] = file.data;
        }
      });
      
      document = await io.readJSON({ json, resources });
    } else {
      // For GLB files, use readBinary
      document = await io.readBinary(data);
    }

    // Apply transformations
    await document.transform(
      unpartition(), // Consolidate buffers and embed binaries
      createCoordinateTransform(this.options.transformYtoZup ?? true),
      createScalingTransform(this.options.scaleMetersToMillimeters ?? true),
    );

    // Export the transformed document back to GLB
    const transformedGlb = await io.writeBinary(document);
    return new Uint8Array(transformedGlb);
  }

  protected mapToGlb(parseResult: Uint8Array): Uint8Array {
    return parseResult;
  }
}
