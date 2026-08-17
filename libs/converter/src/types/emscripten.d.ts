/**
 * Emscripten Module configuration for controlling runtime behavior.
 */
export type EmscriptenModuleConfig = {
  /** Callback invoked for stdout output from the WASM module. */
  print?: (message: string) => void;

  /** Callback invoked for stderr output from the WASM module. */
  printErr?: (message: string) => void;

  /** Custom ArrayBuffer or SharedArrayBuffer to use as WASM linear memory. */
  buffer?: ArrayBuffer | SharedArrayBuffer;

  /** Custom WebAssembly.Memory instance to use. */
  wasmMemory?: WebAssembly.Memory;

  /** Resolves the URL for a WASM or data file given its relative path and directory prefix. */
  locateFile?: (path: string, prefix: string) => string;

  /** Callback invoked when the Emscripten runtime is fully initialized. */
  onRuntimeInitialized?: () => void;

  /** Callback invoked on abnormal program termination. */
  onAbort?: (what: unknown) => void;
};
