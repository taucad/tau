import type { logLevels } from '#constants/logger.constants.js';

/**
 * Log level type derived from logLevels constant.
 *
 * @public
 */
export type LogLevel = (typeof logLevels)[keyof typeof logLevels];

/**
 * Origin information for a log entry.
 *
 * @public
 */
export type LogOrigin = {
  component?: string;
  operation?: string;
  file?: string;
};

/**
 * Complete log entry with all metadata.
 *
 * @public
 */
export type LogEntry = {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  origin?: LogOrigin;
  data?: unknown;
};

/**
 * Options for creating a log entry.
 *
 * @public
 */
export type LogOptions = Pick<LogEntry, 'level' | 'origin' | 'data'>;

/**
 * Log entry from a worker (without id and timestamp).
 *
 * @public
 */
export type WorkerLog = Pick<LogEntry, 'level' | 'message' | 'origin' | 'data'>;

/**
 * Callback type for receiving worker log entries.
 *
 * @public
 */
export type OnWorkerLog = (log: WorkerLog) => void;
