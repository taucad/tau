import { PlatformIO } from '@gltf-transform/core';

import { allExtensions } from '@taucad/geometry-core';
import type { FileResolver } from '@taucad/geometry-core';

/** GlTF IO that reads external resources through a caller-owned resolver. @public */
export class FileResolverIo extends PlatformIO {
  private readonly resolver: FileResolver;

  public constructor(resolver: FileResolver) {
    super();
    this.resolver = resolver;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- PlatformIO API name
  protected async readURI(uri: string, type: 'view'): Promise<Uint8Array<ArrayBuffer>>;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- PlatformIO API name
  protected async readURI(uri: string, type: 'text'): Promise<string>;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- PlatformIO API name
  protected async readURI(uri: string, type: 'view' | 'text'): Promise<Uint8Array<ArrayBuffer> | string> {
    const bytes = await this.resolver.readFile(uri);
    return type === 'text' ? new TextDecoder().decode(bytes) : bytes;
  }

  protected resolve(base: string, path: string): string {
    return !base || base === '.' ? path : `${base}/${path}`;
  }

  protected dirname(uri: string): string {
    const lastSlash = uri.lastIndexOf('/');
    return lastSlash === -1 ? '' : uri.slice(0, lastSlash);
  }
}

/**
 * Create glTF IO with Tau's extension registry and caller-owned backend dependencies.
 *
 * @param resolver - Sidecar resolver.
 * @returns Configured IO without loading a codec backend.
 * @public
 */
export const createFileResolverIo = (resolver: FileResolver): FileResolverIo =>
  new FileResolverIo(resolver).registerExtensions(allExtensions);
