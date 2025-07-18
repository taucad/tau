import { setup, fromCallback, assign } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '~/machines/cad.machine.js';

type ExportFormat = 'stl' | 'stl-binary' | 'step' | 'step-assembly';

// Context
type ExportGeometryContext = {
  cadRef: ActorRefFrom<typeof cadMachine>;
  activeRequest?: {
    format: ExportFormat;
    onSuccess: (blob: Blob, format: string) => void;
    onError: (error: string) => void;
  };
};

// Events
type ExportGeometryEvent =
  | {
      type: 'requestExport';
      format: ExportFormat;
      onSuccess: (blob: Blob, format: string) => void;
      onError: (error: string) => void;
    }
  | { type: 'exportCompleted'; blob: Blob; format: string }
  | { type: 'exportFailed'; error: string };

// Input
type ExportGeometryInput = {
  cadRef: ActorRefFrom<typeof cadMachine>;
};

// CAD listener actor - handles subscriptions to CAD machine events
const cadListener = fromCallback<ExportGeometryEvent, { cadRef: ActorRefFrom<typeof cadMachine> }>(
  ({ sendBack, input }) => {
    const { cadRef } = input;

    // Subscribe to geometry export events
    const exportSubscription = cadRef.on('geometryExported', (event) => {
      sendBack({
        type: 'exportCompleted',
        blob: event.blob,
        format: event.format,
      });
    });

    // Cleanup function
    return () => {
      exportSubscription.unsubscribe();
    };
  },
);

export const exportGeometryMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    context: {} as ExportGeometryContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as ExportGeometryEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    input: {} as ExportGeometryInput,
  },
  actors: {
    cadListener,
  },
  actions: {
    setActiveRequest: assign({
      activeRequest({ event }) {
        if (event.type !== 'requestExport') return undefined;
        return {
          format: event.format,
          onSuccess: event.onSuccess,
          onError: event.onError,
        };
      },
    }),
    clearActiveRequest: assign({
      activeRequest: undefined,
    }),
    sendExportRequest({ context }) {
      if (!context.activeRequest) return;
      context.cadRef.send({
        type: 'exportGeometry',
        format: context.activeRequest.format,
      });
    },
    handleExportSuccess({ context, event }) {
      if (event.type !== 'exportCompleted' || !context.activeRequest) return;
      try {
        context.activeRequest.onSuccess(event.blob, event.format);
      } catch (error) {
        console.error('Error in export success callback:', error);
      }
    },
    handleExportError({ context, event }) {
      if (event.type !== 'exportFailed' || !context.activeRequest) return;
      try {
        context.activeRequest.onError(event.error);
      } catch (error) {
        console.error('Error in export error callback:', error);
      }
    },
  },
}).createMachine({
  id: 'exportGeometry',
  context: ({ input }) => ({
    cadRef: input.cadRef,
    activeRequest: undefined,
  }),
  initial: 'idle',
  invoke: {
    id: 'cadListener',
    src: 'cadListener',
    input: ({ context }) => ({ cadRef: context.cadRef }),
  },
  states: {
    idle: {
      on: {
        requestExport: {
          target: 'exporting',
          actions: ['setActiveRequest', 'sendExportRequest'],
        },
      },
    },
    exporting: {
      on: {
        exportCompleted: {
          target: 'idle',
          actions: ['handleExportSuccess', 'clearActiveRequest'],
        },
        exportFailed: {
          target: 'idle',
          actions: ['handleExportError', 'clearActiveRequest'],
        },
        requestExport: {
          target: 'exporting',
          actions: ['setActiveRequest', 'sendExportRequest'],
          reenter: true,
        },
      },
    },
  },
});
