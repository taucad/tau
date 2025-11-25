import LightningFS from '@isomorphic-git/lightning-fs';
import type { MKDirOptions } from '@isomorphic-git/lightning-fs';
import JSZip from 'jszip';

// Set up LightningFS in the worker (persistent IndexedDB-backed filesystem)
const fs = new LightningFS('myfs'); // Opens an IndexedDB named "myfs"
const { promises: fsp } = fs; // Use promise-based API for convenience

export type FileStat = {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  mtimeMs: number;
};

export type FileManager = {
  readFile(filepath: string, options: 'utf8' | { encoding: 'utf8' }): Promise<string>;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- preserving original API
  readFile(filepath: string, options?: {}): Promise<Uint8Array>;
  writeFile(filepath: string, data: Uint8Array | string): Promise<void>;
  writeFiles(files: Record<string, { content: Uint8Array }>): Promise<void>;
  mkdir(path: string, options?: MKDirOptions): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{
    type: 'file' | 'dir';
    size: number;
    mtimeMs: number;
  }>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  batchExists(paths: string[]): Promise<Record<string, boolean>>;
  ensureDirectoryExists(path: string): Promise<void>;
  getDirectoryStat(path: string): Promise<FileStat[]>;
  getDirectoryContents(path: string): Promise<Record<string, Uint8Array>>;
  copyDirectory(sourcePath: string, destinationPath: string): Promise<void>;
  getZippedDirectory(path: string): Promise<Blob>;
};

export const fileManager: FileManager = {
  readFile: fsp.readFile.bind(fsp),

  // Check if a path exists (file or directory)
  async exists(path: string): Promise<boolean> {
    try {
      await fsp.stat(path);
      return true;
    } catch {
      return false;
    }
  },

  // Batch check if multiple paths exist - optimized for checking many paths at once
  async batchExists(paths: string[]): Promise<Record<string, boolean>> {
    const results = await Promise.all(
      paths.map(async (path) => ({
        path,
        exists: await this.exists(path),
      })),
    );

    const existsMap: Record<string, boolean> = {};
    for (const { path, exists } of results) {
      existsMap[path] = exists;
    }

    return existsMap;
  },

  // Ensure a directory path exists, creating all parent directories as needed
  async ensureDirectoryExists(targetPath: string): Promise<void> {
    const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    const segments = normalizedPath.split('/').filter((segment) => segment.length > 0);

    // Build all directory paths that need to be created
    const directoryPaths: string[] = [];
    let currentPath = '';

    for (const segment of segments) {
      currentPath += `/${segment}`;
      directoryPaths.push(currentPath);
    }

    // Batch check which directories already exist
    const existsMap = await this.batchExists(directoryPaths);

    // Create only the directories that don't exist (in order)
    for (const directoryPath of directoryPaths) {
      if (!existsMap[directoryPath]) {
        try {
          // eslint-disable-next-line no-await-in-loop -- Need to create directories sequentially
          await fsp.mkdir(directoryPath);
        } catch (error: unknown) {
          // Ignore error if directory was created by another concurrent operation
          if (error instanceof Error && !error.message.includes('EEXIST')) {
            throw error;
          }
        }
      }
    }
  },

  // Write a file from provided binary data
  async writeFile(path: string, content: Uint8Array): Promise<void> {
    // Ensure parent directory exists before writing
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex > 0) {
      const directoryPath = path.slice(0, lastSlashIndex);
      await this.ensureDirectoryExists(directoryPath);
    }

    await fsp.writeFile(path, content);
  },

  async writeFiles(files: Record<string, { content: Uint8Array }>): Promise<void> {
    await Promise.all(
      Object.entries(files).map(async ([path, file]) => {
        await this.writeFile(path, file.content);
      }),
    );
  },

  // Create a directory (recursive: true creates parent directories if needed)
  async mkdir(path: string, options?: MKDirOptions): Promise<void> {
    await fsp.mkdir(path, options);
  },

  // List directory contents
  async readdir(path: string): Promise<string[]> {
    return fsp.readdir(path);
  },

  // Get file/directory metadata
  async stat(path: string): Promise<{
    type: 'file' | 'dir';
    size: number;
    mtimeMs: number;
  }> {
    const stats = await fsp.stat(path);
    return {
      type: stats.type,
      size: stats.size,
      mtimeMs: stats.mtimeMs as number,
    };
  },

  // Rename a file or directory
  async rename(oldPath: string, newPath: string): Promise<void> {
    await fsp.rename(oldPath, newPath);
  },

  // Delete a file
  async unlink(path: string): Promise<void> {
    await fsp.unlink(path);
  },

  // Delete a directory (must be empty)
  async rmdir(path: string): Promise<void> {
    await fsp.rmdir(path);
  },

  // Get all file stats in a directory recursively as an array of file stat objects
  async getDirectoryStat(path: string): Promise<FileStat[]> {
    // Check if directory exists first - return empty array if it doesn't
    const directoryExists = await this.exists(path);
    if (!directoryExists) {
      return [];
    }

    const fileStats: FileStat[] = [];

    async function collectStatsRecursive(currentPath: string, basePath: string): Promise<void> {
      const entries = await fsp.readdir(currentPath);

      for (const entry of entries) {
        const fullPath = `${currentPath}/${entry}`;
        // eslint-disable-next-line no-await-in-loop -- Need to process directories sequentially
        const stats = await fsp.stat(fullPath);

        if (stats.type === 'file') {
          // Store relative path from the base directory
          const relativePath = fullPath.slice(basePath.length + 1);
          // Extract filename from relative path (get the last segment)
          const pathSegments = relativePath.split('/');
          const filename = pathSegments.at(-1) ?? relativePath;

          fileStats.push({
            path: relativePath,
            name: filename,
            type: stats.type,
            size: stats.size,
            mtimeMs: stats.mtimeMs as number,
          });
        } else {
          // eslint-disable-next-line no-await-in-loop -- Need to process directories sequentially
          await collectStatsRecursive(fullPath, basePath);
        }
      }
    }

    await collectStatsRecursive(path, path);
    return fileStats;
  },

  // Get all files in a directory recursively as a map of relative paths to file contents
  async getDirectoryContents(path: string): Promise<Record<string, Uint8Array>> {
    const fileStats = await this.getDirectoryStat(path);

    const fileContents = await Promise.all(
      fileStats.map(async (fileStat) => {
        const fullPath = `${path}/${fileStat.path}`;
        const content = await fsp.readFile(fullPath);
        return { path: fileStat.path, content };
      }),
    );

    const files: Record<string, Uint8Array> = {};
    for (const { path: filePath, content } of fileContents) {
      files[filePath] = content;
    }

    return files;
  },

  async copyDirectory(sourcePath: string, destinationPath: string): Promise<void> {
    const files = await this.getDirectoryContents(sourcePath);
    const destinationFiles: Record<string, { content: Uint8Array }> = {};

    for (const [relativePath, content] of Object.entries(files)) {
      destinationFiles[`${destinationPath}/${relativePath}`] = { content };
    }

    await this.writeFiles(destinationFiles);
  },

  async getZippedDirectory(path: string): Promise<Blob> {
    const zip = new JSZip();
    const files = await this.getDirectoryContents(path);

    for (const [relativePath, content] of Object.entries(files)) {
      zip.file(relativePath, content);
    }

    return zip.generateAsync({ type: 'blob' });
  },
};
