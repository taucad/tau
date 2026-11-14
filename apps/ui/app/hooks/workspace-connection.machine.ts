import { setup, types } from 'xstate';
import type { DirectoryPick } from '#constants/browser.constants.js';
import { hostPathName } from '#filesystem/desktop-bridge.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { eventSchemas, fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { faultMessage, reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';

export type PreparedWorkspaceCatalog = {
  readonly projectCount: number;
  readonly candidateCount: number;
  readonly conflictCount: number;
  publish(): Promise<void>;
};

/**
 * A workspace row plus whether this connection minted its identity.
 *
 * Deliberately carries no handle: a node selection is an absolute host path,
 * and every consumer that still needs the picked directory reads it from the
 * machine's `selection` instead.
 */
export type RegisteredWorkspace = { readonly workspace: Workspace; readonly minted: boolean };

export type WorkspaceConnectionServices = {
  registerWorkspace(selection: DirectoryPick, signal: AbortSignal): Promise<RegisteredWorkspace>;
  mountWorkspace(workspace: RegisteredWorkspace, selection: DirectoryPick, signal: AbortSignal): Promise<void>;
  prepareWorkspaceCatalog(workspace: RegisteredWorkspace, signal: AbortSignal): Promise<PreparedWorkspaceCatalog>;
};

type WorkspaceConnectionContext = {
  readonly services: WorkspaceConnectionServices;
  operationId: string | undefined;
  workspaceName: string | undefined;
  selection: DirectoryPick | undefined;
  workspace: RegisteredWorkspace | undefined;
  catalog: PreparedWorkspaceCatalog | undefined;
  error: unknown;
  failedPhase: WorkspaceConnectionFailedPhase | undefined;
  /** The first defect the root `onError` caught (MC-R12, D23); later ones are its consequences and are not kept. */
  fault: string | undefined;
};

export type WorkspaceConnectionFailedPhase = 'registering' | 'mounting' | 'discovering' | 'publishing';

/** Events accepted by workspaceConnectionMachine. @public */
export type WorkspaceConnectionEvent =
  | { readonly type: 'beginSelection'; readonly operationId: string }
  | { readonly type: 'selectionCancelled' }
  | {
      readonly type: 'workspaceSelected';
      readonly operationId: string;
      readonly selection: DirectoryPick;
    }
  | { readonly type: 'retry' }
  | WorkspaceRegisteredEvent
  | WorkspaceCatalogPreparedEvent;

type WorkspaceRegisteredEvent = { readonly type: 'workspaceRegistered'; readonly workspace: RegisteredWorkspace };
type WorkspaceCatalogPreparedEvent = {
  readonly type: 'workspaceCatalogPrepared';
  readonly catalog: PreparedWorkspaceCatalog;
};

/**
 * The workspace connection machine's public alphabet: every {@link WorkspaceConnectionEvent} type, in the union's
 * order. The totality test samples each one and fails when this list and the union differ.
 *
 * @public
 */
export const workspaceConnectionEventTypes = [
  'beginSelection',
  'selectionCancelled',
  'workspaceSelected',
  'retry',
  'workspaceRegistered',
  'workspaceCatalogPrepared',
] as const satisfies ReadonlyArray<WorkspaceConnectionEvent['type']>;

const workspaceConnectionStates = [
  'idle',
  'selecting',
  'registering',
  'mounting',
  'browsing',
  'discovering',
  'publishing',
  'ready',
  'failed',
] as const;

/** Every state but the ones named, for a pair the machine answers in those states only. */
const workspaceConnectionStatesExcept = (...answered: ReadonlyArray<(typeof workspaceConnectionStates)[number]>) =>
  workspaceConnectionStates.filter((state) => !answered.includes(state));

/**
 * The (state, event) pairs this machine leaves unanswered today (MC-R17): the totality baseline, one pair per
 * state where no transition takes the event. `beginSelection` is answered at the root, in every state.
 *
 * - `selectionCancelled` and `workspaceSelected` outside `selecting`: the picker answered a pick no longer open.
 * - `retry` outside `failed`: there is no failed step to resume.
 * - `workspaceRegistered` outside `registering` and `workspaceCatalogPrepared` outside `discovering`: an effect's
 *   report lands only while its invoke runs.
 *
 * @public
 */
export const workspaceConnectionIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ...workspaceConnectionStatesExcept('selecting').flatMap((state) => [
    [state, 'selectionCancelled'] as const,
    [state, 'workspaceSelected'] as const,
  ]),
  ...workspaceConnectionStatesExcept('failed').map((state) => [state, 'retry'] as const),
  ...workspaceConnectionStatesExcept('registering').map((state) => [state, 'workspaceRegistered'] as const),
  ...workspaceConnectionStatesExcept('discovering').map((state) => [state, 'workspaceCatalogPrepared'] as const),
];

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
    const { selection, services } = input.context;
    if (selection === undefined) {
      throw new Error('No workspace folder was selected.');
    }
    return { type: 'workspaceRegistered', workspace: await services.registerWorkspace(selection, signal) };
  },
);

