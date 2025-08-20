/* eslint-disable new-cap -- External library uses PascalCase method names */
import type { Object3D } from 'three';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import occtimportjs from 'occt-import-js';
import type { ImportResult } from 'occt-import-js';
import type { InputFormat, InputFile } from '#types.js';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

type OcctOptions = {
  format: InputFormat;
};

export class OcctLoader extends ThreeJsBaseLoader<ImportResult, OcctOptions> {
  protected async parseAsync(files: InputFile[], options: OcctOptions): Promise<ImportResult> {
    const { data } = this.findPrimaryFile(files);
    // Configure the module to suppress console output
    const moduleConfig = {
      // Suppress console.log output from the WASM module
      print() {
        // Suppress stdout
      },
      printErr() {
        // Suppress stderr
      },
    };

    // Initialize OCCT with the custom module configuration
    const occt = await occtimportjs(moduleConfig);

    // Choose the appropriate method based on the file format
    let result: ImportResult;

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

  protected mapToObject(parseResult: ImportResult, _options: OcctOptions): Object3D {
    if (!parseResult.success) {
      throw new Error('Failed to parse OCCT file');
    }

    const group = new Group();
    group.name = parseResult.root.name;

    // Create meshes from the result
    for (const meshData of parseResult.meshes) {
      const geometry = new BufferGeometry();

      // Set position attributes
      const positions = new Float32Array(meshData.attributes.position.array);
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

      // Set normal attributes if available
      if (meshData.attributes.normal) {
        const normals = new Float32Array(meshData.attributes.normal.array);
        geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
      }

      // Set indices
      const indices = new Uint32Array(meshData.index.array);
      geometry.setIndex([...indices]);

      // Create material with color if available
      const material = new MeshStandardMaterial();
      if (meshData.color) {
        const [red, green, blue] = meshData.color;
        material.color.setRGB(red, green, blue);
      }

      const mesh = new Mesh(geometry, material);
      mesh.name = meshData.name;
      group.add(mesh);
    }

    return group;
  }
}
