/**
 * Log level constants for kernel and worker logging.
 */
export const logLevels = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'trace',
} as const satisfies Record<string, string>;
