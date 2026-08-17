/* oxlint-disable new-cap -- External library uses PascalCase method names */
import assimpjs from 'assimpjs/all';
import type { AssimpResult } from 'assimpjs/all';
import type { FileExtension, FileInput } from '@taucad/types';
import { resolveAssimpFactory } from '#assimp-interop.js';
import type { FileResolver } from '#file-resolver.js';
import { BaseLoader } from '#loaders/base.loader.js';

type AssimpOptions = {
  format: FileExtension;
  resolver?: FileResolver;
};

/**
 * Loader for 3D file formats using the Assimp library compiled to WebAssembly.
 *
 * As of taucad/assimp's UnitAxisContract migration (Tier 1A/1B importers +
 * Tier 2 exporters), every importer stamps `AI_METADATA_UNIT_SCALE_TO_METERS`
 * and `AI_METADATA_UP_AXIS` on the imported scene, and the glTF2 exporter
 * bakes the inverse transform so the GLB we emit is always spec-compliant
 * (meters + Y-up). No per-format JS post-processing is required.
 */
export class AssimpLoader extends BaseLoader<Uint8Array<ArrayBuffer>, AssimpOptions> {
  protected async parseAsync(files: FileInput[], options: AssimpOptions): Promise<Uint8Array<ArrayBuffer>> {
    const ajs = await resolveAssimpFactory(assimpjs)({
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

    return glbData;
  }

  protected mapToGlb(parseResult: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    return parseResult;
  }
}
