/* eslint-disable promise/prefer-await-to-then -- WASM loading doesn't support await */
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- emscripten types are not available as a module
/// <reference types="emscripten" />

import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import type { OpenCascadeInstance } from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';
import opencascadeWithExceptions from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import type { OpenCascadeInstance as OpenCascadeInstanceWithExceptions } from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import opencascadeWithExceptionsWasm from 'replicad-opencascadejs/src/replicad_with_exceptions.wasm?url';

// Types for OpenCascade modules
type OpenCascadeModule = (options?: Partial<EmscriptenModule>) => Promise<OpenCascadeInstance>;
type OpenCascadeModuleWithExceptions = (
  options?: Partial<EmscriptenModule>,
) => Promise<OpenCascadeInstanceWithExceptions>;

const moduleName = 'OC';

/**
 * Optimized version of OpenCascade initialization with caching
 */
export async function initOpenCascade(): Promise<OpenCascadeInstance> {
  console.log(`${moduleName}: Starting`);
  const startTime = performance.now();

  try {
    // Initialize with optimized settings
    const instance = await (opencascade as OpenCascadeModule)({
      locateFile: () => opencascadeWasm,
      // Use a larger memory allocation for better performance
      // eslint-disable-next-line @typescript-eslint/naming-convention -- this is a valid property
      TOTAL_MEMORY: 256 * 1024 * 1024, // 256MB
      // Let the browser optimize WebAssembly compilation
      instantiateWasm(imports, successCallback) {
        console.log(`${moduleName}: Using optimized WebAssembly instantiation`);
        if (typeof fetch === 'undefined') {
          return {}; // Skip streaming in environments without fetch
        }

        WebAssembly.instantiateStreaming(fetch(opencascadeWasm, { cache: 'force-cache' }), imports)
          .then((output) => {
            successCallback(output.instance);
          })
          .catch((error: unknown) => {
            console.error(`${moduleName}: Streaming instantiation failed, falling back to ArrayBuffer`, error);
            // Fallback to traditional approach
            void fetch(opencascadeWasm, { cache: 'force-cache' })
              .then(async (response) => response.arrayBuffer())
              .then(async (buffer) => WebAssembly.instantiate(buffer, imports))
              .then((output) => {
                successCallback(output.instance);
              });
          });
        return {}; // Return empty object to indicate we're handling instantiation
      },
    });

    const endTime = performance.now();
    console.log(`${moduleName}: Completed in ${endTime - startTime}ms`);

    return instance;
  } catch (error) {
    console.error(`${moduleName}: Failed`, error);
    throw error;
  }
}

/**
 * Optimized version of OpenCascade initialization with exceptions and caching
 */
export async function initOpenCascadeWithExceptions(): Promise<OpenCascadeInstanceWithExceptions> {
  console.log(`${moduleName}: Starting`);
  const startTime = performance.now();

  try {
    // Initialize with optimized settings
    const instance = await (opencascadeWithExceptions as OpenCascadeModuleWithExceptions)({
      locateFile: () => opencascadeWithExceptionsWasm,
      // Use a larger memory allocation for better performance
      // eslint-disable-next-line @typescript-eslint/naming-convention -- this is a valid property
      TOTAL_MEMORY: 256 * 1024 * 1024, // 256MB
      // Let the browser optimize WebAssembly compilation
      instantiateWasm(imports, successCallback) {
        console.log(`${moduleName}: Using optimized WebAssembly instantiation`);
        if (typeof fetch === 'undefined') {
          return {}; // Skip streaming in environments without fetch
        }

        WebAssembly.instantiateStreaming(fetch(opencascadeWithExceptionsWasm, { cache: 'force-cache' }), imports)
          .then((output) => {
            successCallback(output.instance);
          })
          .catch((error: unknown) => {
            console.error(`${moduleName}: Streaming instantiation failed, falling back to ArrayBuffer`, error);
            // Fallback to traditional approach
            void fetch(opencascadeWithExceptionsWasm, { cache: 'force-cache' })
              .then(async (response) => response.arrayBuffer())
              .then(async (buffer) => WebAssembly.instantiate(buffer, imports))
              .then((output) => {
                successCallback(output.instance);
              });
          });
        return {}; // Return empty object to indicate we're handling instantiation
      },
    });

    const endTime = performance.now();
    console.log(`${moduleName}: Completed in ${endTime - startTime}ms`);

    return instance;
  } catch (error) {
    console.error(`${moduleName}: Failed`, error);
    throw error;
  }
}
