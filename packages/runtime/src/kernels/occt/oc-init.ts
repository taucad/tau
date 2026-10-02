/**
 * Shared OCCT WASM initialisation.
 *
 * Both OC-based kernels (Replicad and OpenCascade) load OCJS WASM in two
 * variants — a single-threaded build and a pthread (multi-threaded) build —
 * through the identical Emscripten `MODULARIZE` factory + `instantiateWasm`
 * dance. That boilerplate lives here so neither kernel re-implements it.
 *
 * The function is generic on the concrete OpenCascade instance type, so each
 * kernel keeps its own WASM-binding type at the call site (the Replicad kernel
 * uses `replicad-opencascadejs`' type, the OpenCascade kernel uses the locally
 * copied `opencascade_full` type) without this module importing either.
 */

import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import { compileWasmStreaming } from '#framework/wasm-loader.js';

/**
 * Emscripten module factory — the default export of an OCJS JS glue file.
 *
 * Accepts the Emscripten module options object and resolves to a fully
 * initialised OpenCascade instance. Options are typed as a permissive record
 * because the OCJS `init()` glue declares `options?: Record<string, unknown>`;
 * the only fields this module sets (`instantiateWasm`, `print`, `printErr`)
 * are typed explicitly at the call site.
 *
 * @template Instance - the concrete OpenCascade instance type for the kernel
 * @public
 */
export type OcctModuleFactory<Instance> = (options?: Record<string, unknown>) => Promise<Instance>;

/** Options for initialising an OCCT WASM module. */
export type InitOcctOptions = {
  /** Handler for C++ `stdout` messages. Defaults to a no-op (silences logs). */
  print?: (text: string) => void;
  /** Handler for C++ `stderr` messages. Defaults to a no-op (silences logs). */
  printErr?: (text: string) => void;
  /** Optional span tracer for instrumenting compilation and instantiation steps. */
  tracer?: RuntimeSpanTracer;
};

// oxlint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op to silence logs
const noop = (): void => {};

/**
 * Initialise an OCCT WASM module from a resolved WASM URL and bindings factory.
 *
 * This is a **pure function** with no module-level state or static imports of
 * Emscripten modules: the caller resolves the WASM URL and the JS bindings
 * factory (single- vs multi-threaded) and passes both in.
 *
 * Compiles the WASM binary via streaming compilation, then invokes the factory
 * with a custom `instantiateWasm` hook that reuses the pre-compiled
 * `WebAssembly.Module` (avoiding double compilation). The compiled module is
 * forwarded to `successCallback` as a second argument so pthread workers in the
 * multi-threaded build receive the same `WebAssembly.Module` via `postMessage`;
 * for single-threaded builds the second argument is harmless.
 *
 * @template Instance - the concrete OpenCascade instance type for the kernel
 * @param wasmUrl - absolute URL to the `.wasm` binary for streaming fetch
 * @param bindingsFactory - the Emscripten module factory (default export of the JS glue)
 * @param options - optional callbacks for stdout/stderr and tracing instrumentation
 * @returns the fully initialised OpenCascade instance
 * @public
 */
export async function initOcct<Instance>(
  wasmUrl: string,
  bindingsFactory: OcctModuleFactory<Instance>,
  options?: InitOcctOptions,
): Promise<Instance> {
  const { tracer } = options ?? {};
  const compiledModule = await compileWasmStreaming(wasmUrl, tracer);

  const instantiateSpan = tracer?.startSpan('wasm.emscripten-init');
  const instance = await bindingsFactory({
    instantiateWasm(
      imports: WebAssembly.Imports,
      successCallback: (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void,
    ) {
      const instSpan = tracer?.startSpan('wasm.instantiate');
      // async-iife: bootstrap — Emscripten's instantiateWasm hook is a
      // synchronous callback that hands control back via `successCallback`;
      // there is no Promise to thread back to the caller.
      void (async () => {
        try {
          const wasmInstance = await WebAssembly.instantiate(compiledModule, imports);
          instSpan?.end();
          // Pass the module alongside the instance so pthread workers (multi
          // build) receive the same WebAssembly.Module via postMessage. For
          // single-threaded builds the second arg is harmless.
          successCallback(wasmInstance, compiledModule);
        } catch (error) {
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
