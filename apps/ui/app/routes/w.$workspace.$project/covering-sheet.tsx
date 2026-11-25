import { createContext, createElement, useContext, useId } from 'react';
import { AlertTriangle, CloudOff } from 'lucide-react';
import { useModelAvailability } from '#hooks/use-project-availability.js';
import { isProjectFilesFailure } from '#routes/w.$workspace.$project/project-sync-placeholder.js';
import { useViewerWaitFailure, ViewerWaitInline } from '#routes/w.$workspace.$project/viewer-wait-status.js';
import type { ViewerWait } from '#routes/w.$workspace.$project/viewer-wait-status.js';

/**
 * Whether the surface below is a phone sheet at full that covers the viewer (Progressive Loading Policy rules 17 and
 * 21). The viewer carries a project open's status and its failure; while it is covered, the sheet carries them instead:
 * the status in its header's trailing slot ({@link CoveringSheetStatus}) and a failure in its body
 * ({@link CoveringSheetNotice}), and the covered viewer is inert. Everywhere else (a desktop lane, a sheet at half)
 * the viewer speaks and this is `false`.
 */
const coveringSheetContext = createContext(false);

/**
 * Marks the surface below as a sheet that covers the viewer, or not.
 *
 * @param props - Whether the sheet covers the viewer, and its surface.
 * @returns The scoped surface.
 */
export function CoveringSheetProvider({
  isCovering,
  children,
}: {
  readonly isCovering: boolean;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  return createElement(coveringSheetContext.Provider, { value: isCovering }, children);
}

/**
 * Whether this surface is a phone sheet at full that covers the viewer.
 *
 * @returns `true` inside a covering sheet.
 */
export function useIsCoveringSheet(): boolean {
  return useContext(coveringSheetContext);
}

/**
 * The viewer's status in a covering sheet's header trailing slot, while the viewer waits; nothing anywhere else. A
 * header that may stand at the top of a phone sheet renders it before its actions.
 *
 * @returns The inline indicator, or nothing.
 */
export function CoveringSheetStatus(): React.ReactNode {
  const isCovering = useIsCoveringSheet();
  return isCovering ? <CoveringSheetWaitStatus /> : null;
}

function CoveringSheetWaitStatus(): React.JSX.Element {
  const availability = useModelAvailability();
  return <ViewerWaitInline wait={availability === 'ready' ? undefined : availability} />;
}

/**
 * The viewer's failure over the body of the sheet that covers it, whatever the sheet shows: a pane still waiting, or one
 * whose own content is here (an open chat while the model's files fail). The phone host draws it once over the sheet's
 * surface, so the covered, inert viewer's failure and its one action stay reachable (rule 21).
 *
 * @returns The notice over the sheet's body, or nothing while the viewer's wait has not failed or the sheet does not
 *   cover it.
 */
export function CoveringSheetFailure(): React.ReactNode {
  const isCovering = useIsCoveringSheet();
  return isCovering ? <CoveringSheetViewerFailure /> : null;
}

function CoveringSheetViewerFailure(): React.ReactNode {
  const availability = useModelAvailability();
  const hasFailed = availability === 'filesFailed' || isProjectFilesFailure(availability);
  if (!hasFailed) {
    return null;
  }
  return (
    /* Only the notice takes the pointer: the sheet's own content around it stays usable. */
    <div className='pointer-events-none absolute inset-0 z-10'>
      <CoveringSheetNotice wait={availability} />
    </div>
  );
}

/**
 * A failed wait's one notice, in the body of the sheet that covers the viewer: the viewer's own failure words and its
 * one action ("Try again", or "Open History" where a sign-in or a decision is needed). A labelled group, not an alert:
 * the route's announcement says a failed open (rule 22). Offline keeps its own glyph.
 *
 * @param props - The failed wait.
 * @returns The notice, or nothing for a wait that has not failed.
 */
export function CoveringSheetNotice({ wait }: { readonly wait: ViewerWait }): React.ReactNode {
  const failure = useViewerWaitFailure(wait);
  const titleId = useId();
  if (failure?.kind !== 'failed') {
    return null;
  }
  return (
    <div className='flex size-full items-center justify-center p-4'>
      <div
        role={failure.live === false ? 'group' : 'alert'}
        aria-labelledby={titleId}
        data-slot='covering-sheet-notice'
        className='pointer-events-auto flex w-fit max-w-[min(24rem,100%)] flex-col items-center gap-2 rounded-md border border-feature/40 bg-background/90 p-3 text-center shadow-sm'
      >
        <div className='flex items-start gap-2 text-left'>
          {/* The icon sits in a box one line of the first text tall, so it is centred on that line (UI Policy § 5). */}
          <span className='flex h-lh shrink-0 items-center text-sm'>
            {wait === 'offline' ? (
              <CloudOff aria-hidden className='size-4 text-muted-foreground' strokeWidth={1.5} />
            ) : (
              <AlertTriangle aria-hidden className='size-4 text-feature' strokeWidth={1.5} />
            )}
          </span>
          <div className='flex flex-col gap-1'>
            <p id={titleId} className='text-sm font-medium'>
              {failure.summary}
            </p>
            <p className='text-xs text-muted-foreground'>{failure.message}</p>
          </div>
        </div>
        {failure.action}
      </div>
    </div>
  );
}
