/* eslint-disable @typescript-eslint/naming-convention -- some formats are named like this */
/* eslint-disable new-cap -- External library uses PascalCase method names */
import type { Object3D } from 'three';
import assimpjs from 'assimpjs/all';
import type { InputFormat, InputFile } from '#types.js';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import { GltfLoader } from '#loaders/gltf.loader.js';

type AssimpOptions = {
  format: InputFormat;
};

export class AssimpLoader extends ThreeJsBaseLoader<Object3D, AssimpOptions> {
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

  /**
   * @description Whether the format requires scaling from meters to millimeters.
   */
  private static readonly scaleMetersToMillimetersRequired: Partial<Record<InputFormat, boolean>> = {
    dae: true,
  };

  private readonly gltfLoader = new GltfLoader();

  protected async parseAsync(files: InputFile[], options: AssimpOptions): Promise<Object3D> {
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

    // Get the GLB data
    const resultFile = result.GetFile(0);

    const glbData = resultFile.GetContent();

    const transformYtoZup = this.getTransformYtoZup(options.format);
    const scaleMetersToMillimeters = this.getScaleMetersToMillimeters(options.format);

    // Initialize and use the GLTF loader to convert GLB data to Three.js Object3D
    this.gltfLoader.initialize({ format: 'glb', transformYtoZup, scaleMetersToMillimeters });
    return this.gltfLoader.loadAsync([{ name: 'converted.glb', data: glbData }]);
  }

  protected mapToObject(parseResult: Object3D): Object3D {
    return parseResult;
  }

  private getTransformYtoZup(format: InputFormat): boolean {
    return AssimpLoader.transformYtoZupRequired[format] ?? false;
  }

  private getScaleMetersToMillimeters(format: InputFormat): boolean {
    return AssimpLoader.scaleMetersToMillimetersRequired[format] ?? false;
  }
}
