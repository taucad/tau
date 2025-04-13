// Log level constants
export const logLevels = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
  trace: 'TRACE',
} as const satisfies Record<string, string>;

// Define log levels as string literals instead of enum
export type LogLevel = (typeof logLevels)[keyof typeof logLevels];

export type LogOrigin = {
  component?: string;
  operation?: string;
};

export type LogEntry = {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  origin?: LogOrigin;
  data?: unknown;
};

export type LogOptions = {
  level?: LogLevel;
  origin?: LogOrigin;
  data?: unknown;
};
