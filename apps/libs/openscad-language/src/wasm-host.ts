import { openscadLanguageManifestSchema } from '#protocol.js';
import type { OpenscadLanguageAssets, OpenscadLanguageManifest } from '#protocol.js';

/** The server's JSON-RPC entry point. */
export type OpenscadServerExports = Readonly<{
  /** The response JSON, or undefined for a notification. */
  handle(message: string): string | undefined;
}>;

/* eslint-disable @typescript-eslint/naming-convention -- The module's C ABI exports keep their Rust names. */
type ModuleExports = Readonly<{
  memory: WebAssembly.Memory;
  osl_alloc(length: number): number;
  osl_handle(pointer: number, length: number): number;
  osl_response(): number;
}>;
/* eslint-enable @typescript-eslint/naming-convention -- End of the C ABI names. */

export type LoadOpenscadServerOptions = Readonly<{
  assets: OpenscadLanguageAssets;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}>;

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const sha256Hex = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', bytes));

const download = async (
  fetcher: typeof globalThis.fetch,
  url: URL,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> => {
  const response = await fetcher(url.href, { signal, redirect: 'error' });
  if (!response.ok) {
    throw new Error(`OpenSCAD language asset download failed (${String(response.status)}): ${url.pathname}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

/** Admit the content-identified manifest: its bytes must match the identity the build recorded. */
export const loadOpenscadManifest = async (
  options: LoadOpenscadServerOptions,
): Promise<{ manifest: OpenscadLanguageManifest; base: URL }> => {
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Node test hosts have no location.
  const url = new URL(options.assets.url, globalThis.location?.href);
  if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Invalid OpenSCAD language manifest URL.');
  }
  const bytes = await download(options.fetch ?? globalThis.fetch, url, options.signal);
  if ((await sha256Hex(bytes)) !== options.assets.sha256) {
    throw new Error('OpenSCAD language manifest integrity mismatch.');
  }
  const manifest = openscadLanguageManifestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  return { manifest, base: new URL('.', url) };
};

/** Wrap an instantiated server module's C ABI as the JSON-RPC entry point. */
export const wrapOpenscadServer = (instance: WebAssembly.Instance): OpenscadServerExports => {
  const exports = instance.exports as unknown as ModuleExports;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    handle(message) {
      const bytes = encoder.encode(message);
      const pointer = exports.osl_alloc(bytes.length);
      // Read `memory.buffer` after each call: the module may grow its memory and detach the old buffer.
      new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
      const length = exports.osl_handle(pointer, bytes.length);
      if (length === 0) {
        return undefined;
      }
      return decoder.decode(new Uint8Array(exports.memory.buffer, exports.osl_response(), length));
    },
  };
};

/**
 * Download, verify and instantiate the server module. It has no imports: the server performs no I/O and the worker
 * passes every file over JSON-RPC.
 */
export const loadOpenscadServer = async (options: LoadOpenscadServerOptions): Promise<OpenscadServerExports> => {
  const { manifest, base } = await loadOpenscadManifest(options);
  const bytes = await download(options.fetch ?? globalThis.fetch, new URL(manifest.module.path, base), options.signal);
  if (bytes.length !== manifest.module.byteLength || (await sha256Hex(bytes)) !== manifest.module.sha256) {
    throw new Error('OpenSCAD language module integrity mismatch.');
  }
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return wrapOpenscadServer(instance);
};
