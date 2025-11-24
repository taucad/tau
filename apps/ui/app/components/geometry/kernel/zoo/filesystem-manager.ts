// Polyfill window.electron fs functions as needed when in a nodejs context
// (INTENDED FOR VITEST SHENANIGANS.)

import type { Abortable } from 'node:events';
import type { ObjectEncodingOptions, OpenMode } from 'node:fs';
import FS from '@isomorphic-git/lightning-fs';

export function getBuildDirectory(buildId: string): string {
  return `/builds/${buildId}`;
}

/// FileSystemManager is a class that provides a way to read files from the
/// local file system. The module's singleton instance assumes that you are in a
/// project since it is solely used by the std lib when executing code.
const defaultBuildId = 'bld_pUkHQP3WwaMQWMRxjGNUF';

export class FileSystemManager {
  // Hardcoded build ID for now - in the future this could be passed via constructor
  private readonly _buildId: string;
  private readonly buildDir: string;
  private readonly fs: FS | undefined;

  public constructor() {
    this._buildId = defaultBuildId;
    this.buildDir = getBuildDirectory(this._buildId);
    // Use the shared LightningFS instance
    this.fs = new FS('tau-fs', {
      // FS options for KCL-specific filesystem
    });
  }

  public get buildId(): string {
    return this._buildId;
  }

  public get lightningFs(): FS | undefined {
    return this.fs;
  }

  public get projectDir(): string {
    return 'public/kcl-samples/axial-fan';
  }

  /**
   * Called from WASM.
   */
  public async readFile(
    path: string,
    options?: {
      encoding?: undefined;
      flag?: OpenMode | undefined;
    },
  ): Promise<Uint8Array>;
  public async readFile(
    path: string,
    options:
      | {
          encoding: BufferEncoding;
          flag?: OpenMode | undefined;
        }
      | BufferEncoding,
  ): Promise<string>;
  public async readFile(
    path: string,
    options?:
      | (ObjectEncodingOptions &
          Abortable & {
            flag?: OpenMode | undefined;
          })
      | BufferEncoding,
  ): Promise<string | Uint8Array> {
    if (!this.fs) {
      throw new Error('KCL LightningFS not initialized');
    }

    const fullPath = `${this.buildDir}/${this.projectDir}/${path}`;

    try {
      const data = await this.fs.promises.readFile(fullPath);

      // Determine encoding from options
      const encoding = typeof options === 'string' ? options : options?.encoding;

      if (encoding) {
        // Return as string with specified encoding
        const decoder = new TextDecoder(encoding);
        return decoder.decode(data);
      }

      // Return as Uint8Array
      return new Uint8Array(data);
    } catch (error) {
      console.error('Failed to read file:', fullPath, error);
      throw new Error(`Failed to read file: ${path}`);
    }
  }

  /**
   * Called from WASM.
   */
  public async exists(path: string): Promise<boolean> {
    if (!this.fs) {
      return false;
    }

    const fullPath = `${this.buildDir}/${this.projectDir}/${path}`;

    try {
      await this.fs.promises.stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Called from WASM.
   */
  public async getAllFiles(path: string): Promise<string[]> {
    if (!this.fs) {
      return [];
    }

    const fullPath = `${this.buildDir}/${this.projectDir}/${path}`;

    try {
      const entries = await this.fs.promises.readdir(fullPath);
      // Readdir returns string[] of file/directory names
      return entries;
    } catch (error) {
      console.error('Failed to list directory:', fullPath, error);
      return [];
    }
  }
}
