import { resolveRootedPath } from '@taucad/runtime/kernel';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

/**
 * Stateless adapter that provides filesystem operations to the WASM context.
 * Resolves engine paths inside the project-local filesystem root.
 */
export class FileSystemManager {
  /* oxlint-disable-next-line @typescript-eslint/parameter-properties -- parameter properties are non-erasable TypeScript */
  private readonly filesystem: KernelFileSystem;
  /* oxlint-disable-next-line @typescript-eslint/parameter-properties -- parameter properties are non-erasable TypeScript */
  public constructor(filesystem: KernelFileSystem) {
    this.filesystem = filesystem;
  }

  /**
   * Called from WASM.
   * Reads a file using a project-local virtual path.
   *
   * @param path - Engine-local file path to resolve within the selected root.
   * @returns the file contents as a byte array
   */
  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const out = await this.filesystem.readFile(this.resolvePath(path));
    return out;
  }

  /**
   * Called from WASM.
   * Checks if a project-local virtual file exists.
   *
   * @param path - Engine-local file path to resolve within the selected root.
   * @returns whether the file exists
   */
  public async exists(path: string): Promise<boolean> {
    const ok = await this.filesystem.exists(this.resolvePath(path));
    return ok;
  }

  /**
   * Called from WASM.
   * Lists all files in a project-local virtual directory.
   *
   * @param path - Engine-local directory path to resolve within the selected root.
   * @returns JSON array string of file names — matches kcl-lib WASM `getAllFiles` (`value.as_string` + `serde_json::from_str`)
   */
  public async getAllFiles(path: string): Promise<string> {
    const files = await this.filesystem.readdir(this.resolvePath(path));
    for (const name of files) {
      if (name.includes('/')) {
        throw new Error(
          `FileSystemManager.getAllFiles: kcl-lib expects single-segment filenames from readdir; got "${name}"`,
        );
      }
    }

    const json = JSON.stringify(files);
    return json;
  }

  /**
   * Translate the KCL engine's optional leading slash to a Tau rooted path.
   *
   * @param relativePath - Engine-local path.
   * @returns Canonical root-relative Tau path.
   */
  private resolvePath(relativePath: string): string {
    return resolveRootedPath(relativePath.startsWith('/') ? relativePath.slice(1) : relativePath);
  }
}
