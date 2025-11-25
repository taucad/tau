import { fileManager } from '#machines/file-manager.js';

export function getBuildDirectory(buildId: string): string {
  return `/builds/${buildId}`;
}

/// FileSystemManager is a class that provides a way to read files from the
/// local file system. The module's singleton instance assumes that you are in a
/// project since it is solely used by the std lib when executing code.
const defaultBuildId = 'bld_mDLGh4VtHyuyYBtlSPrCP';

export class FileSystemManager {
  // Hardcoded build ID for now - in the future this could be passed via constructor
  private readonly _buildId: string;
  private readonly buildDir: string;

  public constructor() {
    this._buildId = defaultBuildId;
    this.buildDir = getBuildDirectory(this._buildId);
  }

  public get buildId(): string {
    return this._buildId;
  }

  public get projectDir(): string {
    return 'public/kcl-samples/axial-fan';
  }

  /**
   * Called from WASM.
   */
  public async readFile(path: string): Promise<Uint8Array> {
    const fullPath = `${this.buildDir}/${this.projectDir}/${path}`;
    console.log('readFile', fullPath);

    return fileManager.readFile(fullPath);
  }

  /**
   * Called from WASM.
   */
  public async exists(path: string): Promise<boolean> {
    const fullPath = `${this.buildDir}/${this.projectDir}/${path}`;

    return fileManager.exists(fullPath);
  }

  /**
   * Called from WASM.
   */
  public async getAllFiles(path: string): Promise<string[]> {
    const fullPath = `${this.buildDir}/${this.projectDir}/${path}`;

    return fileManager.readdir(fullPath);
  }
}
