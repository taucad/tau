import { assign, assertEvent, setup } from 'xstate';
import type { DirectoryPick } from '#constants/browser.constants.js';
import { hostPathName } from '#filesystem/desktop-bridge.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

export type PreparedWorkspaceCatalog = {
  readonly projectCount: number;
  readonly candidateCount: number;
  readonly conflictCount: number;
  publish(): Promise<void>;
};

export type RegisteredWorkspace = WorkspaceEntry & { readonly minted: boolean };

export type WorkspaceConnectionServices = {
  registerWorkspace(handle: FileSystemDirectoryHandle, signal: AbortSignal): Promise<RegisteredWorkspace>;
  mountWorkspace(workspace: RegisteredWorkspace, signal: AbortSignal): Promise<void>;
  prepareWorkspaceCatalog(workspace: RegisteredWorkspace, signal: AbortSignal): Promise<PreparedWorkspaceCatalog>;
};

type WorkspaceConnectionContext = {
  readonly services: WorkspaceConnectionServices;
  operationId: string | undefined;
  workspaceName: string | undefined;
  handle: FileSystemDirectoryHandle | undefined;
  workspace: RegisteredWorkspace | undefined;
  catalog: PreparedWorkspaceCatalog | undefined;
  error: unknown;
  failedPhase: WorkspaceConnectionFailedPhase | undefined;
};

export type WorkspaceConnectionFailedPhase = 'registering' | 'mounting' | 'discovering' | 'publishing';

type WorkspaceConnectionEvent =
  | { readonly type: 'beginSelection'; readonly operationId: string }
  | { readonly type: 'selectionCancelled' }
  | {
      readonly type: 'workspaceSelected';
      readonly operationId: string;
      readonly handle: FileSystemDirectoryHandle;
    }
  | { readonly type: 'retry' }
  | WorkspaceRegisteredEvent
  | WorkspaceCatalogPreparedEvent;

type WorkspaceRegisteredEvent = { readonly type: 'workspaceRegistered'; readonly workspace: RegisteredWorkspace };
type WorkspaceCatalogPreparedEvent = {
  readonly type: 'workspaceCatalogPrepared';
  readonly catalog: PreparedWorkspaceCatalog;
};

export type WorkspaceConnectionState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'selecting'; readonly operationId: string }
  | { readonly phase: 'registering'; readonly operationId: string; readonly workspaceName: string }
  | { readonly phase: 'mounting'; readonly operationId: string; readonly workspace: Workspace }
  | { readonly phase: 'browsing'; readonly operationId: string; readonly workspace: Workspace }
  | { readonly phase: 'discovering'; readonly operationId: string; readonly workspace: Workspace }
  | {
      readonly phase: 'publishing';
      readonly operationId: string;
      readonly workspace: Workspace;
      readonly projectCount: number;
      readonly candidateCount: number;
      readonly conflictCount: number;
    }
  | {
      readonly phase: 'ready';
      readonly operationId: string;
      readonly workspace: Workspace;
      readonly projectCount: number;
      readonly candidateCount: number;
      readonly conflictCount: number;
      readonly observation: 'starting';
    }
  | {
      readonly phase: 'failed';
      readonly operationId: string;
      readonly workspace?: Workspace;
      readonly workspaceName?: string;
      readonly failedPhase: WorkspaceConnectionFailedPhase;
      readonly message: string;
      readonly retry: 'pick-again' | 'grant-access' | 'resume';
    };

const registerWorkspaceActor = fromSafeAsync<WorkspaceRegisteredEvent, { context: WorkspaceConnectionContext }>(
  async ({ input, signal }) => {
    const { handle, services } = input.context;
    if (handle === undefined) {
      throw new Error('No workspace folder was selected.');
    }
    return { type: 'workspaceRegistered', workspace: await services.registerWorkspace(handle, signal) };
  },
);

const mountWorkspaceActor = fromSafeAsync<void, { context: WorkspaceConnectionContext }>(async ({ input, signal }) => {
  const { workspace, services } = input.context;
  if (workspace === undefined) {
    throw new Error('The workspace was not registered.');
  }
  await services.mountWorkspace(workspace, signal);
});

const yieldToBrowserActor = fromSafeAsync<void, undefined>(async ({ signal }) => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
  signal.throwIfAborted();
});

const prepareWorkspaceCatalogActor = fromSafeAsync<
  WorkspaceCatalogPreparedEvent,
  { context: WorkspaceConnectionContext }
>(async ({ input, signal }) => {
  const { workspace, services } = input.context;
  if (workspace === undefined) {
    throw new Error('The workspace was not registered.');
  }
  return { type: 'workspaceCatalogPrepared', catalog: await services.prepareWorkspaceCatalog(workspace, signal) };
});

const publishWorkspaceCatalogActor = fromSafeAsync<void, { context: WorkspaceConnectionContext }>(
  async ({ input, signal }) => {
    signal.throwIfAborted();
    const { catalog } = input.context;
    if (catalog === undefined) {
      throw new Error('The workspace catalog was not prepared.');
    }
    await catalog.publish();
    signal.throwIfAborted();
  },
);

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message.length > 0 ? error.message : 'An unexpected workspace error occurred.';

const retryKind = (context: WorkspaceConnectionContext): 'pick-again' | 'grant-access' | 'resume' => {
  if (context.failedPhase === 'registering') {
    return 'pick-again';
  }
  const permissionDenied = context.error instanceof DOMException ? context.error.name === 'NotAllowedError' : false;
  return permissionDenied ? 'grant-access' : 'resume';
};

