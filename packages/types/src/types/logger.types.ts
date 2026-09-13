import type { logLevels } from '#constants/logger.constants.js';

/**
 * Log level type derived from logLevels constant.
 */
export type LogLevel = (typeof logLevels)[keyof typeof logLevels];

/**
 * Origin information for a log entry.
 */
export type LogOrigin = {
  component?: string;
  operation?: string;
  file?: string;
};

/**
 * Complete log entry with all metadata.
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
 */
export type LogOptions = Pick<LogEntry, 'level' | 'origin' | 'data'>;

/**
 * Log entry from a worker (without id and timestamp).
 */
export type WorkerLog = Pick<LogEntry, 'level' | 'message' | 'origin' | 'data'>;

/**
 * Callback type for receiving worker log entries.
 */
export type OnWorkerLog = (log: WorkerLog) => void;