const mountWorkspaceActor = fromSafeAsync<void, { context: WorkspaceConnectionContext }>(async ({ input, signal }) => {
  const { selection, workspace, services } = input.context;
  if (workspace === undefined || selection === undefined) {
    throw new Error('The workspace was not registered.');
  }
  await services.mountWorkspace(workspace, selection, signal);
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

/* A failed step remembers why and where, so `retry` resumes there. */
const failedIn = (phase: WorkspaceConnectionFailedPhase) => ({
  target: 'failed',
  context: ({ event }: Readonly<{ event: Readonly<{ error: unknown }> }>) => ({
    error: event.error,
    failedPhase: phase,
  }),
});

export const workspaceConnectionMachine = setup({
  schemas: {
    context: types<WorkspaceConnectionContext>(),
    events: eventSchemas<WorkspaceConnectionEvent>(),
    input: types<WorkspaceConnectionServices>(),
  },
  actors: {
    registerWorkspaceActor,
    mountWorkspaceActor,
    yieldToBrowserActor,
    prepareWorkspaceCatalogActor,
    publishWorkspaceCatalogActor,
  },
}).createMachine({
  id: 'workspace-connection',
  /* A defect no transition modelled is recorded and reported once, and the machine stays where it was and keeps
   * answering (MC-R12, D23, B2). Its host objects in context are accepted debt (D4): the machine is not rewritten. */
  onError: ({ context, event }, enq) => {
    if (context.fault !== undefined) {
      return {};
    }
    enq(() => {
      reportAppRuntimeFault(event.error);
    });
    return { context: { fault: faultMessage(event.error, 'workspace connection fault') } };
  },
  context: ({ input }) => ({
    services: input,
    operationId: undefined,
    workspaceName: undefined,
    selection: undefined,
    workspace: undefined,
    catalog: undefined,
    error: undefined,
    failedPhase: undefined,
    fault: undefined,
  }),
  initial: 'idle',
  on: {
    beginSelection: {
      target: '.selecting',
      reenter: true,
      context: ({ event }) => ({
        operationId: event.operationId,
        workspaceName: undefined,
        selection: undefined,
        workspace: undefined,
        catalog: undefined,
        error: undefined,
        failedPhase: undefined,
      }),
    },
  },
  states: {
    idle: {},
    selecting: {
      on: {
        selectionCancelled: { target: 'idle' },
        workspaceSelected: {
          target: 'registering',
          context: ({ event }) => ({
            operationId: event.operationId,
            workspaceName:
              event.selection.backend === 'webaccess'
                ? event.selection.handle.name
                : hostPathName(event.selection.path),
            selection: event.selection,
          }),
        },
      },
    },
    registering: {
      invoke: {
        src: 'registerWorkspaceActor',
        input: ({ context }) => ({ context }),
        onDone: { target: 'mounting' },
        onError: failedIn('registering'),
      },
      on: { workspaceRegistered: { context: ({ event }) => ({ workspace: event.workspace }) } },
    },
    mounting: {
      invoke: {
        src: 'mountWorkspaceActor',
        input: ({ context }) => ({ context }),
        onDone: { target: 'browsing' },
        onError: failedIn('mounting'),
      },
    },
    browsing: {
      invoke: {
        src: 'yieldToBrowserActor',
        input: undefined,
        onDone: { target: 'discovering' },
        onError: failedIn('discovering'),
      },
    },
    discovering: {
      invoke: {
        src: 'prepareWorkspaceCatalogActor',
        input: ({ context }) => ({ context }),
        onDone: { target: 'publishing' },
        onError: failedIn('discovering'),
      },
      on: { workspaceCatalogPrepared: { context: ({ event }) => ({ catalog: event.catalog }) } },
    },
    publishing: {
      invoke: {
        src: 'publishWorkspaceCatalogActor',
        input: ({ context }) => ({ context }),
        onDone: { target: 'ready' },
        onError: failedIn('publishing'),
      },
    },
    ready: {},
    failed: {
      on: {
        retry: ({ context }) => {
          switch (context.failedPhase) {
            case 'mounting': {
              return { target: 'mounting' };
            }
            case 'discovering': {
              return { target: 'discovering' };
            }
            case 'publishing': {
              return { target: 'publishing' };
            }
            default: {
              return { target: 'selecting' };
            }
          }
        },
      },
    },
  },
});

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
