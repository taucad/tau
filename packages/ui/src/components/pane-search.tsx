import React from 'react';
import { flushSync } from 'react-dom';
import { cn } from '#utils/cn.js';

/**
 * The state a phone pane shares between its header's search toggle and the filter row in its body.
 *
 * @public
 */
export type PaneSearchState = {
  /** Whether the filter row is shown. */
  readonly isOpen: boolean;
  /** Whether the hidden filter row still holds a query, so the toggle can show that a filter applies. */
  readonly hasHiddenQuery: boolean;
  /** Whether a filter row is mounted in the pane; without one there is nothing to toggle. */
  readonly hasRegion: boolean;
  /** Shows the filter row and focuses its field, or hides it. */
  readonly toggle: () => void;
  /** The filter row's element id, for the toggle's `aria-controls`. */
  readonly regionId: string;
  /** Registers the filter row's element. */
  readonly registerRegion: (element: HTMLElement | undefined) => void;
};

const PaneSearchContext = React.createContext<PaneSearchState | undefined>(undefined);

/**
 * The pane's search state, or `undefined` where the filter row is always shown (every desktop pane).
 *
 * @returns The state, when a {@link PaneSearchProvider} holds the caller.
 *
 * @public
 */
export function usePaneSearch(): PaneSearchState | undefined {
  return React.useContext(PaneSearchContext);
}

/**
 * Collapses a pane's filter row behind a header toggle. Mount it only where room is scarce (a phone sheet); outside it
 * every {@link PaneSearchRegion} renders as the plain row it always was.
 *
 * @param props - The provider properties.
 * @param props.children - The pane whose header toggle and filter row share this state.
 * @returns The pane, holding the shared search state.
 *
 * @public
 */
export function PaneSearchProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const [hasHiddenQuery, setHasHiddenQuery] = React.useState(false);
  const [region, setRegion] = React.useState<HTMLElement | undefined>(undefined);
  const regionId = React.useId();
  const isOpenRef = React.useRef(isOpen);
  isOpenRef.current = isOpen;

  const toggle = React.useCallback(() => {
    const input = region?.querySelector<HTMLInputElement>('input');
    if (isOpenRef.current) {
      input?.blur();
      setHasHiddenQuery(Boolean(input?.value));
      setIsOpen(false);
      return;
    }

    // Commit the shown row inside the tap, so focusing it there raises the phone keyboard (iOS refuses a later focus).
    flushSync(() => {
      setIsOpen(true);
      setHasHiddenQuery(false);
    });
    input?.focus();
  }, [region]);

  const value = React.useMemo(
    (): PaneSearchState => ({
      isOpen,
      hasHiddenQuery,
      hasRegion: region !== undefined,
      regionId,
      toggle,
      registerRegion: setRegion,
    }),
    [hasHiddenQuery, isOpen, region, regionId, toggle],
  );

  return <PaneSearchContext.Provider value={value}>{children}</PaneSearchContext.Provider>;
}

/**
 * Properties of {@link PaneSearchRegion}.
 *
 * @public
 */
export type PaneSearchRegionProperties = React.ComponentProps<'div'>;

/**
 * A pane's filter row. Under a {@link PaneSearchProvider} it stays mounted while hidden, so its query and the filtering
 * it drives survive a collapse; elsewhere it is an ordinary `div`.
 *
 * @param props - The row's `div` properties.
 * @returns The row.
 *
 * @public
 */
export const PaneSearchRegion = React.forwardRef<HTMLDivElement, PaneSearchRegionProperties>(function (
  { className, ...properties },
  reference,
) {
  const search = usePaneSearch();
  const registerRegion = search?.registerRegion;
  const setReference = React.useCallback<React.RefCallback<HTMLDivElement>>(
    (element) => {
      registerRegion?.(element ?? undefined);
      if (typeof reference === 'function') {
        reference(element);
      } else if (reference) {
        reference.current = element;
      }
    },
    [reference, registerRegion],
  );
  const isHidden = search !== undefined && !search.isOpen;

  return (
    <div
      ref={setReference}
      id={search?.regionId}
      hidden={isHidden}
      data-pane-search-region=''
      className={cn(className, isHidden && 'hidden')}
      {...properties}
    />
  );
});
