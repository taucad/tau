/**
 * The sessions registry, handed down from `root.tsx` (S44, A38).
 *
 * The actor itself is created with `createActor` in `sessions-store.ts`; this
 * only starts it, mirrors the app-level handles it needs, and gives readers a
 * selector. Nothing here uses `useActorRef`, so Strict Mode's mount → stop →
 * rehydrate cycle cannot double-start every live project.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import { Button } from '@taucad/ui/components/button';
import { onDesktopQuitRequested, reportDesktopQuiesced } from '#filesystem/desktop-bridge.js';
import { sessionsPendingRevisions } from '#machines/sessions.machine.js';
import {
  selectProjectLiveness,
  selectProjectSession,
  sessionsActor,
  setSharedFileManagerWorker,
  startSessionsActor,
} from '#services/sessions-store.js';
import type { ProjectLivenessStatus } from '#services/sessions-store.js';
import { useSharedFileManagerWorker } from '#hooks/use-file-manager.js';
import { BudgetRefusedDialog } from '#components/nav/project-close-dialogs.js';

type SessionsActor = ActorRefFrom<typeof sessionsMachine>;

const SessionsContext = createContext<SessionsActor | undefined>(undefined);

/**
 * Start the registry and hand it down.
 *
 * @param props - The subtree that reads the registry.
 * @returns The provider element.
 */
export function SessionsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  /* Lazily, not in the render body: the module singleton is started once and
   * React's own initializer is the sanctioned place for that (R16). */
  const [actor] = useState(startSessionsActor);
  const worker = useSharedFileManagerWorker();

  useEffect(() => {
    setSharedFileManagerWorker(worker);
  }, [worker]);

  /* The budget is a visible refusal that names what to close (I28) — never a
   * silent drop, and never a surprise close of somebody else's project. The
   * refusal's surface is `BudgetRefusedDialog` in the sidebar (W20), which
   * subscribes to the same `budgetRefused` and can name the candidates because
   * it has the project list; a toast here as well would say the same thing
   * twice and neither would offer the verb. */

  return (
    <SessionsContext.Provider value={actor}>
      {children}
      <SessionsQuitHold />
      {/* R5: the refusal's one surface, mounted above every route. Inside the
          sidebar it was a Radix sheet's child on mobile, unmounted while
          closed — exactly where the budget bites hardest (I28). */}
      <BudgetRefusedDialog />
    </SessionsContext.Provider>
  );
}

/**
 * The quit hold's renderer half (D31, P49).
 *
 * Main asks; every live session runs its own `closing` — cancel the runs,
 * flush the sync through W13's seam, release the leases — and the person sees
 * what is being waited for and can cut it short. `quiesced` answers main,
 * which then quiesces the services utility and disposes.
 *
 * The browser needs nothing here: `pagehide` is its quit, and W13's
 * `use-flush-on-close` already flushes every registrant there. A `quit` sent
 * on `pagehide` could not be awaited anyway — the document is going.
 *
 * @returns The overlay, while quit is held.
 */
function SessionsQuitHold(): React.JSX.Element | undefined {
  const actor = useSessions();
  const [held, setHeld] = useState(false);
  const pending = useSelector(actor, (state) => sessionsPendingRevisions(state.context));

  useEffect(() => {
    const subscription = actor.on('quiesced', (event) => {
      reportDesktopQuiesced(event.forced);
      setHeld(false);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [actor]);

  useEffect(() => {
    return onDesktopQuitRequested(() => {
      if (actor.getSnapshot().status === 'done') {
        reportDesktopQuiesced(false);
        return;
      }
      setHeld(true);
      actor.send({ type: 'quit' });
    });
  }, [actor]);

  if (!held) {
    return undefined;
  }

  return (
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm'
      role='status'
      aria-live='polite'
    >
      <div className='max-w-sm space-y-3 text-center'>
        <p className='text-sm'>
          {pending === 0
            ? 'Closing your projects…'
            : `Backing up ${pending} ${pending === 1 ? 'revision' : 'revisions'}, then closing…`}
        </p>
        <Button
          type='button'
          variant='ghost'
          onClick={() => {
            actor.send({ type: 'quitAnyway' });
          }}
        >
          Quit anyway
        </Button>
      </div>
    </div>
  );
}

/** The registry actor. @public */
export function useSessions(): SessionsActor {
  return useContext(SessionsContext) ?? sessionsActor;
}

/** Which projects are live, in open order — the retained set the app host renders. @public */
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
