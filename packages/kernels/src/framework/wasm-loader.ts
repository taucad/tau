import { asBuffer } from '@taucad/utils/file';
import type { KernelSpanTracer } from '#types/kernel-tracer.types.js';
import { isNode, resolveFileUrl } from '#framework/environment.js';

/**
 * Compile a WASM module from a URL using streaming compilation when possible.
 * Tries `WebAssembly.compileStreaming` first (enables V8 code caching), falls back
 * to `fetch()` + `WebAssembly.compile(bytes)` for compatibility.
 *
 * This is useful for libraries that accept a compiled `WebAssembly.Module` instance,
 * such as Emscripten's `instantiateWasm` or wasm-bindgen's `default()`.
 *
 * @param url - The URL to load the WASM binary from
 * @param tracer - Optional span tracer for hierarchy-aware telemetry
 * @returns A promise that resolves to a compiled WebAssembly module
 * @throws Error if the WASM binary cannot be loaded or compiled
 */
export async function compileWasmStreaming(url: string, tracer?: KernelSpanTracer): Promise<WebAssembly.Module> {
  const span = tracer?.startSpan('wasm.compile', { url });
  try {
    const module = await WebAssembly.compileStreaming(fetch(url));
    return module;
  } catch (streamingError) {
    try {
      const wasmBinary = await loadWasmBinary(url);
      const module = await WebAssembly.compile(wasmBinary);
      return module;
    } catch (compileError) {
      const streamingMessage = streamingError instanceof Error ? streamingError.message : String(streamingError);
      const compileMessage = compileError instanceof Error ? compileError.message : String(compileError);
      throw new Error(
        `Failed to compile WASM module from ${url}. Streaming error: ${streamingMessage}. Fallback error: ${compileMessage}`,
      );
    }
  } finally {
    span?.end();
  }
}

/**
 * Load WASM binary using feature detection (try/catch) rather than environment checks.
 * Tries fetch first (works in browsers), falls back to fs.readFile for file:// URLs (Node.js).
 *
 * This is useful for libraries that require a raw `wasmBinary` ArrayBuffer,
 * such as Emscripten modules that accept `wasmBinary` in their module options.
 *
 * @param url - The URL to load the WASM binary from
 * @returns A promise that resolves to the WASM binary as an ArrayBuffer
 * @throws Error if the WASM binary cannot be loaded
 * @see https://www.zachleat.com/web/dynamic-import/ - similar pattern to import-module-string
 */
export async function loadWasmBinary(url: string): Promise<ArrayBuffer> {
  try {
    // Try fetch first - works in browsers and some Node.js versions
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch WASM binary from ${url}: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    if (!isNode() || !url.startsWith('file:')) {
      throw error;
    }

    const filePath = await resolveFileUrl(url);
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(filePath);
    return asBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }
}
