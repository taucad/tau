import { useSyncExternalStore } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { frameHintKey, frameHintVariables, readWideFrameHint } from '#lib/frame-hint.js';
import type { WideFrameHint } from '#lib/frame-hint.js';

/** The value never changes on its own: the frame reads the hint when it renders, which a navigation causes. */
const subscribeToNothing = (): (() => void) => {
  return () => undefined;
};

/** The server has no hint: the pre-paint script's variables on `<html>` stand until the client renders. */
const noHintOnServer = (): undefined => undefined;

/** The hint for the document's current URL. A client navigation has pushed the URL before the frame renders for it. */
const readDocumentFrameHint = (): WideFrameHint | undefined => {
  const key = frameHintKey(globalThis.location.pathname);
  return key === undefined ? undefined : readWideFrameHint(key);
};

/**
 * The attribute the desktop workspace sets once its split view has sized its panes. The frame's lanes hide on that
 * commit, so in every frame exactly one set of lane boxes is drawn, and both are at the same place.
 */
export const workspaceLanesReadyAttribute = 'data-workspace-lanes';

/**
 * The persistent workspace frame (loading states UX blueprint, P-c, § Editor workspace frame, wide): the lanes' own
 * borders and backgrounds at this project's remembered widths and open state, created once and never removed while
 * the project route is in view. Every gate below it (the file-manager worker, the route chunk, the session, the
 * workspace chunk, the split view's first layout) draws nothing in its place, so the frame shows through; nothing is
 * overlaid on it and nothing fades.
 *
 * The lanes are a layer under the content (`-z-10` inside the frame's own stacking context), and read only the frame
 * hint's CSS variables, with the default layout as each variable's fallback. Before the client renders, the
 * pre-paint script has set the variables on `<html>`; once it has, the frame sets the same variables on itself from
 * the record, so a client navigation to another project draws that project's layout. Which lanes show below the
 * compact width is a container query on the frame, as the live layout decides it from the workspace's own width.
 *
 * On a phone the lanes are not drawn: the phone frame is its own (A15c). Data slots are the frame rows' contract:
 * `[data-slot=workspace-frame]` and one `[data-slot=workspace-lane]` per lane.
 *
 * @param props - The project route's content, and whether the frame is drawn: off a project route (a suite that
 *   mounts the route with no app host) the same host element stays, with no frame, so the content keeps its tree
 *   position.
 * @returns The frame with the content over it.
 */
export function WorkspaceFrame({
  children,
  isDrawn = true,
}: {
  readonly children?: React.ReactNode;
  readonly isDrawn?: boolean;
}): React.JSX.Element {
  /* The document's URL, as the pre-paint script reads it: the frame also renders in suites with no router. */
  const wide = useSyncExternalStore(subscribeToNothing, readDocumentFrameHint, noHintOnServer);

  if (!isDrawn) {
    return (
      <div className='contents'>
        {null}
        {children}
      </div>
    );
  }

  return (
    <div
      data-slot='workspace-frame'
      className={cn(
        '@container size-full bg-background md:relative md:isolate',
        /* Literal for Tailwind: `workspaceLanesReadyAttribute`. */
        '[&:has([data-workspace-lanes=ready])>[data-slot=workspace-frame-lanes]]:hidden',
      )}
      style={wide === undefined ? undefined : (frameHintVariables(wide) as React.CSSProperties)}
    >
      <div aria-hidden='true' data-slot='workspace-frame-lanes' className='absolute inset-0 -z-10 flex max-md:hidden'>
        <div
          data-slot='workspace-lane'
          data-lane='chat'
          className='[display:var(--frame-chat-display,flex)] h-full w-(--frame-chat-width,320px) shrink-0 border-r border-border @max-[1119px]:[display:var(--frame-chat-compact-display,flex)]'
        >
          <ChatLaneFrame />
        </div>
        <div data-slot='workspace-lane' data-lane='viewer' className='h-full min-w-0 flex-1' />
        <div
          /* 1120px is `compactWorkspaceWidth` in `chat-interface-desktop.tsx`; Tailwind needs the literal. */
          data-slot='workspace-lane'
          data-lane='workbench'
          className='[display:var(--frame-workbench-display,flex)] h-full w-(--frame-workbench-width,420px) shrink-0 border-l border-border @max-[1119px]:[display:var(--frame-workbench-compact-display,none)]'
        />
      </div>
      {children}
    </div>
  );
}

/**
 * The chat lane's own frame: its background, its header bar and the composer's resting box (the empty composer's
 * 82 px frame), empty. Nothing in it stands for content. The workspace frame draws it in the chat lane, and the chat
 * gate shows it while the focused chat is re-established, so the lane keeps its frame in both waits.
 *
 * @param props - When the lane is waiting inside a live workspace, the label of its busy state.
 * @returns The chat lane frame.
 */
export function ChatLaneFrame({ busyLabel }: { readonly busyLabel?: string }): React.JSX.Element {
  return (
    <div
      className='flex size-full flex-col bg-sidebar/50'
      /* The chat pane's slot, so the lane inherits the chat pane's chrome wherever it stands in for it. */
      data-slot='floating-panel'
      data-testid='chat-lane-frame'
      aria-busy={busyLabel === undefined ? undefined : true}
      aria-label={busyLabel}
    >
      <div className='h-9 shrink-0 border-b bg-sidebar' />
      <div className='min-h-0 flex-1' />
      <div className='mx-auto mb-2 w-[calc(100%_-_1rem)] max-w-xl shrink-0'>
        <div
          data-testid='chat-lane-frame-composer'
          className='flex min-h-20.5 w-full flex-col rounded-2xl border bg-background shadow-md'
        />
      </div>
    </div>
  );
}

/**
 * What a gate below the frame renders while the workspace opens: no pixels, only the route's busy state for
 * assistive technology, so the frame above shows through unchanged.
 *
 * @returns The busy marker.
 */
export function WorkspaceOpening(): React.JSX.Element {
  return (
    <span
      role='status'
      aria-busy='true'
      aria-label='Opening project'
      data-testid='workspace-opening'
      className='sr-only'
    />
  );
}
