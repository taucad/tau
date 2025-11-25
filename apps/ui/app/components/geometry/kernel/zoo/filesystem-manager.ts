/* eslint-disable @typescript-eslint/parameter-properties -- parameter properties are non-erasable TypeScript */
import type { FileReader } from '#components/geometry/kernel/utils/file-reader.js';

/// FileSystemManager is a stateless adapter that provides filesystem operations
/// to the WASM context. It delegates to a FileReader implementation which handles
/// path resolution and logging.
export class FileSystemManager {
  private readonly reader: FileReader;

  public constructor(reader: FileReader) {
    this.reader = reader;
  }

  /**
   * Called from WASM.
   * Reads a file using a path relative to the current working directory.
   * Path resolution and logging are handled by the FileReader implementation.
   */
  public async readFile(path: string): Promise<Uint8Array> {
    return this.reader.readFile(path);
  }

  /**
   * Called from WASM.
   * Checks if a file exists using a path relative to the current working directory.
   * Path resolution and logging are handled by the FileReader implementation.
   */
  public async exists(path: string): Promise<boolean> {
    return this.reader.exists(path);
  }

  /**
   * Called from WASM.
   * Lists all files in a directory using a path relative to the current working directory.
   * Path resolution and logging are handled by the FileReader implementation.
   */
  public async getAllFiles(path: string): Promise<string[]> {
    return this.reader.readdir(path);
  }
}
