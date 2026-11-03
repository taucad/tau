/* oxlint-disable no-await-in-loop -- Verify generated modules serially to bound startup memory. */
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { sha256Bytes } from '@taucad/runtime/kernel';

/** One generated .NET resource bound by the prepared bundle manifest. @internal */
export type PicogkBrowserRuntimeFile = {
  readonly url: string;
  readonly sha256: string;
  readonly byteLength: number;
};

/** Verified resource loader for the pinned .NET browser host. @internal */
export type PicogkBrowserRuntimeLoader = {
  readonly bootstrapUrl: string;
  // oxlint-disable-next-line max-params -- This is the pinned .NET LoadBootResourceCallback ABI.
  readonly loadResource: (type: string, name: string, uri: string, integrity: string) => string | Promise<Response>;
  readonly dispose: () => void;
};

/**
 * Verify executable bytes before importing them and bind every runtime download to the same manifest.
 * @internal
 * @param options - Original bootstrap URL and the complete immutable resource inventory.
 * @returns Blob-backed executable modules and a verified binary resource loader.
 */
export const preparePicogkBrowserRuntime = async (options: {
  readonly bootstrapUrl: string;
  readonly files: readonly PicogkBrowserRuntimeFile[];
}): Promise<PicogkBrowserRuntimeLoader> => {
  const files = new Map<string, PicogkBrowserRuntimeFile>();
  const modules = new Map<string, string>();
  let disposed = false;
  const dispose = (): void => {
    disposed = true;
    for (const url of modules.values()) {
      URL.revokeObjectURL(url);
    }
    modules.clear();
  };
  for (const file of options.files) {
    const url = new URL(file.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      files.has(url.href) ||
      !/^[a-f\d]{64}$/iu.test(file.sha256) ||
      !Number.isSafeInteger(file.byteLength) ||
      file.byteLength < 0
    ) {
      throw new Error('Invalid PicoGK runtime resource inventory.');
    }
    files.set(url.href, { ...file });
  }
  const bootstrap = new URL(options.bootstrapUrl).href;
  if (!files.has(bootstrap) || !new URL(bootstrap).pathname.endsWith('.js')) {
    throw new Error('PicoGK runtime bootstrap is absent from its resource inventory.');
  }
  const read = async (url: string): Promise<Uint8Array<ArrayBuffer>> => {
    const file = files.get(url)!;
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok) {
      throw new Error(`PicoGK runtime resource download failed: ${response.status}.`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== file.byteLength || (await sha256Bytes(bytes)) !== file.sha256.toLowerCase()) {
      throw new Error('PicoGK runtime resource integrity mismatch.');
    }
    return bytes;
  };
  try {
    for (const url of files.keys()) {
      if (!new URL(url).pathname.endsWith('.js')) {
        continue;
      }
      const bytes = await read(url);
      // The pinned generated .NET/Emscripten modules derive resource locations from this expression.
      // Preserve their original base URL while executing only verified bytes, without a second network import.
      let code = new TextDecoder('utf-8', { fatal: true })
        .decode(bytes)
        .replaceAll('import.meta.url', JSON.stringify(url));
      if (url === bootstrap) {
        // Mono starts pthreads by loading this bootstrap again. Each worker must execute the
        // already-verified blob, including when a child runtime requests another worker.
        // Keep import.meta.url here: it identifies this blob, not the original resource base.
        code = `{
  const WorkerBase = globalThis.Worker;
  globalThis.Worker = class extends WorkerBase {
    constructor(script, options) {
      const requested = new URL(script, ${JSON.stringify(bootstrap)}).href;
      if (requested !== ${JSON.stringify(bootstrap)} && requested !== import.meta.url) {
        throw new Error('Unlisted PicoGK runtime worker bootstrap.');
      }
      super(import.meta.url, options);
    }
  };
}
${code}`;
      }
      modules.set(url, URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    }
    return {
      bootstrapUrl: modules.get(bootstrap)!,
      // oxlint-disable-next-line max-params -- .NET invokes its resource loader with these four positional fields.
      loadResource(type, _name, uri, integrity): string | Promise<Response> {
        if (disposed) {
          throw new Error('The PicoGK runtime resource loader is closed.');
        }
        const url = new URL(uri, bootstrap).href;
        const file = files.get(url);
        if (!file) {
          throw new Error('Unlisted PicoGK runtime resource.');
        }
        if (integrity) {
          const encoded = uint8ArrayToBase64(
            Uint8Array.from(file.sha256.match(/../gu)!, (byte) => Number.parseInt(byte, 16)),
          );
          if (integrity !== `sha256-${encoded}`) {
            throw new Error('PicoGK runtime configuration disagrees with its resource inventory.');
          }
        }
        if (type === 'dotnetjs') {
          const module = modules.get(url);
          if (!module) {
            throw new Error('PicoGK runtime requested an unverified executable module.');
          }
          return module;
        }
        return read(url).then(
          (bytes) =>
            new Response(bytes, {
              headers: {
                'Content-Type': new URL(url).pathname.endsWith('.wasm')
                  ? 'application/wasm'
                  : 'application/octet-stream',
              },
            }),
        );
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
};
