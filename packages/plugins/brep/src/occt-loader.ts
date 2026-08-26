/* oxlint-disable new-cap -- External library uses PascalCase method names */
/* eslint-disable @typescript-eslint/naming-convention -- OCCT's WASM API uses PascalCase methods. */
import { Document, NodeIO } from '@gltf-transform/core';
import { cadMaterialDefaults } from '@taucad/runtime/types';
import { createReverseCoordinateTransform, ImportLoader } from '@taucad/geometry-core';
import type { ImportFile } from '@taucad/geometry-core';

type OcctOptions = {
  format: string;
};

/** @internal */
export type OcctImportResult = {
  success: boolean;
  root: { name: string };
  meshes: Array<{
    name: string;
    color?: [number, number, number];
    attributes: { position: { array: number[] }; normal?: { array: number[] } };
    index: { array: number[] };
  }>;
};

/** @internal */
export type OcctImportJs = {
  ReadBrepFile(content: Uint8Array<ArrayBuffer>, parameters: undefined): OcctImportResult;
  ReadStepFile(content: Uint8Array<ArrayBuffer>, parameters: undefined): OcctImportResult;
  ReadIgesFile(content: Uint8Array<ArrayBuffer>, parameters: undefined): OcctImportResult;
};

/**
 * Loader for OCCT-based CAD formats (STEP, IGES, BREP) using occt-import-js.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- ensuring future API changes are picked up automatically
export class OcctLoader extends ImportLoader<OcctImportResult, OcctOptions> {
  private readonly occt: OcctImportJs;
  private readonly io = new NodeIO();

  public constructor(occt: OcctImportJs) {
    super();
    this.occt = occt;
  }

  protected async parse(files: readonly ImportFile[], options: OcctOptions): Promise<OcctImportResult> {
    const { bytes } = this.findPrimaryFile(files);

    // Choose the appropriate method based on the file format
    let result: OcctImportResult;

    switch (options.format) {
      case 'step':
      case 'stp': {
        result = this.occt.ReadStepFile(bytes, undefined);
        break;
      }

      case 'iges':
      case 'igs': {
        result = this.occt.ReadIgesFile(bytes, undefined);
        break;
      }

      case 'brep': {
        result = this.occt.ReadBrepFile(bytes, undefined);
        break;
      }

      default: {
        throw new Error(`Unsupported format: ${options.format}`);
      }
    }

    return result;
  }

  protected async mapToGlb(parseResult: OcctImportResult): Promise<Uint8Array<ArrayBuffer>> {
    if (!parseResult.success) {
      throw new Error('Failed to parse OCCT file');
    }

    // Create new glTF document using gltf-transform
    const document = new Document();
    const scene = document.createScene();
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- External WASM values can violate their declaration.
    const rootName = (parseResult.root.name ?? '').trim();
    if (rootName) {
      scene.setName(rootName);
    }
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

      // Create material with color if specified, or fallback default
      if (meshData.color) {
        const [red, green, blue] = meshData.color;
        const material = document
          .createMaterial()
          .setBaseColorFactor([red, green, blue, 1])
          .setRoughnessFactor(cadMaterialDefaults.roughnessFactor)
          .setMetallicFactor(cadMaterialDefaults.metalnessFactor)
          .setDoubleSided(true);
        primitive.setMaterial(material);
      } else {
        const material = document
          .createMaterial()
          .setBaseColorFactor([...cadMaterialDefaults.baseColorFactor])
          .setRoughnessFactor(cadMaterialDefaults.roughnessFactor)
          .setMetallicFactor(cadMaterialDefaults.metalnessFactor)
          .setDoubleSided(true);
        primitive.setMaterial(material);
      }

      // Create mesh and node
      const mesh = document.createMesh().addPrimitive(primitive);
      if (meshData.name) {
        mesh.setName(meshData.name);
      }

      const node = document.createNode().setMesh(mesh);
      if (meshData.name) {
        node.setName(meshData.name);
      }

      scene.addChild(node);
    }

    await document.transform(createReverseCoordinateTransform());

    const glb = await this.io.writeBinary(document);
    return glb;
  }
}
