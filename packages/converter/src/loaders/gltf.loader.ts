import type { Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons';
import { Matrix4 } from 'three';
import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { unpartition } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { createCoordinateTransform, createScalingTransform } from '#gltf.transforms.js';
import { BaseLoader } from '#loaders/base.loader.js';
import type { BaseLoaderOptions } from '#loaders/base.loader.js';
import type { InputFile } from '#types.js';
import { NodeDracoLoader } from '#loaders/draco/node-draco-loader.js';

type GltfLoaderOptions = {
  transformYtoZup?: boolean;
  scaleMetersToMillimeters?: boolean;
} & BaseLoaderOptions;

export class GltfLoader extends BaseLoader<Uint8Array, GltfLoaderOptions> {
  private readonly loader = new GLTFLoader();
  private readonly dracoLoader = new NodeDracoLoader();

  /**
   * Transformation matrix to convert from y-up (glTF format) to z-up (app coordinate system)
   * Y-up to Z-up transformation: x' = x, y' = -z, z' = y
   */
  private readonly coordinateTransformMatrix = new Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

  /**
   * Scaling matrix to convert from meters to millimeters (multiply by 1000)
   */
  private readonly scalingMatrix = new Matrix4().makeScale(1000, 1000, 1000);

  protected async parseAsync(files: InputFile[]): Promise<Uint8Array> {
    const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).registerDependencies({
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

  /**
   * Load GLB data and return Object3D with transformations applied.
   * This method is used by other loaders that need to apply transformations.
   */
  public async loadAsObject3D(
    glbData: Uint8Array,
    options?: { transformYtoZup?: boolean; scaleMetersToMillimeters?: boolean },
  ): Promise<Object3D> {
    await this.dracoLoader.initialize();
    this.loader.setDRACOLoader(this.dracoLoader);

    const arrayBuffer = this.uint8ArrayToArrayBuffer(glbData);
    const gltf = await this.loader.parseAsync(arrayBuffer, '');

    // Apply transformations to all geometries in the scene
    gltf.scene.traverse((child) => {
      if (child.type === 'Mesh') {
        const mesh = child as Mesh;

        // Apply coordinate system transformation (Y-up to Z-up)
        if (options?.transformYtoZup ?? this.options.transformYtoZup ?? true) {
          mesh.geometry.applyMatrix4(this.coordinateTransformMatrix);
        }

        // Apply scaling transformation (meters to millimeters)
        if (options?.scaleMetersToMillimeters ?? this.options.scaleMetersToMillimeters ?? true) {
          mesh.geometry.applyMatrix4(this.scalingMatrix);
        }
      }
    });

    return gltf.scene;
  }
}
