import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { unpartition } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { createCoordinateTransform, createScalingTransform } from '#gltf.transforms.js';
import { BaseLoader } from '#loaders/base.loader.js';
import type { BaseLoaderOptions } from '#loaders/base.loader.js';
import type { File } from '#types.js';
import { allExtensions } from '#gltf.extensions.js';

type GltfLoaderOptions = {
  transformYtoZup?: boolean;
  scaleMetersToMillimeters?: boolean;
} & BaseLoaderOptions;

export class GltfLoader extends BaseLoader<Uint8Array, GltfLoaderOptions> {
  protected async parseAsync(files: File[]): Promise<Uint8Array> {
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

      // Extract URIs referenced in the GLTF file
      const referencedUris = this.extractReferencedUris(json);

      // Build resources map by matching referenced URIs to provided files
      const resources: Record<string, Uint8Array> = {};
      for (const uri of referencedUris) {
        const matchedFile = this.findFileByUri(uri, files, name);
        if (matchedFile) {
          resources[uri] = matchedFile.data;
        }
      }

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

  /**
   * Extract all URIs referenced in a GLTF JSON file
   * Looks for URIs in buffers and images
   */
  private extractReferencedUris(json: unknown): string[] {
    const uris: string[] = [];

    if (typeof json !== 'object' || json === null) {
      return uris;
    }

    const gltfJson = json as Record<string, unknown>;

    // Extract buffer URIs
    if (Array.isArray(gltfJson['buffers'])) {
      for (const buffer of gltfJson['buffers']) {
        if (
          typeof buffer === 'object' &&
          buffer !== null &&
          'uri' in buffer &&
          typeof buffer.uri === 'string' &&
          !buffer.uri.startsWith('data:') // Skip data URIs
        ) {
          uris.push(buffer.uri);
        }
      }
    }

    // Extract image URIs
    if (Array.isArray(gltfJson['images'])) {
      for (const image of gltfJson['images']) {
        if (
          typeof image === 'object' &&
          image !== null &&
          'uri' in image &&
          typeof image.uri === 'string' &&
          !image.uri.startsWith('data:') // Skip data URIs
        ) {
          uris.push(image.uri);
        }
      }
    }

    return uris;
  }

  /**
   * Find a file that matches the given URI
   * Tries exact match first, then basename match
   */
  private findFileByUri(uri: string, files: File[], primaryFileName: string): File | undefined {
    // Normalize URI by removing leading ./
    const normalizedUri = uri.replace(/^\.\//, '');

    // Get basename from URI (everything after last slash)
    const uriBasename = normalizedUri.split('/').pop() ?? normalizedUri;

    for (const file of files) {
      // Skip the primary GLTF file
      if (file.name === primaryFileName) {
        continue;
      }

      // Try exact match first
      if (file.name === normalizedUri) {
        return file;
      }

      // Try basename match (case-sensitive)
      if (file.name === uriBasename) {
        return file;
      }

      // Try case-insensitive basename match as fallback
      if (file.name.toLowerCase() === uriBasename.toLowerCase()) {
        return file;
      }
    }

    return undefined;
  }
}