/* oxlint-disable typescript/consistent-type-assertions -- XState's setup type slots require erased value assertions. */
export const workspaceConnectionMachine = setup({
  types: {
    context: {} as WorkspaceConnectionContext,
    events: {} as WorkspaceConnectionEvent,
    input: {} as WorkspaceConnectionServices,
  },
  actors: {
    registerWorkspaceActor,
    mountWorkspaceActor,
    yieldToBrowserActor,
    prepareWorkspaceCatalogActor,
    publishWorkspaceCatalogActor,
  },
  actions: {
    beginSelection: assign({
      operationId({ event }) {
        assertEvent(event, 'beginSelection');
        return event.operationId;
      },
      workspaceName: undefined,
      handle: undefined,
      workspace: undefined,
      catalog: undefined,
      error: undefined,
      failedPhase: undefined,
    }),
    acceptSelection: assign({
      operationId({ event }) {
        assertEvent(event, 'workspaceSelected');
        return event.operationId;
      },
      workspaceName({ event }) {
        assertEvent(event, 'workspaceSelected');
        return event.selection.backend === 'webaccess'
          ? event.selection.handle.name
          : hostPathName(event.selection.path);
      },
      selection({ event }) {
        assertEvent(event, 'workspaceSelected');
        return event.selection;
      },
    }),
    acceptRegisteredWorkspace: assign({
      workspace({ event }) {
        assertEvent(event, 'workspaceRegistered');
        return event.workspace;
      },
    }),
    acceptPreparedCatalog: assign({
      catalog({ event }) {
        assertEvent(event, 'workspaceCatalogPrepared');
        return event.catalog;
      },
    }),
  },
  guards: {
    failedWhileMounting: ({ context }) => context.failedPhase === 'mounting',
    failedWhileDiscovering: ({ context }) => context.failedPhase === 'discovering',
    failedWhilePublishing: ({ context }) => context.failedPhase === 'publishing',
  },
}).createMachine({
  id: 'workspace-connection',
  context: ({ input }) => ({
    services: input,
    operationId: undefined,
    workspaceName: undefined,
    handle: undefined,
    workspace: undefined,
    catalog: undefined,
    error: undefined,
    failedPhase: undefined,
  }),
  initial: 'idle',
  on: {
    beginSelection: { target: '.selecting', reenter: true, actions: 'beginSelection' },
  },
  states: {
    idle: {},
    selecting: {
      on: {
        selectionCancelled: 'idle',
        workspaceSelected: { target: 'registering', actions: 'acceptSelection' },
      },
    },
    registering: {
      invoke: {
        src: 'registerWorkspaceActor',
        input: ({ context }) => ({ context }),
        onDone: 'mounting',
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => event.error, failedPhase: 'registering' }),
        },
      },
      on: { workspaceRegistered: { actions: 'acceptRegisteredWorkspace' } },
    },
    mounting: {
      invoke: {
        src: 'mountWorkspaceActor',
        input: ({ context }) => ({ context }),
        onDone: 'browsing',
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => event.error, failedPhase: 'mounting' }),
        },
      },
    },
    browsing: {
      invoke: {
        src: 'yieldToBrowserActor',
        input: undefined,
        onDone: 'discovering',
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => event.error, failedPhase: 'discovering' }),
        },
      },
    },
    discovering: {
      invoke: {
        src: 'prepareWorkspaceCatalogActor',
        input: ({ context }) => ({ context }),
        onDone: 'publishing',
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => event.error, failedPhase: 'discovering' }),
        },
      },
      on: { workspaceCatalogPrepared: { actions: 'acceptPreparedCatalog' } },
    },
    publishing: {
      invoke: {
        src: 'publishWorkspaceCatalogActor',
        input: ({ context }) => ({ context }),
        onDone: 'ready',
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => event.error, failedPhase: 'publishing' }),
        },
      },
    },
    ready: {},
    failed: {
      on: {
        retry: [
          { guard: 'failedWhileMounting', target: 'mounting' },
          { guard: 'failedWhileDiscovering', target: 'discovering' },
          { guard: 'failedWhilePublishing', target: 'publishing' },
          { target: 'selecting' },
        ],
      },
    },
  },
});
/* oxlint-enable typescript/consistent-type-assertions */

export const selectWorkspaceConnectionState = (snapshot: {
  readonly value: unknown;
  readonly context: WorkspaceConnectionContext;
}): WorkspaceConnectionState => {
  const phase = String(snapshot.value) as WorkspaceConnectionState['phase'];
  const { operationId, workspaceName, workspace, catalog, failedPhase, error } = snapshot.context;
  if (phase === 'idle') {
    return { phase };
  }
  if (phase === 'selecting') {
    return { phase, operationId: operationId! };
  }
  if (phase === 'registering') {
    return { phase, operationId: operationId!, workspaceName: workspaceName! };
  }
  if (phase === 'mounting' || phase === 'browsing' || phase === 'discovering') {
    return { phase, operationId: operationId!, workspace: workspace!.workspace };
  }
  if (phase === 'publishing') {
    return {
      phase,
      operationId: operationId!,
      workspace: workspace!.workspace,
      projectCount: catalog!.projectCount,
      candidateCount: catalog!.candidateCount,
      conflictCount: catalog!.conflictCount,
    };
  }
  if (phase === 'ready') {
    return {
      phase,
      operationId: operationId!,
      workspace: workspace!.workspace,
      projectCount: catalog!.projectCount,
      candidateCount: catalog!.candidateCount,
      conflictCount: catalog!.conflictCount,
      observation: 'starting',
    };
  }
  return {
    phase: 'failed',
    operationId: operationId!,
    ...(workspace === undefined ? {} : { workspace: workspace.workspace }),
    ...(workspaceName === undefined ? {} : { workspaceName }),
    failedPhase: failedPhase!,
    message: errorMessage(error),
    retry: retryKind(snapshot.context),
  };
};

export type WorkspaceConnectionMachine = typeof workspaceConnectionMachine;
