/* eslint-disable new-cap -- External library uses PascalCase method names */
import { Document, NodeIO } from '@gltf-transform/core';
import occtimportjs from 'occt-import-js';
import type { ImportResult as OcctImportResult } from 'occt-import-js';
import type { InputFormat, File } from '#types.js';
import { BaseLoader } from '#loaders/base.loader.js';

type OcctOptions = {
  format: InputFormat;
};

export class OcctLoader extends BaseLoader<OcctImportResult, OcctOptions> {
  private readonly io = new NodeIO();

  protected async parseAsync(files: File[], options: OcctOptions): Promise<OcctImportResult> {
    const { data } = this.findPrimaryFile(files);

    const occt = await occtimportjs({
      print() {
        // Suppress stdout
      },
      printErr() {
        // Suppress stderr
      },
      locateFile() {
        // Universal pattern for browsers and bundlers
        // @see https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers
        const wasmPath = new URL('../assets/occt-import-js/occt-import-js.wasm', import.meta.url).href;

        return wasmPath;
      },
    });

    // Choose the appropriate method based on the file format
    let result: OcctImportResult;

    switch (options.format) {
      case 'step':
      case 'stp': {
        result = occt.ReadStepFile(data, undefined);
        break;
      }

      case 'iges':
      case 'igs': {
        result = occt.ReadIgesFile(data, undefined);
        break;
      }

      case 'brep': {
        result = occt.ReadBrepFile(data, undefined);
        break;
      }

      default: {
        throw new Error(`Unsupported format: ${options.format as string}`);
      }
    }

    return result;
  }

  protected async mapToGlb(parseResult: OcctImportResult, _options: OcctOptions): Promise<Uint8Array> {
    if (!parseResult.success) {
      throw new Error('Failed to parse OCCT file');
    }

    // Create new glTF document using gltf-transform
    const document = new Document();
    const scene = document.createScene(parseResult.root.name || 'Scene');
    const buffer = document.createBuffer();

    // Process each mesh from the OCCT result
    for (const meshData of parseResult.meshes) {
      // Prepare geometry data
      const positions = new Float32Array(meshData.attributes.position.array);
      const normals = meshData.attributes.normal ? new Float32Array(meshData.attributes.normal.array) : undefined;
      const indices = new Uint32Array(meshData.index.array);

      // Create accessors for position, normal, and index data
      const positionAccessor = document.createAccessor().setArray(positions).setType('VEC3').setBuffer(buffer);

      const indexAccessor = document.createAccessor().setArray(indices).setType('SCALAR').setBuffer(buffer);

      // Create primitive with position and index
      const primitive = document.createPrimitive().setIndices(indexAccessor).setAttribute('POSITION', positionAccessor);

      // Add normals if available
      if (normals) {
        const normalAccessor = document.createAccessor().setArray(normals).setType('VEC3').setBuffer(buffer);
        primitive.setAttribute('NORMAL', normalAccessor);
      }

      // Create material with color if specified
      if (meshData.color) {
        const [red, green, blue] = meshData.color;
        const material = document
          .createMaterial()
          .setBaseColorFactor([red, green, blue, 1])
          .setName(`Material_${meshData.name || 'Default'}`);
        primitive.setMaterial(material);
      }

      // Create mesh and node
      const mesh = document.createMesh().addPrimitive(primitive);
      if (meshData.name) {
        mesh.setName(meshData.name);
      }

      const node = document
        .createNode()
        .setMesh(mesh)
        .setName(meshData.name || 'Mesh');

      scene.addChild(node);
    }

    // Export to GLB binary format
    return this.io.writeBinary(document);
  }
}
