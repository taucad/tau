import { useCallback, useMemo } from 'react';
import { useLogContext } from '@/contexts/log-context.js';
import type { LogLevel, LogOptions, LogOrigin } from '@/types/console.js';
import { logLevels } from '@/types/console.js';

/**
 * Options for the useConsole hook
 */
type UseConsoleOptions = {
  /**
   * Default origin for all logs created by this console instance
   */
  defaultOrigin?: LogOrigin;
};

/**
 * A hook that provides console logging functionality
 */
export const useConsole = (options: UseConsoleOptions = {}) => {
  const { logs, addLog, addLogs, clearLogs, filterLogs, setLogs } = useLogContext();
  const { defaultOrigin } = options;

  // Log messages with ERROR level
  const error = useCallback(
    (message: string, options?: Omit<LogOptions, 'level'>) => {
      addLog(message, {
        ...options,
        level: logLevels.error,
        origin: options?.origin ?? defaultOrigin,
      });
    },
    [addLog, defaultOrigin],
  );

  // Log messages with warn level
  const warn = useCallback(
    (message: string, options?: Omit<LogOptions, 'level'>) => {
      addLog(message, {
        ...options,
        level: logLevels.warn,
        origin: options?.origin ?? defaultOrigin,
      });
    },
    [addLog, defaultOrigin],
  );

  // Log messages with info level
  const info = useCallback(
    (message: string, options?: Omit<LogOptions, 'level'>) => {
      addLog(message, {
        ...options,
        level: logLevels.info,
        origin: options?.origin ?? defaultOrigin,
      });
    },
    [addLog, defaultOrigin],
  );

  // Log messages with debug level
  const debug = useCallback(
    (message: string, options?: Omit<LogOptions, 'level'>) => {
      addLog(message, {
        ...options,
        level: logLevels.debug,
        origin: options?.origin ?? defaultOrigin,
      });
    },
    [addLog, defaultOrigin],
  );

  // Log messages with trace level
  const trace = useCallback(
    (message: string, options?: Omit<LogOptions, 'level'>) => {
      addLog(message, {
        ...options,
        level: logLevels.trace,
        origin: options?.origin ?? defaultOrigin,
      });
    },
    [addLog, defaultOrigin],
  );

  // Get logs filtered by level
  const getLogsByLevel = useCallback(
    (level: LogLevel) => {
      return filterLogs((log) => log.level === level);
    },
    [filterLogs],
  );

  // Get logs filtered by origin component
  const getLogsByComponent = useCallback(
    (component: string) => {
      return filterLogs((log) => log.origin?.component === component);
    },
    [filterLogs],
  );

  // Get logs filtered by origin operation
  const getLogsByOperation = useCallback(
    (operation: string) => {
      return filterLogs((log) => log.origin?.operation === operation);
    },
    [filterLogs],
  );

  return useMemo(
    () => ({
      // Access to all logs
      logs,

      log: {
        // Log level specific methods
        error,
        warn,
        info,
        debug,
        trace,
      },

      // General logging method with custom options
      addLog,

      // Batch logging
      addLogs,

      // Initialize logs
      setLogs,

      // Clear all logs
      clear: clearLogs,

      // Filtering methods
      getLogsByLevel,
      getLogsByComponent,
      getLogsByOperation,
      filterLogs,
    }),
    [
      logs,
      error,
      warn,
      info,
      debug,
      trace,
      addLog,
      addLogs,
      setLogs,
      clearLogs,
      getLogsByLevel,
      getLogsByComponent,
      getLogsByOperation,
      filterLogs,
    ],
  );
};
