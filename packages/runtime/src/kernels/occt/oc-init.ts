/**
 * Shared OCCT WASM initialisation.
 *
 * Both OC-based kernels (Replicad and OpenCascade) load OCJS WASM in two
 * variants — a single-threaded build and a pthread (multi-threaded) build —
 * through the identical generated initializer contract. URL wiring lives here
 * while Emscripten retains ownership of compilation and instantiation.
 *
 * The function is generic on the concrete OpenCascade instance type, so each
 * kernel keeps its own WASM-binding type at the call site (the Replicad kernel
 * uses `replicad-opencascadejs`' type, the OpenCascade kernel uses the locally
 * copied `opencascade_full` type) without this module importing either.
 */

import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';

/** Emscripten options shared by the generated and custom initializers. */
export type OcctModuleOptions = {
  locateFile?: (path: string, scriptDirectory: string) => string;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
};

/**
 * Emscripten module factory — the default export of an OCJS JS glue file.
 *
 * Accepts the common Emscripten module options and resolves to a fully
 * initialised OpenCascade instance.
 *
 * @template Instance - the concrete OpenCascade instance type for the kernel
 * @public
 */
export type OcctModuleFactory<Instance> = (options?: OcctModuleOptions) => Promise<Instance>;

/** Options for initialising an OCCT WASM module. */
export type InitOcctOptions = {
  /** Handler for C++ `stdout` messages. Defaults to a no-op (silences logs). */
  print?: (text: string) => void;
  /** Handler for C++ `stderr` messages. Defaults to a no-op (silences logs). */
  printErr?: (text: string) => void;
  /** Optional span tracer for instrumenting Emscripten initialisation. */
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
 * Passes the resolved WASM URL through Emscripten's supported `locateFile`
 * option. The generated initializer remains responsible for loading glue,
 * configuring pthread workers, compiling WASM, and propagating failures.
 *
 * @template Instance - the concrete OpenCascade instance type for the kernel
 * @param wasmUrl - absolute URL to the `.wasm` binary for streaming fetch.
 *   When omitted, the Emscripten glue resolves its own bundled WASM via
 *   `locateFile`/`new URL(...)`; this avoids duplicating package-owned WASM
 *   assets in framework bundlers that already follow the glue import graph.
 * @param initializer - generated initializer or custom Emscripten module factory
 * @param options - optional callbacks for stdout/stderr and tracing instrumentation
 * @returns the fully initialised OpenCascade instance
 * @public
 */
export async function initOcct<Instance>(
  wasmUrl: string | undefined,
  initializer: OcctModuleFactory<Instance>,
  options?: InitOcctOptions,
): Promise<Instance> {
  const span = options?.tracer?.startSpan('wasm.emscripten-init');
  try {
    return await initializer({
      ...(wasmUrl
        ? {
            locateFile: (path, scriptDirectory) => (path.endsWith('.wasm') ? wasmUrl : `${scriptDirectory}${path}`),
          }
        : {}),
      print: options?.print ?? noop,
      printErr: options?.printErr ?? noop,
    });
  } finally {
    span?.end();
  }
}
