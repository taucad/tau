/**
 * Emscripten Module configuration for controlling runtime behavior
 */
export type EmscriptenModuleConfig = {
  /**
   * Function to handle stdout output from the WASM module
   * @param message - The message to be printed
   */
  print?: (message: string) => void;

  /**
   * Function to handle stderr output from the WASM module
   * @param message - The error message to be printed
   */
  printErr?: (message: string) => void;

  /**
   * Custom ArrayBuffer or SharedArrayBuffer to use as memory
   */
  buffer?: ArrayBuffer | SharedArrayBuffer;

  /**
   * Custom WebAssembly.Memory to use
   */
  wasmMemory?: WebAssembly.Memory;

  /**
   * Function to locate files (WASM, data files, etc.)
   * @param path - Relative path to the file
   * @param prefix - Path prefix (directory of the main JS file)
   * @returns The actual URL to load the file from
   */
  locateFile?: (path: string, prefix: string) => string;

  /**
   * Function called when the runtime is fully initialized
   */
  onRuntimeInitialized?: () => void;

  /**
   * Function called on abnormal program termination
   * @param what - Description of what went wrong
   */
  onAbort?: (what: unknown) => void;
};
