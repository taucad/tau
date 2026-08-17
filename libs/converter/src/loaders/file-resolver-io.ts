/* eslint-disable @typescript-eslint/naming-convention -- External library uses PascalCase method names */
import { PlatformIO } from '@gltf-transform/core';
import draco3d from 'draco3dgltf';
import { allExtensions } from '#gltf.extensions.js';
import type { FileResolver } from '#file-resolver.js';

/**
 * Custom PlatformIO subclass that resolves external GLTF resources
 * (buffers, images) on-demand via a FileResolver.
 *
 * gltf-transform's _readResourcesExternal() automatically discovers
 * all referenced URIs in the GLTF JSON and calls readURI() for each.
 * We delegate to the resolver, eliminating per-format dependency extraction.
 */
export class FileResolverIO extends PlatformIO {
  private readonly resolver: FileResolver;

  /**
   * Creates an IO instance that fetches external GLTF resources via the given resolver.
   *
   * @param resolver - the file resolver used to fetch external GLTF resources on demand
   */
  public constructor(resolver: FileResolver) {
    super();
    this.resolver = resolver;
  }

  protected async readURI(uri: string, type: 'view'): Promise<Uint8Array<ArrayBuffer>>;
  protected async readURI(uri: string, type: 'text'): Promise<string>;
  protected async readURI(uri: string, type: 'view' | 'text'): Promise<Uint8Array<ArrayBuffer> | string> {
    const bytes = await this.resolver.readFile(uri);
    if (type === 'text') {
      return new TextDecoder().decode(bytes);
    }

    return bytes;
  }

  protected resolve(base: string, path: string): string {
    if (!base || base === '.') {
      return path;
    }

    return `${base}/${path}`;
  }

  protected dirname(uri: string): string {
    const lastSlash = uri.lastIndexOf('/');
    return lastSlash === -1 ? '' : uri.slice(0, lastSlash);
  }
}

/**
 * Creates a FileResolverIO pre-configured with all glTF extensions and Draco codecs.
 *
 * @param resolver - the file resolver for on-demand external resource loading
 * @returns A ready-to-use FileResolverIO instance.
 */
export async function createFileResolverIo(resolver: FileResolver): Promise<FileResolverIO> {
  const io = new FileResolverIO(resolver);
  io.registerExtensions(allExtensions).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule({
      locateFile: () => new URL('../assets/draco3d/gltf/draco_decoder_gltf.wasm', import.meta.url).href,
    }),
    'draco3d.encoder': await draco3d.createEncoderModule({
      locateFile: () => new URL('../assets/draco3d/gltf/draco_encoder.wasm', import.meta.url).href,
    }),
  });
  return io;
}
