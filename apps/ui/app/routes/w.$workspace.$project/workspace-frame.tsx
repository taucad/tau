import { useLayoutEffect, useSyncExternalStore } from 'react';
import { PanelLeft, Share2 } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { ProjectComposerHandOff, useProjectComposerHandOff } from '#components/chat/project-composer-hand-off.js';
import { useHandOffAdopted } from '#components/hand-off/hand-off-store.js';
import {
  defaultPhoneFrameHint,
  defaultWideFrameHint,
  frameHintKey,
  frameHintVariables,
  frameTabAttribute,
  phoneFrameDestination,
  phoneFrameHintVariables,
  readPhoneFrameHint,
  readWideFrameHint,
} from '#lib/frame-hint.js';
import type { FrameHintVariables, PhoneFrameHint, PhoneFrameHintVariables, WideFrameHint } from '#lib/frame-hint.js';
import {
  MobileWorkbenchNavigationFrame,
  mobileWorkbenchNavigationHeight,
} from '#components/mobile-workbench-navigation.js';

/** The value never changes on its own: the frame reads the hint when it renders, which a navigation causes. */
const subscribeToNothing = (): (() => void) => {
  return () => undefined;
};

/** The server has no hint: the pre-paint script's variables on `<html>` stand until the client renders. */
const noHintOnServer = (): undefined => undefined;

/**
 * The hint for the document's current URL, or the default layout when this device has none. A client navigation has
 * pushed the URL before the frame renders for it. The default is set explicitly on the client, so a project with no
 * hint never inherits the variables the pre-paint script left on `<html>` for the project the document first loaded.
 */
const readDocumentFrameHint = (pathname = globalThis.location.pathname): WideFrameHint => {
  const key = frameHintKey(pathname);
  return (key === undefined ? undefined : readWideFrameHint(key)) ?? defaultWideFrameHint;
};

/** Both shapes' variables, which the frame sets on itself on the client. */
const frameVariables = (wide: WideFrameHint, phone: PhoneFrameHint): FrameHintVariables & PhoneFrameHintVariables => ({
  ...frameHintVariables(wide),
  ...phoneFrameHintVariables(phone),
});

/** The phone hint for the document's current URL, or the default phone layout (the model, the sheet closed). */
const readDocumentPhoneFrameHint = (pathname = globalThis.location.pathname): PhoneFrameHint => {
  const key = frameHintKey(pathname);
  return (key === undefined ? undefined : readPhoneFrameHint(key)) ?? defaultPhoneFrameHint;
};

/** The phone server render has no hint either: the pre-paint script's values on `<html>` stand. */
const noPhoneHintOnServer = (): undefined => undefined;

/**
 * The attribute the desktop workspace sets once its split view has sized its panes. The frame's lanes hide on that
 * commit, so in every frame exactly one set of lane boxes is drawn, and both are at the same place.
 */
export const workspaceLanesReadyAttribute = 'data-workspace-lanes';

/** The marker after the frame's lanes that first paint waits for (`rel=expect`), as Home's composer does. */
export const workspaceFrameEndId = 'workspace-frame-end';

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
 * @param props - The content, whether the frame is drawn, and whether it is drawn ahead of the route. The shell draws
 *   it (`Page`, A15b2) on a project route and for a navigation to one; on any other route the same host element stays,
 *   with no frame, so the content keeps its tree position.
 * @returns The frame with the content over it.
 */
