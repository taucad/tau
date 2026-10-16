import { asBuffer } from '@taucad/utils/file';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import { isNode, resolveFileUrl } from '#framework/environment.js';

const compiledModules = new Map<string, Promise<WebAssembly.Module>>();

/**
 * The `globalThis` key of the asset integrity registry: a `Map` from an asset's absolute URL to its Subresource
 * Integrity value (for example `sha384-…`).
 *
 * An application build fills it in each realm that references an asset, before that realm can fetch it; the Tau UI's
 * asset receipt plugin does so for every WASM file it emits. Every WASM fetch in this module then passes the value as
 * `fetch(url, { integrity })`, so the browser refuses a tampered byte with a network error before compilation. A URL
 * with no entry is fetched as before. The key is a registered symbol so that a build can fill the registry without
 * importing this package.
 */
const assetIntegrityRegistryKey = Symbol.for('taucad.assetIntegrity');

/**
 * The fetch options carrying a URL's registered integrity, or `undefined` when none is registered.
 *
 * @param url - The asset URL, absolute or relative to the document.
 * @returns The options to pass to `fetch`, if any.
 */
const integrityRequest = (url: string): RequestInit | undefined => {
  const registry: unknown = Reflect.get(globalThis, assetIntegrityRegistryKey);
  if (!(registry instanceof Map)) {
    return undefined;
  }
  const integrity: unknown = registry.get(canonicalizeUrl(url));
  return typeof integrity === 'string' ? { integrity } : undefined;
};

/**
 * Fetch an asset with its registered integrity, if any.
 *
 * @param url - Absolute or document-relative location of the asset to fetch.
 * @returns The response promise.
 */
const fetchAsset = async (url: string): Promise<Response> => {
  const request = integrityRequest(url);
  return request === undefined ? fetch(url) : fetch(url, request);
};

const canonicalizeUrl = (url: string): string => {
  try {
    const { location } = globalThis as { location?: { href: string } };
    return new URL(url, location?.href).href;
  } catch {
    return url;
  }
};

/**
 * Compile a WASM module from a URL using streaming compilation when possible.
 * Tries `WebAssembly.compileStreaming` first (enables V8 code caching), falls back
 * to `fetch()` + `WebAssembly.compile(bytes)` for compatibility. Both fetches carry
 * the URL's registered integrity (the `Map` at `globalThis[Symbol.for('taucad.assetIntegrity')]`), so a tampered
 * module is refused by either path.
 *
 * This is useful for libraries that accept a compiled `WebAssembly.Module` instance,
 * such as Emscripten's `instantiateWasm` or wasm-bindgen's `default()`.
 *
 * @param url - The URL to load the WASM binary from
 * @param tracer - Optional span tracer for hierarchy-aware telemetry
 * @returns A promise that resolves to a compiled WebAssembly module
 * @throws Error if the WASM binary cannot be loaded or compiled
 * @public
 */
export async function compileWasmStreaming(url: string, tracer?: RuntimeSpanTracer): Promise<WebAssembly.Module> {
  const canonicalUrl = canonicalizeUrl(url);
  const cached = compiledModules.get(canonicalUrl);
  if (cached) {
    return cached;
  }

  const pending = compileWasm(canonicalUrl, tracer);
  compiledModules.set(canonicalUrl, pending);
  try {
    return await pending;
  } catch (error) {
    if (compiledModules.get(canonicalUrl) === pending) {
      compiledModules.delete(canonicalUrl);
    }
    throw error;
  }
}

const compileWasm = async (url: string, tracer?: RuntimeSpanTracer): Promise<WebAssembly.Module> => {
  const span = tracer?.startSpan('wasm.compile', { url });
  try {
    if (shouldLoadFromFileSystem(url)) {
      const wasmBinary = await loadWasmBinary(url);
      return await WebAssembly.compile(wasmBinary);
    }

    const module = await WebAssembly.compileStreaming(fetchAsset(url));
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
};

/**
 * Load WASM binary using feature detection (try/catch) rather than environment checks.
 * Tries fetch first (works in browsers), falls back to fs.readFile for file:// URLs (Node.js).
 * The fetch carries the URL's registered integrity, as {@link compileWasmStreaming} describes.
 *
 * This is useful for libraries that require a raw `wasmBinary` ArrayBuffer,
 * such as Emscripten modules that accept `wasmBinary` in their module options.
 *
 * @param url - The URL to load the WASM binary from
 * @returns A promise that resolves to the WASM binary as an ArrayBuffer
 * @throws Error if the WASM binary cannot be loaded
 * @see https://www.zachleat.com/web/dynamic-import/ - similar pattern to import-module-string
 * @public
 */
export async function loadWasmBinary(url: string): Promise<ArrayBuffer> {
  if (shouldLoadFromFileSystem(url)) {
    const filePath = await resolveFileUrl(url);
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(filePath);
    return asBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }

  try {
    // Try fetch first - works in browsers and some Node.js versions
    const response = await fetchAsset(url);

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

function shouldLoadFromFileSystem(url: string): boolean {
  return isNode() && url.startsWith('file:');
}
