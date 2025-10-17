import type { ComputeGeometryResult, ExportFormat, ExportGeometryResult, ExtractParametersResult } from '@taucad/types';
import { logLevels } from '#types/console.types';
import type { OnWorkerLog } from '#types/console.types';

export abstract class KernelWorker<Options extends Record<string, unknown> = Record<string, never>> {
  /**
   * The supported export formats for the worker.
   */
  protected static readonly supportedExportFormats: ExportFormat[] = [];

  /**
   * The function to call when a log is emitted.
   */
  protected onLog: OnWorkerLog;

  /**
   * The options passed to the worker. These are specific to the kernel provider.
   */
  protected options!: Options;

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
   * Compute geometry from code.
   *
   * @param code - The code to compute geometry from.
   * @param parameters - The parameters to use when computing geometry.
   * @param geometryId - The geometry ID to use when computing geometry.
   * @returns The computed geometry.
   */
  public abstract computeGeometry(
    code: string,
    parameters: Record<string, unknown>,
    geometryId?: string,
  ): Promise<ComputeGeometryResult>;

  /**
   * Extract parameters from code.
   *
   * @param code - The code to extract parameters from.
   * @returns The extracted parameters.
   */
  public abstract extractParameters(code: string): Promise<ExtractParametersResult>;

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
