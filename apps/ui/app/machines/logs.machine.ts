import { setup, types } from 'xstate';
import { logLevels } from '@taucad/types/constants';
import type { LogEntry, LogOptions } from '@taucad/types';
import { LogRingBuffer } from '#utils/log-ring-buffer.js';
import { eventSchemas } from '#lib/xstate.lib.js';

const defaultMaxLogs = 1000;
let logIdCounter = 0;

type LogMachineContext = {
  logBuffer: LogRingBuffer<LogEntry>;
  logVersion: number;
};

type LogMachineEvents =
  | { type: 'addLog'; message: string; options?: LogOptions }
  | {
      type: 'addLogs';
      entries: Array<{ message: string; options?: LogOptions }>;
    }
  | { type: 'clearLogs' };

export const logMachine = setup({
  schemas: {
    context: types<LogMachineContext>(),
    events: eventSchemas<LogMachineEvents>(),
  },
}).createMachine({
  id: 'logs',
  initial: 'ready',
  context: () => ({
    logBuffer: new LogRingBuffer<LogEntry>(defaultMaxLogs),
    logVersion: 0,
  }),

  states: {
    ready: {
      on: {
        addLog: ({ context, event }) => {
          // Intentional mutation: LogRingBuffer is a mutable data structure by design.
          // The logVersion counter is the reactive trigger for re-renders.
          context.logBuffer.push({
            id: `log_${String(logIdCounter++)}`,
            timestamp: Date.now(),
            level: event.options?.level ?? logLevels.info,
            message: event.message,
            origin: event.options?.origin,
            data: event.options?.data,
          });
          return { context: { logVersion: context.logBuffer.version } };
        },
        addLogs: ({ context, event }) => {
          const now = Date.now();
          for (const entry of event.entries) {
            context.logBuffer.push({
              id: `log_${String(logIdCounter++)}`,
              timestamp: now,
              level: entry.options?.level ?? logLevels.info,
              message: entry.message,
              origin: entry.options?.origin,
              data: entry.options?.data,
            });
          }

          return { context: { logVersion: context.logBuffer.version } };
        },
        clearLogs: ({ context }) => {
          context.logBuffer.clear();
          return { context: { logVersion: context.logBuffer.version } };
        },
      },
    },
  },
});
