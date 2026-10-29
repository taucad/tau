/**
 * Closing a Terminal pane (T15): while its session runs, closing asks first. The ask is pane chrome Tau draws, offering
 * Keep open, Hide and Close and stop; nothing is removed or stopped before the person chooses.
 *
 * The pane cannot tell an idle shell prompt from a running command (no trusted signal exists on the wire), so the
 * question is about the session, never a claim that a command is busy. A pane with no session, or one that has ended,
 * closes at once, and a session that ends while the question is open withdraws it.
 *
 * Dockview has no cancellable close, so every Tau affordance that closes a workbench tab calls {@link closePanel}
 * instead of the panel's own `close()`; a host without Dockview (the phone sheet) asks {@link TerminalCloseHost}
 * through the same request.
 */

import { createContext, useEffect, useId, useMemo, useRef } from 'react';
import type { DockviewPanelApi } from 'dockview-react';
import { Button } from '@taucad/ui/components/button';

/** Asks the pane to close; `true` when the pane holds the close for the person's choice. */
type TerminalCloseRequest = () => boolean;

/** What a Terminal pane's host offers: removing the pane, hiding it with its session, and the close route. */
export type TerminalCloseHost = {
  /** Remove the pane; its session ends as it unmounts. */
  readonly close: () => void;
  /** Put the pane out of sight with its session still running. */
  readonly hide: () => void;
  /** Route the host's close affordances through the pane. Returns the unregister. */
  readonly register: (request: TerminalCloseRequest) => () => void;
};

/** The host of the Terminal pane rendered below it; absent where nothing can close the pane. */
export const TerminalCloseContext = createContext<TerminalCloseHost | undefined>(undefined);

/* Keyed by the panel's own api object, so a request reaches only the pane Dockview rendered for that panel. */
const panelCloseRequests = new WeakMap<Pick<DockviewPanelApi, 'close'>, TerminalCloseRequest>();

/**
 * Offer a close to the pane registered for this panel.
 *
 * @param api - The Dockview panel api the close affordance belongs to.
 * @returns `true` when the pane holds the close for the person's choice, so the caller must not remove it.
 */
export function holdsPanelClose(api: Pick<DockviewPanelApi, 'close'>): boolean {
  return panelCloseRequests.get(api)?.() ?? false;
}

/**
 * Close a Dockview panel the way a person asked to: a Terminal with a running session asks first, any other panel
 * closes at once.
 *
 * @param api - The panel's api.
 */
export function closePanel(api: Pick<DockviewPanelApi, 'close'>): void {
  if (!holdsPanelClose(api)) {
    api.close();
  }
}

/**
 * The close host for a Terminal rendered as a Dockview panel: a held close brings the tab forward so its question is
 * on screen, and Hide closes the whole Workbench lane, which keeps the panel mounted.
 *
 * @param api - The panel's api.
 * @param hide - Hides the lane without removing the panel.
 * @returns The host to provide through {@link TerminalCloseContext}.
 */
export function useDockviewTerminalCloseHost(
  api: Pick<DockviewPanelApi, 'close' | 'setActive'>,
  hide: () => void,
): TerminalCloseHost {
  return useMemo(
    () => ({
      close() {
        api.close();
      },
      hide,
      register(request) {
        const held = (): boolean => {
          if (!request()) {
            return false;
          }
          api.setActive();
          return true;
        };
        panelCloseRequests.set(api, held);
        return () => {
          if (panelCloseRequests.get(api) === held) {
            panelCloseRequests.delete(api);
          }
        };
      },
    }),
    [api, hide],
  );
}

/** The person's answer to closing a running Terminal. */
export type TerminalCloseChoice = 'keep' | 'hide' | 'stop';

/**
 * The question shown in the pane when a running Terminal is asked to close.
 *
 * @param props - The project the session runs in, and the handler for the chosen answer.
 * @returns The decision card.
 */
export function TerminalCloseDecision({
  projectLabel,
  onChoose,
}: {
  readonly projectLabel: string;
  readonly onChoose: (choice: TerminalCloseChoice) => void;
}): React.JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <section
      role='alertdialog'
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-slot='terminal-close-decision'
      className='flex flex-col gap-2 border-b bg-card p-3 text-sm'
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onChoose('keep');
        }
      }}
    >
      <h4 id={titleId} className='font-medium'>
        Close the Terminal in {projectLabel}?
      </h4>
      <p id={descriptionId} className='text-muted-foreground'>
        Closing this Terminal stops its session. Hide keeps it running out of sight.
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button
          ref={keepRef}
          size='sm'
          variant='outline'
          onClick={() => {
            onChoose('keep');
          }}
        >
          Keep open
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            onChoose('hide');
          }}
        >
          Hide
        </Button>
        <Button
          size='sm'
          variant='destructive'
          onClick={() => {
            onChoose('stop');
          }}
        >
          Close and stop
        </Button>
      </div>
    </section>
  );
}
