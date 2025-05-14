import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LogEntry, LogOptions } from '~/types/console.js';
import { logLevels } from '~/types/console.js';
import { generatePrefixedId } from '~/utils/id.js';
import { idPrefix } from '~/constants/id.js';

// Moved from types/console.ts
export type LogContextType = {
  logs: LogEntry[];
  setLogs: (logs: LogEntry[]) => void;
  addLog: (message: string, options?: LogOptions) => void;
  addLogs: (entries: Array<{ message: string; options?: LogOptions }>) => void;
  clearLogs: () => void;
  filterLogs: (predicate: (log: LogEntry) => boolean) => LogEntry[];
  maxLogs?: number;
};

const defaultMaxLogs = 1000;
const defaultInitialLogs: LogEntry[] = [];

// Create the context with a default value
const LogContext = createContext<LogContextType | undefined>(undefined);

type LogProviderProperties = {
  readonly children: ReactNode;
  readonly initialLogs?: LogEntry[];
  readonly maxLogs?: number;
};

export function LogProvider({
  children,
  initialLogs = defaultInitialLogs,
  maxLogs = defaultMaxLogs,
}: LogProviderProperties) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);

  // Set logs - used for initialization or complete replacement
  const _setLogs = useCallback((newLogs: LogEntry[]) => {
    setLogs(newLogs);
  }, []);

  // Add a single log entry
  const addLog = useCallback(
    (message: string, options?: LogOptions) => {
      const newLog: LogEntry = {
        id: generatePrefixedId('log'),
        timestamp: Date.now(),
        level: options?.level ?? logLevels.info,
        message,
        origin: options?.origin,
        data: options?.data,
      };

      setLogs((previousLogs) => {
        const updatedLogs = [newLog, ...previousLogs];
        // Enforce max logs limit
        return updatedLogs.slice(0, maxLogs);
      });
    },
    [maxLogs],
  );

  // Add multiple log entries at once
  const addLogs = useCallback(
    (entries: Array<{ message: string; options?: LogOptions }>) => {
      const newLogs = entries.map((entry) => ({
        id: generatePrefixedId(idPrefix.log),
        timestamp: Date.now(),
        level: entry.options?.level ?? logLevels.info,
        message: entry.message,
        origin: entry.options?.origin,
        data: entry.options?.data,
      }));

      setLogs((previousLogs) => {
        const updatedLogs = [...newLogs, ...previousLogs];
        // Enforce max logs limit
        return updatedLogs.slice(0, maxLogs);
      });
    },
    [maxLogs],
  );

  // Clear all logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Filter logs based on a predicate
  const filterLogs = useCallback(
    (predicate: (log: LogEntry) => boolean) => {
      // Using a custom filter to avoid passing the function directly
      return logs.filter((log) => predicate(log));
    },
    [logs],
  );

  // Create the context value
  const contextValue = useMemo(
    () => ({
      logs,
      setLogs: _setLogs,
      addLog,
      addLogs,
      clearLogs,
      filterLogs,
      maxLogs,
    }),
    [logs, _setLogs, addLog, addLogs, clearLogs, filterLogs, maxLogs],
  );

  return <LogContext.Provider value={contextValue}>{children}</LogContext.Provider>;
}

// Custom hook to use the log context
export const useLogContext = (): LogContextType => {
  const context = useContext(LogContext);

  if (!context) {
    // Provide a mock context when used outside of provider
    return {
      logs: [],
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock implementation
      setLogs() {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock implementation
      addLog() {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock implementation
      addLogs() {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock implementation
      clearLogs() {},
      filterLogs: () => [],
      maxLogs: defaultMaxLogs,
    };
  }

  return context;
};
