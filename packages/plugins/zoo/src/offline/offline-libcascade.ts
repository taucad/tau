/* oxlint-disable no-restricted-imports -- `#*.js` maps to TypeScript sources, so the checked-in glue is reached relatively */
/**
 * The one import site for the package's own libcascade build: glue JS, WASM and types under `wasm/`, built by
 * `libcascade/build.sh` with only the bindings the engine calls plus the TauOffline native helpers.
 */
import type { OpenCascadeInstance as Instance } from './wasm/libcascade_kcl.js';

// Named, not `export type *`: the declaration bundler drops star re-exports of the externalized glue's types.
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the engine's libcascade types come from this one site
export type {
  NCollection_List_TopoDS_Shape,
  OpenCascadeInstance,
  TopoDS_Edge,
  TopoDS_Face,
  TopoDS_Shape,
  TopoDS_Vertex,
  gp_Ax1,
  gp_Ax2,
  gp_Dir,
  gp_Pnt,
  gp_Trsf,
  gp_Vec,
} from './wasm/libcascade_kcl.js';

// A static URL lets bundlers emit the WASM as an asset beside the glue chunk.
const wasmUrl = new URL('wasm/libcascade_kcl.wasm', import.meta.url).href;

/**
 * Loads the package's libcascade build, fetching the glue only on first use.
 *
 * @returns an initialized libcascade instance
 */
export const loadLibcascade = async (): Promise<Instance> => {
  const { default: init } = await import('./wasm/libcascade_kcl.js');
  return init({ locateFile: () => wasmUrl });
};
