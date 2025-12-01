import { setup, assign } from 'xstate';
import { idPrefix } from '@taucad/types/constants';
import type { LogEntry, LogOptions } from '#types/console.types.js';
import { logLevels } from '#types/console.types.js';
import { generatePrefixedId } from '@taucad/utils/id';

const defaultMaxLogs = 1000;

// Type definitions
type LogMachineContext = {
  logs: LogEntry[];
  maxLogs: number;
};

type LogMachineEvents =
  | { type: 'setLogs'; logs: LogEntry[] }
  | { type: 'addLog'; message: string; options?: LogOptions }
  | { type: 'addLogs'; entries: Array<{ message: string; options?: LogOptions }> }
  | { type: 'clearLogs' };

export const logMachine = setup({
  /* eslint-disable @typescript-eslint/consistent-type-assertions -- Required for XState's type inference */
  types: {
    context: {} as LogMachineContext,
    events: {} as LogMachineEvents,
  },
  /* eslint-enable @typescript-eslint/consistent-type-assertions -- reenabling */
}).createMachine({
  id: 'logs',
  initial: 'ready',
  context: {
    logs: [],
    maxLogs: defaultMaxLogs,
  },

  states: {
    ready: {
      on: {
        setLogs: {
          actions: assign({
            logs: ({ event }) => event.logs,
          }),
        },
        addLog: {
          actions: assign({
            logs({ context, event }) {
              const newLog: LogEntry = {
                id: generatePrefixedId(idPrefix.log),
                timestamp: Date.now(),
                level: event.options?.level ?? logLevels.info,
                message: event.message,
                origin: event.options?.origin,
                data: event.options?.data,
              };

              const updatedLogs = [newLog, ...context.logs];
              return updatedLogs.slice(0, context.maxLogs);
            },
          }),
        },
        addLogs: {
          actions: assign({
            logs({ context, event }) {
              const newLogs = event.entries.map((entry) => ({
                id: generatePrefixedId(idPrefix.log),
                timestamp: Date.now(),
                level: entry.options?.level ?? logLevels.info,
                message: entry.message,
                origin: entry.options?.origin,
                data: entry.options?.data,
              }));

              const updatedLogs = [...newLogs, ...context.logs];
              return updatedLogs.slice(0, context.maxLogs);
            },
          }),
        },
        clearLogs: {
          actions: assign({
            logs: () => [],
          }),
        },
      },
    },
  },
});
