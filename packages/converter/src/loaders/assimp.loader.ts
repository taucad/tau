/* eslint-disable @typescript-eslint/naming-convention -- some formats are named like this */
/* eslint-disable new-cap -- External library uses PascalCase method names */
import assimpjs from 'assimpjs/all';
import type { InputFormat, InputFile } from '#types.js';
import { applyGlbTransforms } from '#gltf.transforms.js';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

type AssimpOptions = {
  format: InputFormat;
};

export class AssimpLoader extends ThreeJsBaseLoader<Uint8Array, AssimpOptions> {
  /**
   * @description Whether the format requires a Y-to-Z up transformation.
   */
  private static readonly transformYtoZupRequired: Partial<Record<InputFormat, boolean>> = {
    dxf: true,
    x: true,
    dae: true,
    '3ds': true,
    fbx: true,
    usdz: true,
    ifc: true,
    x3d: true,
    obj: true,
    lwo: true,
    ase: true,
  };

  protected async parseAsync(files: InputFile[], options: AssimpOptions): Promise<Uint8Array> {
    // Initialize assimpjs
    const ajs = await assimpjs();

    // Create file list with all input files, preserving original filenames
    const fileList = new ajs.FileList();

    for (const file of files) {
      fileList.AddFile(file.name, file.data);
    }

    // Convert to GLB format using assimpjs
    const result = ajs.ConvertFileList(fileList, 'glb2');

    // Check if conversion succeeded
    if (!result.IsSuccess() || result.FileCount() === 0) {
      throw new Error(`Failed to convert ${options.format} file: ${result.GetErrorCode()}`);
    }

    // Get the GLB data, GLB only supports single file
    const resultFile = result.GetFile(0);
    const glbData = resultFile.GetContent();

    // Apply coordinate transformations for formats that require Y-to-Z up conversion
    const transformYtoZup = this.getTransformYtoZup(options.format);

    if (transformYtoZup) {
      // Apply gltf-transform transformations to the GLB data
      return applyGlbTransforms(glbData, {
        transformYtoZup: true,
        scaleMetersToMillimeters: false,
      });
    }

    return glbData;
  }

  private getTransformYtoZup(format: InputFormat): boolean {
    return AssimpLoader.transformYtoZupRequired[format] ?? false;
  }

  protected mapToGlb(parseResult: Uint8Array): Uint8Array {
    return parseResult;
  }
}
