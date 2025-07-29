// Log level constants
export const logLevels = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'trace',
} as const satisfies Record<string, string>;

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

export type LogOptions = Pick<LogEntry, 'level' | 'origin' | 'data'>;

export type WorkerLog = Pick<LogEntry, 'level' | 'message' | 'origin' | 'data'>;

export type OnWorkerLog = (log: WorkerLog) => void;
