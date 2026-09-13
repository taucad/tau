/**
 * The sessions registry, handed down from `root.tsx` (S44, A38).
 *
 * The actor itself is created with `createActor` in `sessions-store.ts`; this
 * only starts it, mirrors the app-level handles it needs, and gives readers a
 * selector. Nothing here uses `useActorRef`, so Strict Mode's mount → stop →
 * rehydrate cycle cannot double-start every live project.
 */

import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSelector } from '@xstate/react';
import { toast } from 'sonner';
import type { ActorRefFrom } from 'xstate';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import {
  selectProjectLiveness,
  selectProjectSession,
  sessionsActor,
  setSharedFileManagerWorker,
  startSessionsActor,
} from '#services/sessions-store.js';
import type { ProjectLivenessStatus } from '#services/sessions-store.js';
import { useSharedFileManagerWorker } from '#hooks/use-file-manager.js';

type SessionsActor = ActorRefFrom<typeof sessionsMachine>;

const SessionsContext = createContext<SessionsActor | undefined>(undefined);

/**
 * Start the registry and hand it down.
 *
 * @param props - The subtree that reads the registry.
 * @returns The provider element.
 */
export function SessionsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const actor = startSessionsActor();
  const worker = useSharedFileManagerWorker();

  useEffect(() => {
    setSharedFileManagerWorker(worker);
  }, [worker]);

  useEffect(() => {
    /* The budget is a visible refusal that names what to close (I28) — never a
     * silent drop, and never a surprise close of somebody else's project. */
    const subscription = actor.on('budgetRefused', (event) => {
      toast.error('Too many projects are open', {
        description:
          event.suggestions.length > 0
            ? 'Close an idle project first — the sidebar lists the ones you have not touched.'
            : 'Every open project is busy. Finish or stop one before opening another.',
      });
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [actor]);

  return <SessionsContext.Provider value={actor}>{children}</SessionsContext.Provider>;
}

/** The registry actor. @public */
export function useSessions(): SessionsActor {
  return useContext(SessionsContext) ?? sessionsActor;
}

/** Which projects are live, in open order — the retained set the route renders. @public */
export function useLiveProjectIds(): readonly string[] {
  const references = useSelector(useSessions(), (state) => state.context.refs);
  return useMemo(() => Object.keys(references), [references]);
}

/** One project's session actor, while it is live. @public */
export function useProjectSession(projectId: string): ProjectSessionActorRef | undefined {
  return useSelector(useSessions(), (state) => selectProjectSession(state.context, projectId));
}

/** The registry's half of one project's row, for the sidebar W20 builds. @public */
export function useProjectLiveness(projectId: string): ProjectLivenessStatus {
  return useSelector(
    useSessions(),
    (state) => selectProjectLiveness(state.context, projectId),
    (left, right) =>
      left.live === right.live &&
      left.status === right.status &&
      left.closedReason === right.closedReason &&
      left.policyRefusal === right.policyRefusal,
  );
}
