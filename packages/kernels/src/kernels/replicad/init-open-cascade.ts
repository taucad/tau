// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- emscripten types are not available as a module
/// <reference types="emscripten" />

import type { OpenCascadeInstance } from 'replicad-opencascadejs/src/replicad_single.js';
import type { KernelSpanTracer } from '#types/kernel-tracer.types.js';
import { compileWasmStreaming } from '#framework/wasm-loader.js';

/**
 * Emscripten module factory -- the default export of the JS glue file.
 * Accepts partial EmscriptenModule options and returns an OpenCascadeInstance.
 */
export type OpenCascadeModuleFactory = (options?: Partial<EmscriptenModule>) => Promise<OpenCascadeInstance>;

/**
 * Options for initializing OpenCascade.
 */
type InitOpenCascadeOptions = {
  /** Optional callback to handle stdout messages. Defaults to no-op (silences logs). */
  print?: (text: string) => void;
  /** Optional callback to handle stderr messages. Defaults to no-op (silences logs). */
  printErr?: (text: string) => void;
  /** Optional span tracer for hierarchy-aware telemetry */
  tracer?: KernelSpanTracer;
};

// eslint-disable-next-line @typescript-eslint/no-empty-function -- Intentional no-op to silence logs
const noop = (): void => {};

/**
 * Initialize OpenCascade from pre-resolved WASM URL and bindings factory.
 *
 * This is a **pure function** with no module-level state or static imports
 * of Emscripten modules. The caller is responsible for resolving the WASM URL
 * and loading the JS bindings factory (via dynamic import or other means).
 *
 * @param wasmUrl - Absolute URL to the `.wasm` binary.
 * @param bindingsFactory - The Emscripten module factory function (default export of JS glue).
 * @param options - Optional callbacks for stdout/stderr and tracing.
 */
export async function initOpenCascade(
  wasmUrl: string,
  bindingsFactory: OpenCascadeModuleFactory,
  options?: InitOpenCascadeOptions,
): Promise<OpenCascadeInstance> {
  const { tracer } = options ?? {};
  const compiledModule = await compileWasmStreaming(wasmUrl, tracer);

  const instantiateSpan = tracer?.startSpan('wasm.emscripten-init');
  const instance = await bindingsFactory({
    instantiateWasm(imports: WebAssembly.Imports, successCallback: (instance: WebAssembly.Instance) => void) {
      const instSpan = tracer?.startSpan('wasm.instantiate');
      void (async () => {
        try {
          const wasmInstance = await WebAssembly.instantiate(compiledModule, imports);
          instSpan?.end();
          successCallback(wasmInstance);
        } catch (error: unknown) {
          instSpan?.end();
          throw error instanceof Error ? error : new Error(String(error));
        }
      })();

      return {};
    },
    print: options?.print ?? noop,
    printErr: options?.printErr ?? noop,
  });
  instantiateSpan?.end();

  return instance;
}
