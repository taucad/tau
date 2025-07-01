import { useCallback, useMemo } from 'react';
import type { LogOptions, LogOrigin, LogEntry } from '~/types/console.js';
import { logLevels } from '~/types/console.js';
import { logActor } from '~/machines/logs.machine.js';

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
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- useing type inference
export function useLogs(options: UseConsoleOptions = {}) {
  const { defaultOrigin } = options;

  // Function to send events to the actor
  const addLog = useCallback((message: string, options?: LogOptions) => {
    logActor.send({ type: 'addLog', message, options });
  }, []);

  const addLogs = useCallback((entries: Array<{ message: string; options?: LogOptions }>) => {
    logActor.send({ type: 'addLogs', entries });
  }, []);

  const clear = useCallback(() => {
    logActor.send({ type: 'clearLogs' });
  }, []);

  const setLogs = useCallback((logs: LogEntry[]) => {
    logActor.send({ type: 'setLogs', logs });
  }, []);
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

  return useMemo(
    () => ({
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
      clear,
    }),
    [error, warn, info, debug, trace, addLog, addLogs, setLogs, clear],
  );
}
