import type {
  ComputeGeometryResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
  GeometryFile,
} from '@taucad/types';
import { logLevels } from '#types/console.types';
import type { OnWorkerLog } from '#types/console.types';
import { fileManager } from '#machines/file-manager.js';
import type { FileManager } from '#machines/file-manager.js';
import type { FileReader } from '#components/geometry/kernel/utils/file-reader.js';

export abstract class KernelWorker<Options extends Record<string, unknown> = Record<string, never>> {
  /**
   * The supported export formats for the worker.
   */
  protected static readonly supportedExportFormats: ExportFormat[] = [];

  /**
   * Extract the file extension from a filename.
   * Returns the extension without the leading dot, or empty string if no extension.
   *
   * @param filename - The filename to extract the extension from.
   * @returns The file extension (e.g., 'ts', 'scad', 'kcl') or empty string.
   */
  protected static getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
      return '';
    }

    return filename.slice(lastDotIndex + 1).toLowerCase();
  }

  /**
   * The function to call when a log is emitted.
   */
  protected onLog: OnWorkerLog;

  /**
   * The options passed to the worker. These are specific to the kernel provider.
   */
  protected options!: Options;

  /**
   * The base path for relative file operations.
   * Set via setBasePath() before performing operations that need relative path resolution.
   */
  protected basePath = '';

  /**
   * FileReader interface that provides logged filesystem operations relative to basePath.
   * Initialized during initialize() and can be used by kernels that need filesystem access.
   */
  protected fileReader!: FileReader;

  /**
   * The name of the worker.
   *
   * @example ReplicadWorker, TauWorker, ZooWorker.
   */
  protected abstract readonly name: string;

  /**
   * The file manager instance.
   */
  private readonly fileManager: FileManager;

  /**
   * The constructor for the worker.
   */
  public constructor() {
    this.fileManager = fileManager;
    this.onLog = () => {
      throw new Error('onLog must be initialized before use');
    };
  }

  /**
   * Initialize the worker. This is called once when the worker is created.
   *
   * @param onLog - The function to call when a log is emitted.
   * @param options - The options passed to the worker. These are specific to the kernel provider.
   */
  public async initialize(onLog: OnWorkerLog, options: Options): Promise<void> {
    this.onLog = onLog;
    this.options = options;

    // Initialize fileReader with logged filesystem operations relative to basePath
    this.fileReader = {
      readFile: async (path: string) => this.readFile(path),
      exists: async (path: string) => this.exists(path),
      readdir: async (path: string) => this.readdir(path),
    };
  }

  /**
   * Get the supported export formats for the worker.
   *
   * @returns The supported export formats.
   */
  public getSupportedExportFormats(): ExportFormat[] {
    return (this.constructor as typeof KernelWorker).supportedExportFormats;
  }

  /**
   * Cleanup the worker. This is called when the worker is destroyed.
   *
   * This can be used to release memory, close connections, etc.
   */
  public async cleanup(): Promise<void> {
    // This is a base implementation that can be overridden.
  }

  /**
   * Entry point for checking if this worker can handle the given file.
   *
   * @param file - The geometry file to check.
   * @returns True if this worker can handle the file, false otherwise.
   */
  public async canHandleEntry(file: GeometryFile): Promise<boolean> {
    this.setBasePath(file);
    const basename = this.getBasename(file.filename);
    const extension = KernelWorker.getFileExtension(basename);
    return this.canHandle(basename, extension);
  }

  /**
   * Entry point for extracting parameters from a file.
   * Handles base path setup and timing.
   *
   * @param file - The geometry file to extract parameters from.
   * @returns The extracted parameters.
   */
  public async extractParametersEntry(file: GeometryFile): Promise<ExtractParametersResult> {
    this.setBasePath(file);
    const start = performance.now();

    const basename = this.getBasename(file.filename);
    const result = await this.extractParameters(basename);

    const duration = performance.now() - start;
    this.debug(`extractParameters completed (${duration.toFixed(2)}ms)`, { operation: 'extractParameters' });

    return result;
  }

  /**
   * Entry point for computing geometry from a file.
   * Handles base path setup and timing.
   *
   * @param file - The geometry file to compute geometry from.
   * @param parameters - The parameters to use when computing geometry.
   * @param geometryId - The geometry ID to use when computing geometry.
   * @returns The computed geometry.
   */
  public async computeGeometryEntry(
    file: GeometryFile,
    parameters: Record<string, unknown>,
    geometryId?: string,
  ): Promise<ComputeGeometryResult> {
    this.setBasePath(file);
    const start = performance.now();

    const basename = this.getBasename(file.filename);
    const result = await this.computeGeometry(basename, parameters, geometryId);

    const duration = performance.now() - start;
    this.debug(`computeGeometry completed (${duration.toFixed(2)}ms)`, { operation: 'computeGeometry' });

    return result;
  }

  /**
   * Entry point for exporting geometry.
   * Handles timing (no base path needed for export).
   *
   * @param fileType - The file type to export the geometry as.
   * @param geometryId - The geometry ID to export the geometry from.
   * @param meshConfig - The mesh configuration to use when exporting the geometry.
   * @returns The exported geometry.
   */
  public async exportGeometryEntry(
    fileType: ExportFormat,
    geometryId?: string,
    meshConfig?: { linearTolerance: number; angularTolerance: number },
  ): Promise<ExportGeometryResult> {
    // No setBasePath - export doesn't need file context
    const start = performance.now();

    const result = await this.exportGeometry(fileType, geometryId, meshConfig);

    const duration = performance.now() - start;
    this.debug(`exportGeometry completed (${duration.toFixed(2)}ms)`, { operation: 'exportGeometry' });

    return result;
  }

  /**
   * Check if this worker can handle the given file.
   * This is a lightweight check that should not require heavy initialization.
   *
   * @param params - Object containing path and extension.
   * @returns True if this worker can handle the file, false otherwise.
   */

  /**
   * Log a message.
   *
   * @param message - The message to log.
   * @param options.operation - The current operation being logged.
   * @param options.data - Additional data to log.
   */
  protected log(
    message: string,
    options?: {
      operation?: string;
      data?: unknown;
    },
  ): void {
    this.onLog({
      level: logLevels.info,
      message,
      origin: { component: this.name, operation: options?.operation },
      data: options?.data,
    });
  }

  /**
   * Log a warning message.
   *
   * @param message - The message to log.
   * @param options.operation - The current operation being logged.
   * @param options.data - Additional data to log.
   */
  protected warn(
    message: string,
    options?: {
      operation?: string;
      data?: unknown;
    },
  ): void {
    this.onLog({
      level: logLevels.warn,
      message,
      origin: { component: this.name, operation: options?.operation },
      data: options?.data,
    });
  }

  /**
   * Log an error message.
   *
   * @param message - The message to log.
   * @param options.operation - The current operation being logged.
   * @param options.data - Additional data to log.
   */
  protected error(
    message: string,
    options?: {
      operation?: string;
      data?: unknown;
    },
  ): void {
    this.onLog({
      level: logLevels.error,
      message,
      origin: { component: this.name, operation: options?.operation },
      data: options?.data,
    });
  }

  /**
   * Log a debug message.
   *
   * @param message - The message to log.
   * @param options.operation - The current operation being logged.
   * @param options.data - Additional data to log.
   */
  protected debug(
    message: string,
    options?: {
      operation?: string;
      data?: unknown;
    },
  ): void {
    this.onLog({
      level: logLevels.debug,
      message,
      origin: { component: this.name, operation: options?.operation },
      data: options?.data,
    });
  }

  /**
   * Log a trace message.
   *
   * @param message - The message to log.
   * @param options.operation - The current operation being logged.
   * @param options.data - Additional data to log.
   */
  protected trace(
    message: string,
    options?: {
      operation?: string;
      data?: unknown;
    },
  ): void {
    this.onLog({
      level: logLevels.trace,
      message,
      origin: { component: this.name, operation: options?.operation },
      data: options?.data,
    });
  }

  /**
   * Set the base path for relative file operations based on a GeometryFile.
   * Extracts the directory from the filename and combines it with the path.
   *
   * @param file - The geometry file being processed
   */
  protected setBasePath(file: GeometryFile): void {
    // Extract directory from filename (e.g., 'public/kcl-samples/axial-fan/main.kcl' -> 'public/kcl-samples/axial-fan')
    const lastSlashIndex = file.filename.lastIndexOf('/');
    const directory = lastSlashIndex === -1 ? '' : file.filename.slice(0, lastSlashIndex);

    // Combine path with directory to get the full base path
    this.basePath = directory ? `${file.path}/${directory}` : file.path;

    // Log with just the relative part (strip builds/id prefix for readability)
    const displayPath = directory || file.filename;
    this.debug(`Base path set to: ${displayPath}`, { operation: 'setBasePath' });
  }

  /**
   * Read a file relative to the current base path.
   * Resolves the relative path against basePath and logs the operation.
   *
   * @param path - Path relative to the base path
   * @param encoding - Optional encoding ('utf8' for text, omit for binary)
   * @returns The file contents as string (if utf8) or Uint8Array (if binary)
   */
  protected readFile(path: string, encoding: 'utf8'): Promise<string>;
  protected readFile(path: string): Promise<Uint8Array>;
  protected async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array> {
    const fullPath = `${this.basePath}/${path}`;
    const start = performance.now();

    this.trace(`Reading file: ${path}`, { operation: 'readFile' });

    const data = fileManager.readFile(fullPath, encoding);

    const duration = performance.now() - start;
    this.trace(`Read ${path} (${duration.toFixed(2)}ms)`, { operation: 'readFile' });

    return data;
  }

  /**
   * Check if a file exists using a path relative to the current base path.
   * Resolves the relative path against basePath and logs only the relative portion.
   *
   * @param path - Path relative to the base path
   * @returns True if the file exists
   */
  protected async exists(path: string): Promise<boolean> {
    const start = performance.now();
    const fullPath = `${this.basePath}/${path}`;
    this.trace(`Checking file exists: ${path}`, { operation: 'exists' });
    const exists = await this.fileManager.exists(fullPath);
    const duration = performance.now() - start;
    this.trace(`File ${exists ? 'exists' : 'does not exist'}: ${path} (${duration.toFixed(2)}ms)`, {
      operation: 'exists',
    });
    return exists;
  }

  /**
   * Read a directory using a path relative to the current base path.
   * Resolves the relative path against basePath and logs only the relative portion.
   *
   * @param path - Path relative to the base path
   * @returns Array of directory entry names
   */
  protected async readdir(path: string): Promise<string[]> {
    const start = performance.now();
    const fullPath = `${this.basePath}/${path}`;
    this.trace(`Reading directory: ${path}`, { operation: 'readdir' });
    const entries = await this.fileManager.readdir(fullPath);
    const duration = performance.now() - start;
    this.trace(`Read directory ${path}: ${entries.length} entries (${duration.toFixed(2)}ms)`, {
      operation: 'readdir',
    });
    return entries;
  }

  protected abstract canHandle(filename: string, extension: string): Promise<boolean>;

  /**
   * Extract parameters from a file.
   *
   * @param path - The file path relative to the base path.
   * @returns The extracted parameters.
   */
  protected abstract extractParameters(path: string): Promise<ExtractParametersResult>;

  /**
   * Compute geometry from a file.
   *
   * @param path - The file path relative to the base path.
   * @param parameters - The parameters to use when computing geometry.
   * @param geometryId - The geometry ID to use when computing geometry.
   * @returns The computed geometry.
   */
  protected abstract computeGeometry(
    path: string,
    parameters: Record<string, unknown>,
    geometryId?: string,
  ): Promise<ComputeGeometryResult>;

  /**
   * Export geometry.
   *
   * @param fileType - The file type to export the geometry as.
   * @param geometryId - The geometry ID to export the geometry from.
   * @param meshConfig - The mesh configuration to use when exporting the geometry.
   * @returns The exported geometry.
   */
  protected abstract exportGeometry(
    fileType: ExportFormat,
    geometryId?: string,
    meshConfig?: { linearTolerance: number; angularTolerance: number },
  ): Promise<ExportGeometryResult>;

  /**
   * Extract the basename (filename without directory path) from a full path.
   *
   * @param filename - The full filename path (e.g., 'public/kcl-samples/bottle/main.kcl')
   * @returns Just the basename (e.g., 'main.kcl')
   */
  private getBasename(filename: string): string {
    const lastSlashIndex = filename.lastIndexOf('/');
    return lastSlashIndex === -1 ? filename : filename.slice(lastSlashIndex + 1);
  }
}
