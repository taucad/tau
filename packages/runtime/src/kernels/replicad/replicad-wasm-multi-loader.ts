import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { OcctModuleFactory } from '#kernels/occt/oc-init.js';
import { resolveCjsDefault } from '#kernels/replicad/utils/resolve-cjs-default.js';

export type ReplicadOpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

const replicadMultiBindingsUrl = new URL('wasm/replicad_multi.js', import.meta.url).href;

const isNodeRuntime = (): boolean => typeof process !== 'undefined' && typeof process.versions.node === 'string';

const toNodeWorkerPath = (urlString: string): string => {
  const url = new URL(urlString);
  if (url.protocol !== 'file:') {
    return urlString;
  }
  const path = decodeURIComponent(url.pathname);
  return process.platform === 'win32' ? path.replace(/^\/([A-Za-z]:)/, '$1') : path;
};

const pthreadMainScriptUrlOrPath = (): string =>
  isNodeRuntime() ? toNodeWorkerPath(replicadMultiBindingsUrl) : replicadMultiBindingsUrl;

export const loadReplicadMultiWasm = async (): Promise<ReplicadOpenCascadeModuleFactory> => {
  // The Emscripten glue contains conditional Node branches. Keep it out of
  // framework static-analysis graphs, but expose it as a first-class emitted
  // asset through the `new URL(...)` above.
  const module_ = (await import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    replicadMultiBindingsUrl
  )) as Record<string, unknown>;
  // The multi build ships its own `OpenCascadeInstance` declaration that diverges from
  // the single build's (different NCollection template instantiations), so the factory
  // return types are not structurally comparable. Both expose the contract replicad
  // consumes at runtime, so erase to the single-build factory type via `unknown`.
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- single vs multi OCJS .d.ts diverge; runtime contract is identical
  const factory = resolveCjsDefault(module_['default'] ?? module_) as unknown as ReplicadOpenCascadeModuleFactory;

  return async (options) =>
    factory({
      ...options,
      mainScriptUrlOrBlob: pthreadMainScriptUrlOrPath(),
    });
};
