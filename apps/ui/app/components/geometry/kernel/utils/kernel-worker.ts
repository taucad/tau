import type {
  ComputeGeometryResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
  GeometryFile,
} from '@taucad/types';
import { logLevels } from '#types/console.types';
import type { OnWorkerLog } from '#types/console.types';

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
   * Extract code from a GeometryFile as a UTF-8 string.
   *
   * @param file - The geometry file to extract code from.
   * @returns The code as a string.
   */
  protected static extractCodeFromFile(file: GeometryFile): string {
    const decoder = new TextDecoder('utf8');
    return decoder.decode(file.data);
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
   * The name of the worker.
   *
   * @example ReplicadWorker, TauWorker, ZooWorker.
   */
  protected abstract readonly name: string;

  /**
   * The constructor for the worker.
   */
  public constructor() {
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
   * Check if this worker can handle the given file.
   * This is a lightweight check that should not require heavy initialization.
   *
   * @param file - The geometry file to check.
   * @returns True if this worker can handle the file, false otherwise.
   */
  public abstract canHandle(file: GeometryFile): Promise<boolean>;

  /**
   * Compute geometry from a file.
   *
   * @param file - The geometry file to compute geometry from.
   * @param parameters - The parameters to use when computing geometry.
   * @param geometryId - The geometry ID to use when computing geometry.
   * @returns The computed geometry.
   */
  public abstract computeGeometry(
    file: GeometryFile,
    parameters: Record<string, unknown>,
    geometryId?: string,
  ): Promise<ComputeGeometryResult>;

  /**
   * Extract parameters from a file.
   *
   * @param file - The geometry file to extract parameters from.
   * @returns The extracted parameters.
   */
  public abstract extractParameters(file: GeometryFile): Promise<ExtractParametersResult>;

  /**
   * Export geometry.
   *
   * @param fileType - The file type to export the geometry as.
   * @param geometryId - The geometry ID to export the geometry from.
   * @param meshConfig - The mesh configuration to use when exporting the geometry.
   * @returns The exported geometry.
   */
  public abstract exportGeometry(
    fileType: ExportFormat,
    geometryId?: string,
    meshConfig?: { linearTolerance: number; angularTolerance: number },
  ): Promise<ExportGeometryResult>;

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
      origin: { component: this.constructor.name, operation: options?.operation },
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
      origin: { component: this.constructor.name, operation: options?.operation },
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
      origin: { component: this.constructor.name, operation: options?.operation },
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
      origin: { component: this.constructor.name, operation: options?.operation },
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
      origin: { component: this.constructor.name, operation: options?.operation },
      data: options?.data,
    });
  }
}