export function WorkspaceFrame({
  children,
  isDrawn = true,
  isPending = false,
  pathname,
}: {
  readonly children?: React.ReactNode;
  readonly isDrawn?: boolean;
  /** The frame is drawn for a project the route has not committed yet: the content is still the page being left. */
  readonly isPending?: boolean;
  /**
   * The project's pathname, which the shell passes: drawn ahead of the route, the frame renders before the router has
   * pushed the URL. Without it, the document's URL, as the pre-paint script reads it (suites with no router).
   */
  readonly pathname?: string;
}): React.JSX.Element {
  const wide = useSyncExternalStore(subscribeToNothing, () => readDocumentFrameHint(pathname), noHintOnServer);
  const phone = useSyncExternalStore(
    subscribeToNothing,
    () => readDocumentPhoneFrameHint(pathname),
    noPhoneHintOnServer,
  );
  const tab = phone === undefined ? undefined : phoneFrameDestination(phone.tab);
  /* The tab bar's selected destination is an attribute selector on `<html>`, which the pre-paint script set for the
   * document's first project: on the client the frame names its own project's before paint, so a client move to
   * another project never shows the first one's tab. */
  useLayoutEffect(() => {
    if (isDrawn && tab !== undefined) {
      document.documentElement.setAttribute(frameTabAttribute, tab);
    }
  }, [isDrawn, tab]);

  if (!isDrawn) {
    return (
      <div className='contents'>
        {/* The drawn frame's own nodes take this one slot, so the content keeps its position either way. */}
        {null}
        {children}
      </div>
    );
  }

  return (
    <div
      data-slot='workspace-frame'
      data-workspace-pending={isPending || undefined}
      className={cn(
        'size-full bg-background md:relative md:isolate',
        /* A15b2: drawn ahead of the route, the frame's layers (the lanes, the phone frame, the destination's composer
         * box) show alone; the page being left stays in place, unseen, until the route's commit replaces it. */
        '[&[data-workspace-pending]>:not([data-slot=workspace-frame-lanes]):not([data-slot=workspace-frame-phone]):not([data-slot=workspace-frame-composer])]:invisible',
        /* Literal for Tailwind: `workspaceLanesReadyAttribute`. */
        '[&:has([data-workspace-lanes=ready])>[data-slot=workspace-frame-lanes]]:hidden',
        /* Literal for Tailwind: the desktop workspace's `data-chat-lane`. The composer box stays past the lanes'
         * layout until a composer adopts its input, but not over a chat lane the live layout has closed. */
        '[&:has([data-chat-lane=hidden])>[data-slot=workspace-frame-composer]]:hidden',
        /* A failure that stands in the content region in the workspace's place (the file service's, the route
         * chunk's) shows alone, as it did before the frame: no lane or composer box under it. Not while pending: the
         * content is then the page being left, hidden, and an alert of its own is not the destination's. */
        '[&:not([data-workspace-pending]):has([role=alert]:not([data-project-workspace]_*))>[data-slot=workspace-frame-lanes]]:hidden',
        '[&:not([data-workspace-pending]):has([role=alert]:not([data-project-workspace]_*))>[data-slot=workspace-frame-composer]]:hidden',
      )}
      style={
        wide === undefined || phone === undefined ? undefined : (frameVariables(wide, phone) as React.CSSProperties)
      }
    >
      {/* No hint yet (the server, the hydrating render) serves the input; the pre-paint script's variable hides a lane
       * remembered closed, and the client then drops it. */}
      <WorkspaceFrameLanes isChatServed={wide?.chatOpen !== false} pathname={pathname} />
      {children}
    </div>
  );
}

/**
 * The frame's own nodes: the lanes layer, the chat lane's composer box with the composer's native input (PL6), and the
 * render-blocking marker after them. One element, so the content after it keeps its slot whether or not the frame is
 * drawn.
 *
 * The lanes are decorative, under the content and hidden from assistive technology. The composer box is the one part
 * that stands for something the person uses: the composer takes text from first paint, and the live composer adopts
 * it when the workspace is revealed. It is its own layer above the content, at the chat lane's place and width and at
 * the lane frame's composer box, and only the box takes pointer events, so the content under the rest of the layer
 * gets its pointer as before. The box leaves when a composer adopts the input, in the same commit, not when the lanes
 * are laid out: the chat lane may show a status instead of a composer for a while (chats loading, sync off, a failed
 * load), and the text stays where it can be seen and edited until a composer can take it. Where none can, under a
 * failure in the workspace's place or with the live chat lane closed, the box hides and the text waits in the store.
 *
 * @param props - Whether the chat lane serves the input (not when this project remembers the lane closed), and the
 *   destination's pathname when the frame is drawn ahead of the route.
 * @returns The lanes, the composer box and the marker.
 */
