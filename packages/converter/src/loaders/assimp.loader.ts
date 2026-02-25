/* eslint-disable @typescript-eslint/naming-convention -- some formats are named like this */
/* eslint-disable new-cap -- External library uses PascalCase method names */
import assimpjs from 'assimpjs/all';
import type { AssimpResult } from 'assimpjs/all';
import type { FileExtension, FileInput } from '@taucad/types';
import { normalizeGlbToYup } from '#gltf.transforms.js';
import type { FileResolver } from '#file-resolver.js';
import { BaseLoader } from '#loaders/base.loader.js';

type AssimpOptions = {
  format: FileExtension;
  resolver?: FileResolver;
};

/**
 * Loader for 3D file formats using the Assimp library compiled to WebAssembly.
 */
export class AssimpLoader extends BaseLoader<Uint8Array<ArrayBuffer>, AssimpOptions> {
  /**
   * Formats where Assimp's glTF2 output retains Z-up coordinates because
   * the importer does not bake a Y-up conversion into the scene.
   *
   * Formats NOT listed here already produce Y-up output from Assimp
   * (e.g. FBX, DAE, OBJ, 3DS bake a root transform during import).
   */
  private static readonly zUpFormats: Partial<Record<FileExtension, boolean>> = {
    stl: true,
    ply: true,
    '3mf': true,
    off: true,
    amf: true,
    wrl: true,
    x3dv: true,
    x3d: true,
    xgl: true,
    nff: true,
    ogex: true,
    'mesh.xml': true,
    cob: true,
    md5mesh: true,
    ac: true,
  };

  protected async parseAsync(files: FileInput[], options: AssimpOptions): Promise<Uint8Array<ArrayBuffer>> {
    const ajs = await assimpjs({
      locateFile() {
        const wasmPath = new URL('../assets/assimpjs/assimpjs-all.wasm', import.meta.url).href;

        return wasmPath;
      },
    });

    let result: AssimpResult;

    if (options.resolver) {
      // On-demand file resolution via ConvertFile callbacks.
      // Assimp's IOSystem calls these whenever it needs a sidecar file
      // (e.g. .mtl for OBJ, textures for DAE), regardless of format.
      // The resolver MUST return synchronously for assimpjs compatibility.
      const { resolver } = options;
      const primaryFile = files[0]!;
      result = ajs.ConvertFile(
        primaryFile.name,
        'glb2',
        primaryFile.bytes,
        (filename: string) => resolver.exists(filename) as boolean,
        (filename: string) => resolver.readFile(filename) as Uint8Array<ArrayBuffer>,
      );
    } else {
      // Pre-populated file list: all files provided upfront.
      const fileList = new ajs.FileList();
      for (const file of files) {
        fileList.AddFile(file.name, file.bytes);
      }

      result = ajs.ConvertFileList(fileList, 'glb2');
    }

    if (!result.IsSuccess() || result.FileCount() === 0) {
      throw new Error(`Failed to convert ${options.format} file: ${result.GetErrorCode()}`);
    }

    const resultFile = result.GetFile(0);

    // GetContent() returns a typed_memory_view — a live view into WASM linear
    // memory.  We must copy it to an independent buffer immediately: the view
    // is invalidated the moment the WebAssembly.Memory grows (any later
    // malloc/free in the same module detaches the underlying ArrayBuffer).
    const glbData = new Uint8Array(resultFile.GetContent());

    const isZup = AssimpLoader.zUpFormats[options.format] ?? false;

    if (isZup) {
      return normalizeGlbToYup(glbData);
    }

    return glbData;
  }

  protected mapToGlb(parseResult: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    return parseResult;
  }
}
