import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { LogEntry, LOG_LEVELS, LogOptions } from '@/types/console';
import { generatePrefixedId } from '@/utils/id';

// Moved from types/console.ts
export interface LogContextType {
  logs: LogEntry[];
  setLogs: (logs: LogEntry[]) => void;
  addLog: (message: string, options?: LogOptions) => void;
  addLogs: (entries: Array<{ message: string; options?: LogOptions }>) => void;
  clearLogs: () => void;
  filterLogs: (predicate: (log: LogEntry) => boolean) => LogEntry[];
  maxLogs?: number;
}

const DEFAULT_MAX_LOGS = 1000;

// Create the context with a default value
const LogContext = createContext<LogContextType | undefined>(undefined);

interface LogProviderProperties {
  children: React.ReactNode;
  initialLogs?: LogEntry[];
  maxLogs?: number;
}

export const LogProvider = ({ children, initialLogs = [], maxLogs = DEFAULT_MAX_LOGS }: LogProviderProperties) => {
  const [logs, setLogsState] = useState<LogEntry[]>(initialLogs);

  // Set logs - used for initialization or complete replacement
  const setLogs = useCallback((newLogs: LogEntry[]) => {
    setLogsState(newLogs);
  }, []);

  // Add a single log entry
  const addLog = useCallback(
    (message: string, options?: LogOptions) => {
      const newLog: LogEntry = {
        id: generatePrefixedId('log'),
        timestamp: Date.now(),
        level: options?.level ?? LOG_LEVELS.INFO,
        message,
        origin: options?.origin,
        data: options?.data,
      };

      setLogsState((previousLogs) => {
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
        id: generatePrefixedId('log'),
        timestamp: Date.now(),
        level: entry.options?.level ?? LOG_LEVELS.INFO,
        message: entry.message,
        origin: entry.options?.origin,
        data: entry.options?.data,
      }));

      setLogsState((previousLogs) => {
        const updatedLogs = [...newLogs, ...previousLogs];
        // Enforce max logs limit
        return updatedLogs.slice(0, maxLogs);
      });
    },
    [maxLogs],
  );

  // Clear all logs
  const clearLogs = useCallback(() => {
    setLogsState([]);
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
      setLogs,
      addLog,
      addLogs,
      clearLogs,
      filterLogs,
      maxLogs,
    }),
    [logs, setLogs, addLog, addLogs, clearLogs, filterLogs, maxLogs],
  );

  return <LogContext.Provider value={contextValue}>{children}</LogContext.Provider>;
};

// Custom hook to use the log context
export const useLogContext = (): LogContextType => {
  const context = useContext(LogContext);

  if (!context) {
    throw new Error('useLogContext must be used within a LogProvider');
  }

  return context;
};
