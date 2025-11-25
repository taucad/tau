/**
 * Interface for file system operations.
 * Implementations should handle logging and path resolution.
 */
export type FileReader = {
  readFile(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  readdir(path: string): Promise<string[]>;
};
