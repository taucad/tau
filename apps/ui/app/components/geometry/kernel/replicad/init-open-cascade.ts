import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import opencascadeWasm from 'replicad-opencascadejs/src/replicad_single.wasm?url';

import opencascadeWithExceptions from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import opencascadeWithExceptionsWasm from 'replicad-opencascadejs/src/replicad_with_exceptions.wasm?url';

// Types for OpenCascade modules
interface OpenCascadeModule {
  (options?: OpenCascadeOptions): Promise<any>;
}

interface OpenCascadeOptions {
  locateFile?: (path: string) => string;
  TOTAL_MEMORY?: number;
  cache?: boolean;
  instantiateWasm?: (imports: WebAssembly.Imports, successCallback: (instance: WebAssembly.Instance) => void) => {};
  [key: string]: any;
}

// Cache for initialized modules
let singleModuleCache: any;
let exceptionsModuleCache: any;

/**
 * Optimized version of OpenCascade initialization with caching
 */
export async function initOpenCascade() {
  console.log('initOpenCascade: Starting');
  const startTime = performance.now();

  // Return cached instance if available
  if (singleModuleCache) {
    console.log('Using cached OpenCascade instance');
    return singleModuleCache;
  }

  try {
    // Use preloaded module if available in window cache
    const cachedInstance = typeof globalThis === 'undefined' ? undefined : (globalThis as any).__ocSingleInstance;
    if (cachedInstance) {
      console.log('Using globally cached OpenCascade instance');
      singleModuleCache = cachedInstance;
      return cachedInstance;
    }

    // Initialize with optimized settings
    const instance = await (opencascade as OpenCascadeModule)({
      locateFile: () => opencascadeWasm,
      // Use a larger memory allocation for better performance
      TOTAL_MEMORY: 64 * 1024 * 1024, // 64MB
      // Set cache settings to help with browser caching
      cache: true,
      // Let the browser optimize WebAssembly compilation
      instantiateWasm: (imports: WebAssembly.Imports, successCallback: (instance: WebAssembly.Instance) => void) => {
        console.log('Using optimized WebAssembly instantiation');
        if (typeof fetch === 'undefined') {
          return {}; // Skip streaming in environments without fetch
        }

        WebAssembly.instantiateStreaming(fetch(opencascadeWasm, { cache: 'force-cache' }), imports)
          .then((output) => {
            successCallback(output.instance);
          })
          .catch((error) => {
            console.error('Streaming instantiation failed, falling back to ArrayBuffer', error);
            // Fallback to traditional approach
            fetch(opencascadeWasm, { cache: 'force-cache' })
              .then((response) => response.arrayBuffer())
              .then((buffer) => WebAssembly.instantiate(buffer, imports))
              .then((output) => {
                successCallback(output.instance);
              });
          });
        return {}; // Return empty object to indicate we're handling instantiation
      },
    });

    // Cache the instance
    singleModuleCache = instance;

    // Store globally for potential reuse
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__ocSingleInstance = instance;
    }

    const endTime = performance.now();
    console.log(`initOpenCascade: Completed in ${endTime - startTime}ms`);

    return instance;
  } catch (error) {
    console.error('initOpenCascade: Failed', error);
    throw error;
  }
}

/**
 * Optimized version of OpenCascade initialization with exceptions and caching
 */
export async function initOpenCascadeWithExceptions() {
  console.log('initOpenCascadeWithExceptions: Starting');
  const startTime = performance.now();

  // Return cached instance if available
  if (exceptionsModuleCache) {
    console.log('Using cached OpenCascade with exceptions instance');
    return exceptionsModuleCache;
  }

  try {
    // Use preloaded module if available in window cache
    const cachedInstance = typeof globalThis === 'undefined' ? undefined : (globalThis as any).__ocExceptionsInstance;
    if (cachedInstance) {
      console.log('Using globally cached OpenCascade with exceptions instance');
      exceptionsModuleCache = cachedInstance;
      return cachedInstance;
    }

    // Initialize with optimized settings
    const instance = await (opencascadeWithExceptions as OpenCascadeModule)({
      locateFile: () => opencascadeWithExceptionsWasm,
      // Use a larger memory allocation for better performance
      TOTAL_MEMORY: 64 * 1024 * 1024, // 64MB
      // Set cache settings to help with browser caching
      cache: true,
      // Let the browser optimize WebAssembly compilation
      instantiateWasm: (imports: WebAssembly.Imports, successCallback: (instance: WebAssembly.Instance) => void) => {
        console.log('Using optimized WebAssembly instantiation');
        if (typeof fetch === 'undefined') {
          return {}; // Skip streaming in environments without fetch
        }

        WebAssembly.instantiateStreaming(fetch(opencascadeWithExceptionsWasm, { cache: 'force-cache' }), imports)
          .then((output) => {
            successCallback(output.instance);
          })
          .catch((error) => {
            console.error('Streaming instantiation failed, falling back to ArrayBuffer', error);
            // Fallback to traditional approach
            fetch(opencascadeWithExceptionsWasm, { cache: 'force-cache' })
              .then((response) => response.arrayBuffer())
              .then((buffer) => WebAssembly.instantiate(buffer, imports))
              .then((output) => {
                successCallback(output.instance);
              });
          });
        return {}; // Return empty object to indicate we're handling instantiation
      },
    });

    // Cache the instance
    exceptionsModuleCache = instance;

    // Store globally for potential reuse
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__ocExceptionsInstance = instance;
    }

    const endTime = performance.now();
    console.log(`initOpenCascadeWithExceptions: Completed in ${endTime - startTime}ms`);

    return instance;
  } catch (error) {
    console.error('initOpenCascadeWithExceptions: Failed', error);
    throw error;
  }
}
