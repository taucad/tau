/**
 * The sessions registry, handed down from `root.tsx` (S44, A38).
 *
 * The app runtime creates the registry as its `sessions` child (D5); the
 * provider reads it from the runtime, mirrors the app-level handles it needs,
 * and gives readers a selector. It creates and starts nothing, so neither
 * Strict Mode nor a remount below the billing fence makes a second registry
 * (B9).
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import { Button } from '@taucad/ui/components/button';
import { sessionsPendingRevisions } from '#machines/sessions.machine.js';
import { selectProjectLiveness, selectProjectSession } from '#services/sessions-store.js';
import { selectQuitHold, selectRuntimeFocus, selectRuntimeSessions } from '#runtime/app-runtime.js';
import type { AppRuntime } from '#runtime/app-runtime.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import type { FocusHandle } from '#runtime/app-runtime-focus.js';
import type { ProjectLivenessStatus } from '#services/sessions-store.js';
import { BudgetRefusedDialog } from '#components/nav/project-close-dialogs.js';

type SessionsActor = ActorRefFrom<typeof sessionsMachine>;

const SessionsContext = createContext<SessionsActor | undefined>(undefined);
const FocusContext = createContext<FocusHandle | undefined>(undefined);

/**
 * Hand down the runtime's registry and focus.
 *
 * @param props - The subtree that reads the registry, and a started registry and focus a test composes instead.
 * @returns The provider element.
 */
export function SessionsProvider({
  children,
  actor: composed,
  focus: composedFocus,
}: {
  readonly children: ReactNode;
  readonly actor?: SessionsActor;
  readonly focus?: FocusHandle;
}): React.JSX.Element {
  /* The runtime's `sessions` and `focus` children, fixed for the runtime's life; `AppRuntimeProvider` starts them
   * after hydration. */
  const runtime = useOptionalAppRuntime();
  const actor = composed ?? (runtime === undefined ? undefined : selectRuntimeSessions(runtime));
  if (actor === undefined) {
    throw new Error('SessionsProvider must be used within <AppRuntimeProvider>');
  }
  const focus = composedFocus ?? (runtime === undefined ? undefined : selectRuntimeFocus(runtime));
  /* The budget is a visible refusal that names what to close (I28) — never a
   * silent drop, and never a surprise close of somebody else's project. The
   * refusal's surface is `BudgetRefusedDialog` in the sidebar (W20), which
   * subscribes to the same `budgetRefused` and can name the candidates because
   * it has the project list; a toast here as well would say the same thing
   * twice and neither would offer the verb. */

  return (
    <SessionsContext.Provider value={actor}>
      <FocusContext.Provider value={focus}>
        {children}
        {runtime === undefined ? null : <SessionsQuitHold runtime={runtime} actor={actor} />}
        {/* R5: the refusal's one surface, mounted above every route. Inside the
            sidebar it was a Radix sheet's child on mobile, unmounted while
            closed — exactly where the budget bites hardest (I28). */}
        <BudgetRefusedDialog />
      </FocusContext.Provider>
    </SessionsContext.Provider>
  );
}

/**
 * The quit hold's renderer half (D31, P49).
 *
 * `environment` runs the hold (D26): main asks, the unload producers flush first (W15), then every live session runs
 * its own `closing`, and the person sees what is being waited for and can cut it short. This renders what
 * `environment` reported, and its two buttons are the person's commands.
 *
 * @param props - The runtime whose hold this shows, and its registry.
 * @returns The overlay, while quit is held.
 */
function SessionsQuitHold({
  runtime,
  actor,
}: {
  readonly runtime: AppRuntime;
  readonly actor: SessionsActor;
}): React.ReactPortal | undefined {
  const { held, error: flushError } = useSelector(runtime, selectQuitHold);
  const pending = useSelector(actor, (state) => sessionsPendingRevisions(state.context));

  if (!held) {
    return undefined;
  }

  // On the shared overlay layer (z-50), portalled as it appears so it covers whatever overlay is already open. App
  // shortcuts stay off while focus is inside it, so none opens a surface (such as the sidebar sheet) under it.
  return createPortal(
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm'
      role='status'
      aria-live='polite'
      data-shortcut-scope='session-quit-hold'
    >
      <div className='max-w-sm space-y-3 text-center'>
        <p className='text-sm'>
          {flushError ??
            (pending === 0
              ? 'Closing your projects…'
              : `Backing up ${pending} ${pending === 1 ? 'change' : 'changes'}, then closing…`)}
        </p>
        {flushError ? (
          <Button
            type='button'
            onClick={() => {
              runtime.send({ type: 'quitRetried' });
            }}
          >
            Try again
          </Button>
        ) : null}
        <Button
          type='button'
          variant='ghost'
          onClick={() => {
            if (flushError) {
              actor.send({ type: 'quit' });
            }
            actor.send({ type: 'quitAnyway' });
          }}
        >
          Quit anyway
        </Button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Focus and the bindings its ports read (D7), from the runtime or the test that composed them.
 *
 * @returns The focus handle.
 * @public
 */
export function useFocus(): FocusHandle {
  const focus = useContext(FocusContext);
  if (focus === undefined) {
    throw new Error('useFocus must be used within <SessionsProvider> over a runtime or a composed focus');
  }
  return focus;
}

/** The registry actor. @public */
export function useSessions(): SessionsActor {
  const actor = useContext(SessionsContext);
  if (actor === undefined) {
    throw new Error('useSessions must be used within <SessionsProvider>');
  }
  return actor;
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
