import { useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { PanelLeft, Share2 } from 'lucide-react';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
import { cn } from '@taucad/ui/utils/cn';
import { openWaitContext } from '#hooks/use-wait-start.js';
import type { OpenWait } from '#hooks/use-wait-start.js';
import { WaitSkeleton } from '#routes/w.$workspace.$project/project-wait-skeleton.js';
import { ProjectComposerHandOff, useProjectComposerHandOff } from '#components/chat/project-composer-hand-off.js';
import { useHandOffAdopted } from '#components/hand-off/hand-off-store.js';
import { DepartingFirstMessage } from '#components/chat/departing-first-message.js';
import { useDepartingFirstMessage } from '#lib/departing-first-message.js';
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
import { projectOpenCopy } from '#lib/project-open-copy.js';
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

const isClient = (): boolean => true;
const isServer = (): boolean => false;

/** One project open as the frame times it. */
type TrackedOpen = Readonly<{ isDrawn: boolean; key: string | undefined; startedAt: number }>;

/**
 * When the open of the frame's project started, on the wait clock (Progressive Loading Policy rule 16; one clock per
 * wait): navigation start (0) for the project the document opened with, and the frame's first render on the client for
 * a project reached later, which is the click, since the shell draws the frame ahead of the route. Read in render with
 * React's "information from previous renders" pattern: no effect, no timer.
 *
 * @param isDrawn - Whether the frame is drawn.
 * @param pathname - The project's pathname when the shell passes one.
 * @returns The open's start.
 */
function useFrameOpenStart(isDrawn: boolean, pathname: string | undefined): number {
  const clock = useWaitClockSource();
  const isOnClient = useSyncExternalStore(subscribeToNothing, isClient, isServer);
  const key = useSyncExternalStore(
    subscribeToNothing,
    () => (isDrawn ? frameHintKey(pathname ?? globalThis.location.pathname) : undefined),
    () => undefined,
  );
  const [tracked, setTracked] = useState<TrackedOpen>(() => ({
    isDrawn,
    key,
    startedAt: isOnClient ? clock.now() : 0,
  }));
  /* A frame drawn anew, or moved to another project, is a new open. The hydration pass reads no key; its first client
   * render reading one is the same open. */
  const isNewOpen =
    (isDrawn && !tracked.isDrawn) || (tracked.key !== undefined && key !== undefined && key !== tracked.key);
  if (isNewOpen || tracked.isDrawn !== isDrawn || tracked.key !== key) {
    const next = { isDrawn, key, startedAt: isNewOpen ? clock.now() : tracked.startedAt };
    setTracked(next);
    return next.startedAt;
  }
  return tracked.startedAt;
}

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
  const openStartedAt = useFrameOpenStart(isDrawn, pathname);
  const open = useMemo<OpenWait>(() => ({ startedAt: openStartedAt, isRevealed: false }), [openStartedAt]);
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
        {/* The same provider and the same two slots as the drawn frame, so the content keeps its position either way:
         * the drawn frame's own nodes take the first. No open runs off a project route. */}
        <openWaitContext.Provider value={undefined}>
          {null}
          {children}
        </openWaitContext.Provider>
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
        /* Literal for Tailwind: the phone workspace's `data-mobile-workspace`; its own regions are not a failure in its place. */
        '[&:not([data-workspace-pending]):has([role=alert]:not([data-project-workspace]_*):not([data-mobile-workspace]_*))>[data-slot=workspace-frame-composer]]:hidden',
        /* Literal for Tailwind: the phone workspace's `data-mobile-tab`. On a phone the composer box stays past the
         * workspace's reveal until a composer adopts its input, but not once the live sheet shows another surface. */
        'max-md:[&:has([data-mobile-workspace=ready]:not([data-mobile-tab=chat]))>[data-slot=workspace-frame-composer]]:hidden',
      )}
      style={
        wide === undefined || phone === undefined ? undefined : (frameVariables(wide, phone) as React.CSSProperties)
      }
    >
      {/* The open's clock, which every waiting region below reads: the frame's own lanes, and the live panes that take
       * over their bars (Progressive Loading Policy rule 16). */}
      <openWaitContext.Provider value={open}>
        {/* No hint yet (the server, the hydrating render) serves the input; the pre-paint script's variable hides a
         * lane remembered closed, and the client then drops it unless a phone's chat sheet serves it. */}
        <WorkspaceFrameLanes isChatServed={wide?.chatOpen !== false || phone?.tab === 'chat'} pathname={pathname} />
        {children}
      </openWaitContext.Provider>
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
 * On a phone the same box, with the same one input, is the chat sheet's foot above the tab bar, where the live chat
 * composer rests, while the frame draws the chat sheet; the phone's chat composer adopts it when the workspace shows,
 * and the box hides, keeping the text, while the live sheet shows another surface.
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
          <ChatLaneFrame pathname={pathname}>
            <FrameWaitSkeleton shape='transcript' label='Chat' />
          </ChatLaneFrame>
        </div>
        <div data-slot='workspace-lane' data-lane='viewer' className='flex h-full min-w-0 flex-1 flex-col'>
          <FrameTabStrip label='Viewer tabs' />
          <FrameViewerStatus />
        </div>
        <div
          /* `@max-[1120px]` is below `compactWorkspaceWidth` (1120px) in `chat-interface-desktop.tsx`; Tailwind needs the literal. */
          data-slot='workspace-lane'
          data-lane='workbench'
          className='[display:var(--frame-workbench-display,flex)] h-full w-(--frame-workbench-width,420px) shrink-0 flex-col border-l border-border @max-[1120px]:[display:var(--frame-workbench-compact-display,none)]'
        >
          <FrameTabStrip label='Workbench tabs' />
          <FrameWaitSkeleton shape='fields' label='Workbench' />
        </div>
      </div>
      <div
        data-slot='workspace-frame-composer'
        className={cn(
          /* On a phone the box stays over the live sheet until its composer adopts the input: above the sheet (z-40),
           * under the tab bar (z-50). */
          '@container pointer-events-none absolute inset-0 z-10 flex max-md:z-45',
          /* On a phone, the chat sheet's foot: shown while the frame draws the chat sheet (the tab the pre-paint script
           * selected on `<html>`), above the tab bar, whose height it takes. */
          'max-md:[:root:not([data-frame-tab=chat])_&]:hidden',
          mobileWorkbenchNavigationHeight,
        )}
      >
        {/* The chat lane's box, border included, so the composer box lands on the lane frame's own. On a phone, the live
         * chat surface's box: it ends at the tab bar, and the composer rests at its foot. */}
        <div
          className={cn(
            '[display:var(--frame-chat-display,flex)] h-full w-(--frame-chat-width,320px) shrink-0 flex-col justify-end border-r border-transparent @max-[1120px]:[display:var(--frame-chat-compact-display,flex)]',
            'max-md:fixed max-md:inset-x-0 max-md:bottom-(--nav-offset) max-md:h-auto max-md:w-auto max-md:border-r-0 max-md:[display:flex]!',
          )}
        >
          {isChatServed && !isAdopted ? (
            <div className='pointer-events-auto mx-auto mb-2 w-[calc(100%_-_1rem)] max-w-xl shrink-0'>
              <div
                className={cn(
                  /* The anchor the phone frame's transcript ends at (`frameTranscriptClassName`). */
                  'flex min-h-20.5 w-full flex-col rounded-2xl border bg-background shadow-md [anchor-name:--frame-composer] has-[textarea:focus-visible]:focus-outline',
                  /* On a phone at rest (empty and unfocused) the box is the live phone composer's one row: Add, the
                   * input and Send on one line, the other controls hidden, as its collapsed composer draws it. */
                  'max-md:[&:not(:focus-within):has(textarea:placeholder-shown)]:min-h-0 max-md:[&:not(:focus-within):has(textarea:placeholder-shown)]:rounded-[calc(var(--spacing)*5.5+1px)]',
                  'max-md:[&:not(:focus-within):has(textarea:placeholder-shown)_[data-hand-off-box]]:pt-2.5',
                  'max-md:[&:not(:focus-within):has(textarea:placeholder-shown)_[data-hand-off]]:max-h-6 max-md:[&:not(:focus-within):has(textarea:placeholder-shown)_[data-hand-off]]:overflow-hidden max-md:[&:not(:focus-within):has(textarea:placeholder-shown)_[data-hand-off]]:px-7',
                  'max-md:[&:not(:focus-within):has(textarea:placeholder-shown)_textarea]:pb-0 max-md:[&:not(:focus-within):has(textarea:placeholder-shown)_textarea]:leading-6',
                  'max-md:[&:not(:focus-within):has(textarea:placeholder-shown)_[data-slot=composer-bar]]:-mt-6.5',
                  'max-md:[&:not(:focus-within):has(textarea:placeholder-shown)_[data-slot=composer-collapsible]]:invisible',
                )}
              >
                <ProjectComposerHandOff target={target} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <PhoneFrame pathname={pathname} />
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
 * The phone frame's transcript: between the chat header's box and the composer box's top, as the live sheet lays its
 * transcript out above its composer. A draft grows the box upwards, and the transcript's last bars go with it rather
 * than sit behind the box (staging re-check 7). Without anchor positioning it keeps the resting composer's box.
 */
const frameTranscriptClassName = cn(
  'mt-1 min-h-0 flex-1',
  'supports-[anchor-name:--a]:fixed supports-[anchor-name:--a]:h-auto supports-[anchor-name:--a]:flex-none',
  'supports-[anchor-name:--a]:top-[anchor(--frame-chat-header_bottom)] supports-[anchor-name:--a]:left-[anchor(--frame-chat-header_left)] supports-[anchor-name:--a]:right-[anchor(--frame-chat-header_right)]',
  /* The box's top, less its own bottom margin's gap; the resting composer's box when the box is not drawn. */
  'supports-[anchor-name:--a]:bottom-[anchor(--frame-composer_top,calc(var(--nav-offset)_+_3.375rem))]',
);

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
 * @param props - The destination's pathname when the frame is drawn ahead of the route.
 * @returns The phone frame.
 */
function PhoneFrame({ pathname }: { readonly pathname?: string }): React.JSX.Element {
  const departing = useDepartingFirstMessage(useProjectComposerHandOff(pathname).scope);
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
          className='flex size-full flex-col [[data-slot=workspace-frame]:has([data-mobile-workspace=ready]_[data-slot=viewer-stage])_&]:hidden'
        >
          <FrameViewerStatus />
        </div>
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
        {/* The remembered surface's shape, chosen by the tab the pre-paint script selected on `<html>`. The chat's is
         * the live chat surface's box (the visible sheet less its grabber row, its top border and the tab bar), with its
         * header's and resting composer's boxes, so the transcript's bars are where the live ones will be. */}
        <div
          data-frame-chat='surface'
          className='hidden h-[calc(var(--frame-sheet-height,0px)_-_var(--spacing)*2_-_var(--nav-offset)_-_1px)] shrink-0 flex-col [[data-frame-tab=chat]_&]:flex'
        >
          <div data-frame-chat='header' className='h-15 shrink-0 [anchor-name:--frame-chat-header]' />
          {departing === undefined ? (
            <FrameWaitSkeleton shape='transcript' label='Chat' className={frameTranscriptClassName} />
          ) : (
            <DepartingFirstMessage text={departing} className={frameTranscriptClassName} />
          )}
          <div data-frame-chat='composer' className='mx-auto mb-2 h-11.5 w-[calc(100%_-_1rem)] max-w-xl shrink-0' />
        </div>
        <FrameWaitSkeleton
          shape='fields'
          label='Parameters'
          className='hidden flex-1 [[data-frame-tab=parameters]_&]:block'
        />
        <FrameWaitSkeleton shape='list' label='Workbench' className='hidden flex-1 [[data-frame-tab=all]_&]:block' />
      </div>
      <MobileWorkbenchNavigationFrame className='fixed inset-x-0 bottom-0 [[data-slot=workspace-frame]:has([data-mobile-workspace=ready])_&]:hidden' />
    </div>
  );
}

/**
 * A frame region's content shape on the open's clock: bars from the ladder's skeleton mark (300 ms after the open
 * began), so an open of a project already here draws the frame alone (Progressive Loading Policy rules 15 and 16).
 *
 * @param props - The shape, the region's name and extra classes.
 * @returns The region's waiting body.
 */
function FrameWaitSkeleton({
  shape,
  label,
  className,
}: {
  readonly shape: React.ComponentProps<typeof WaitSkeleton>['shape'];
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  const open = useContext(openWaitContext);
  return <WaitSkeleton isActive startedAt={open?.startedAt} shape={shape} label={label} className={className} />;
}

/**
 * A lane's tab strip, as the live dock draws it (its height and its bottom border), with its tabs' shape.
 *
 * @param props - The strip's name.
 * @returns The tab strip.
 */
function FrameTabStrip({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <div className='h-9 shrink-0 border-b border-border'>
      <FrameWaitSkeleton shape='tabs' label={label} />
    </div>
  );
}

/**
 * The viewer's status slot in the frame: the open's one status (Progressive Loading Policy rule 17), the viewer pill
 * with the open's label from 1,000 ms after the open began, centred where the live stage places its status before a
 * model is drawn. It is not live: the route's busy state and announcement speak for the open (rule 22).
 *
 * @returns The status slot.
 */
function FrameViewerStatus(): React.JSX.Element {
  const open = useContext(openWaitContext);
  return (
    <div className='relative min-h-0 flex-1'>
      <div
        data-slot='frame-viewer-status'
        className='absolute top-1/2 right-2 left-2 mx-auto flex w-fit max-w-full -translate-y-1/2'
      >
        <WaitIndicator active variant='pill' live={false} label={projectOpenCopy.label} startedAt={open?.startedAt} />
      </div>
    </div>
  );
}

/**
 * The chat lane's own frame: its background, its header bar and the composer's resting box (the empty composer's
 * 82 px frame). The workspace frame draws it empty in the chat lane, and the chat gate keeps it while the project opens
 * (its feed then draws the transcript's shape) and while the focused chat is re-established, so the lane keeps one
 * frame through every wait (Progressive Loading Policy rule 15). In a phone sheet its header is the sheet's bar height.
 *
 * A new project's first message on its way from Home takes the feed's place (WP-12 with WP-07 step 5): the person's
 * words stay in view, at the transcript's first row, through every wait of the open.
 *
 * @param props - What its feed draws while the lane waits, a status for its header's trailing slot, and the
 *   destination's pathname when the frame is drawn ahead of the route.
 * @returns The chat lane frame.
 */
export function ChatLaneFrame({
  children,
  headerStatus,
  pathname,
}: {
  /** The feed's content while the lane waits, such as the transcript's shape. Empty by default. */
  readonly children?: React.ReactNode;
  /** The header's trailing slot, such as the open's status where the lane covers the viewer. */
  readonly headerStatus?: React.ReactNode;
  /** The project's pathname when the frame is drawn ahead of the route; the route's params otherwise. */
  readonly pathname?: string;
}): React.JSX.Element {
  const departing = useDepartingFirstMessage(useProjectComposerHandOff(pathname).scope);
  return (
    <div
      className='flex size-full flex-col bg-sidebar/50'
      /* The chat pane's slot, so the lane inherits the chat pane's chrome wherever it stands in for it. */
      data-slot='floating-panel'
      data-testid='chat-lane-frame'
    >
      <div className='flex h-9 shrink-0 items-center justify-end border-b bg-sidebar px-2 [[data-slot=drawer-content]_&]:h-(--drawer-bar-height) [[data-slot=drawer-content]_&]:px-4'>
        {headerStatus}
      </div>
      <div className='relative min-h-0 flex-1'>
        {departing === undefined ? children : <DepartingFirstMessage text={departing} />}
      </div>
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
      aria-label={projectOpenCopy.label}
      data-testid='workspace-opening'
      className='sr-only'
    />
  );
}
