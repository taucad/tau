import { publicationApiCode } from '@taucad/types/constants';
import { assign, setup } from 'xstate';

type PublishVisibility = 'private' | 'public';

type UiTestPublishContext = {
  fileManagerRef: unknown;
  projectId: string;
  projectName: string;
  entryPath: string;
  parameters?: Record<string, unknown>;
  publicationId?: string;
  shareUrl?: string;
  error?: Error;
};

type UiTestPublishEvent =
  | {
      type: 'publish';
      visibility: PublishVisibility;
      title: string;
      description?: string;
      sharedEmails?: string[];
      notifyRecipients?: boolean;
    }
  | { type: 'reset' };

type UiTestPublishInput = {
  fileManagerRef: unknown;
  projectId: string;
  projectName: string;
  entryPath: string;
  parameters?: Record<string, unknown>;
};

/**
 * Deterministic publish machine stub for UI tests (no network or filesystem workers).
 * Use {@link publishOversizedProjectId} to force the error UI path.
 * Use {@link publishStalledProjectId} to hold the machine in `collectingFiles` so
 * tests can observe the in-flight UI (button label, spinner, disabled controls).
 */
export const publishOversizedProjectId = '__publish_oversized__';
export const publishStalledProjectId = '__publish_stalled__';

export const publishMachineForUiTests = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup test double
    context: {} as UiTestPublishContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup test double
    events: {} as UiTestPublishEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup test double
    input: {} as UiTestPublishInput,
  },
}).createMachine({
  id: 'publish-ui-test-double',
  context: ({ input }) => ({
    fileManagerRef: input.fileManagerRef,
    projectId: input.projectId,
    projectName: input.projectName,
    entryPath: input.entryPath,
    parameters: input.parameters,
    publicationId: undefined,
    shareUrl: undefined,
    error: undefined,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        reset: {
          actions: assign({
            shareUrl: undefined,
            error: undefined,
          }),
        },
        publish: [
          {
            guard: ({ context }) => context.projectId === publishOversizedProjectId,
            target: 'error',
            actions: assign({
              error: () => new Error(publicationApiCode.PAYLOAD_TOO_LARGE),
            }),
          },
          {
            guard: ({ context }) => context.projectId === publishStalledProjectId,
            target: 'collectingFiles',
          },
          {
            target: 'success',
            actions: assign({
              publicationId: ({ context }) => context.projectId,
              shareUrl: ({ context }) => `https://tau.example/v/${context.projectId}`,
            }),
          },
        ],
      },
    },
    collectingFiles: {},
    success: {},
    error: {},
  },
});
