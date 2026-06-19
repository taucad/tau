import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { OcctModuleFactory } from '#kernels/occt/oc-init.js';
import { resolveCjsDefault } from '#kernels/replicad/utils/resolve-cjs-default.js';

export type ReplicadOpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

const replicadSingleBindingsUrl = new URL('wasm/replicad_single.js', import.meta.url).href;

export const loadReplicadSingleWasm = async (): Promise<ReplicadOpenCascadeModuleFactory> => {
  // The Emscripten glue contains conditional Node branches. Keep it out of
  // framework static-analysis graphs, but expose it as a first-class emitted
  // asset through the `new URL(...)` above.
  const module_ = (await import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    replicadSingleBindingsUrl
  )) as Record<string, unknown>;
  return resolveCjsDefault(module_['default'] ?? module_) as ReplicadOpenCascadeModuleFactory;
};
