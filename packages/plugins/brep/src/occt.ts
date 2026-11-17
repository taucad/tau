// oxlint-disable-next-line typescript/triple-slash-reference -- occt-import-js ships no declarations; this is the backend import seam.
/// <reference path='./types/occt-import-js.d.ts' />
import { withoutEmscriptenProcessListeners } from '@taucad/runtime/kernel';

import { OcctLoader } from '#occt-loader.js';
import type { OcctImportJs } from '#occt-loader.js';

/** The occt-import-js module: the loader's import API plus Emscripten's view over its linear memory. @public */
export type OcctBackend = OcctImportJs & { readonly HEAPU8: Uint8Array<ArrayBuffer> };

/**
 * Load the OCCT import backend. The WASM binary ships inside this package.
 *
 * @returns The loaded backend, to reuse across meshing calls.
 * @public
 */
export const loadOcctBackend = async (): Promise<OcctBackend> => {
  const { default: factory } = await import('occt-import-js');
  return withoutEmscriptenProcessListeners(async () =>
    factory({
      print() {
        /* Empty. */
      },
      printErr() {
        /* Empty. */
      },
      locateFile: () => new URL('wasm/occt-import-js.wasm', import.meta.url).href,
    }),
  );
};

/**
 * Mesh a STEP, IGES or BREP file into a GLB, in meters, with Tau's CAD material defaults.
 *
 * @param backend - A backend from {@link loadOcctBackend}.
 * @param file - The file name and bytes; `format` (`step`, `stp`, `iges`, `igs` or `brep`) defaults to the name's extension.
 * @returns The GLB bytes.
 * @public
 */
export const meshOcctFile = async (
  backend: OcctBackend,
  file: Readonly<{ name: string; bytes: Uint8Array<ArrayBuffer>; format?: string }>,
): Promise<Uint8Array<ArrayBuffer>> =>
  new OcctLoader(backend)
    .initialize({ format: file.format ?? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() })
    .load([{ name: file.name, bytes: file.bytes }]);