function WorkspaceFrameLanes({
  isChatServed,
  pathname,
}: {
  readonly isChatServed: boolean;
  readonly pathname?: string;
}): React.JSX.Element {
  const target = useProjectComposerHandOff(pathname);
  const isAdopted = useHandOffAdopted(target);
  return (
    <>
      <div
        aria-hidden='true'
        data-slot='workspace-frame-lanes' /* The query container is the lanes layer, the frame's own width, so the content over it gains none. */
        className='@container absolute inset-0 -z-10 flex max-md:hidden'
      >
        <div
          data-slot='workspace-lane'
          data-lane='chat'
          className='[display:var(--frame-chat-display,flex)] h-full w-(--frame-chat-width,320px) shrink-0 border-r border-border @max-[1120px]:[display:var(--frame-chat-compact-display,flex)]'
        >
          <ChatLaneFrame />
        </div>
        <div data-slot='workspace-lane' data-lane='viewer' className='h-full min-w-0 flex-1' />
        <div
          /* `@max-[1120px]` is below `compactWorkspaceWidth` (1120px) in `chat-interface-desktop.tsx`; Tailwind needs the literal. */
          data-slot='workspace-lane'
          data-lane='workbench'
          className='[display:var(--frame-workbench-display,flex)] h-full w-(--frame-workbench-width,420px) shrink-0 border-l border-border @max-[1120px]:[display:var(--frame-workbench-compact-display,none)]'
        />
      </div>
      <div
        data-slot='workspace-frame-composer'
        className='@container pointer-events-none absolute inset-0 z-10 flex max-md:hidden'
      >
        {/* The chat lane's box, border included, so the composer box lands on the lane frame's own. */}
        <div className='[display:var(--frame-chat-display,flex)] h-full w-(--frame-chat-width,320px) shrink-0 flex-col justify-end border-r border-transparent @max-[1120px]:[display:var(--frame-chat-compact-display,flex)]'>
          {isChatServed && !isAdopted ? (
            <div className='pointer-events-auto mx-auto mb-2 w-[calc(100%_-_1rem)] max-w-xl shrink-0'>
              <div className='flex min-h-20.5 w-full flex-col rounded-2xl border bg-background shadow-md has-[textarea:focus-visible]:focus-outline'>
                <ProjectComposerHandOff target={target} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <PhoneFrame />
      {/* Hoisted to the head by React. Until the parser reaches the marker after the lanes, Chromium holds rendering,
       * so a project load's first paint is never a document cut above the frame: no lanes, or the shell alone (the
       * blank first paint A11 reported, and F15's lane-less first frame). The held region ends at the lanes, not the
       * page, so the gated content still streams in after first paint. A browser without `rel=expect` ignores it. */}
      <link rel='expect' href={`#${workspaceFrameEndId}`} blocking='render' />
      <span id={workspaceFrameEndId} hidden />
    </>
  );
}

/**
 * The phone frame (blueprint P-h, § Editor frame, phone; A15c): the top bar with its controls' places, the viewer's
 * box, the sheet at the detent this project's sheet opens at, and the tab bar with the remembered destination
 * selected, each at the box the phone workspace draws it in, read from the frame hint's variables with the default
 * (the model, the sheet closed) as each fallback. Nothing in it stands for content, and nothing in it moves. The phone
 * workspace mounts hidden until its stored layout is read (`data-mobile-workspace=ready`); in that commit the top
 * bar, the sheet and the tab bar give way to the live ones in the same boxes, and the viewer's box gives way once the
 * live viewer stage is drawn too. The live sheet is drawn in a portal outside the frame, so the hand-over is the
 * workspace's attribute, not the live part's presence.
 *
 * It is inert and hidden from assistive technology: the route's busy state is the gates' `WorkspaceOpening`. A
 * failure or a notice that stands in the workspace's place shows alone, as on a wide screen.
 *
 * @returns The phone frame.
 */
function PhoneFrame(): React.JSX.Element {
  return (
    <div
      aria-hidden='true'
      inert
      data-slot='workspace-frame-phone'
      className={cn(
        'absolute inset-0 flex flex-col overflow-hidden md:hidden',
        mobileWorkbenchNavigationHeight,
        '[[data-slot=workspace-frame]:not([data-workspace-pending]):has([role=alert]:not([data-mobile-workspace]_*))_&]:hidden',
        '[[data-slot=workspace-frame]:not([data-workspace-pending]):has([data-slot=project-route-notice])_&]:hidden',
      )}
    >
      <div
        data-frame-part='top-bar'
        className='flex h-12 shrink-0 items-center gap-0.5 border-b bg-background px-1 [[data-slot=workspace-frame]:has([data-mobile-workspace=ready])_&]:invisible'
      >
        <span className='flex size-10 shrink-0 items-center justify-center'>
          <PanelLeft aria-hidden className='size-5' />
        </span>
        <span className='h-10 min-w-0 flex-1' />
        <span className='flex size-10 shrink-0 items-center justify-center'>
          <Share2 aria-hidden className='size-5' />
        </span>
      </div>
      {/* The live viewer box's inset: the sheet's visible height while it is open, the tab bar's otherwise. */}
      <div className='relative min-h-0 flex-1 pb-[max(var(--frame-sheet-height,0px),var(--nav-offset))]'>
        <div
          data-frame-part='viewer'
          className='size-full [[data-slot=workspace-frame]:has([data-mobile-workspace=ready]_[data-slot=viewer-stage])_&]:hidden'
        />
      </div>
      <div
        data-frame-part='sheet'
        className={cn(
          /* The live sheet is the viewport's height, moved down to its detent: the same box. */
          'fixed inset-x-0 top-[calc(100dvh_-_var(--frame-sheet-height,0px))] h-dvh flex-col rounded-t-[calc(var(--spacing)*11)] border-x border-t bg-sidebar',
          '[display:var(--frame-sheet-display,none)]',
          '[[data-slot=workspace-frame]:has([data-mobile-workspace=ready])_&]:hidden',
        )}
      >
        <div className='relative h-2 shrink-0'>
          <div className='absolute inset-x-0 bottom-0 mx-auto h-1 w-15 rounded-full bg-sidebar-primary/15' />
        </div>
      </div>
      <MobileWorkbenchNavigationFrame className='fixed inset-x-0 bottom-0 [[data-slot=workspace-frame]:has([data-mobile-workspace=ready])_&]:hidden' />
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
      /* A named busy state is a status, so its label is exposed rather than dropped from a generic element. */
      role={busyLabel === undefined ? undefined : 'status'}
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
