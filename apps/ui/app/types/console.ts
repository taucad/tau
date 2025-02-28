// Log level constants
export const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
  TRACE: 'TRACE',
} as const;

// Define log levels as string literals instead of enum
export type LogLevel = keyof typeof LOG_LEVELS;

export type LogOrigin = {
  component?: string;
  operation?: string;
};

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  origin?: LogOrigin;
  data?: string | Record<string, unknown>;
}

export interface LogOptions {
  level?: LogLevel;
  origin?: LogOrigin;
  data?: string | Record<string, unknown>;
}
