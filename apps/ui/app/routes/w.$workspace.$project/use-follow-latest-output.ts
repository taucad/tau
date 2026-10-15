import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { VirtuosoHandle, VirtuosoProps } from 'react-virtuoso';

// Virtuoso's `scrollToIndex` types restrict `behavior` to `'auto' | 'smooth'`,
// but at runtime the value is forwarded straight to the native `scrollTo()`
// API which also accepts `'instant'` (no animation, no layout-shift jitter
// while assistant tokens stream in). Bridge the type vs runtime mismatch
// once here so the call sites read cleanly.
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- runtime accepts 'instant'; Virtuoso's type is narrower than the native ScrollBehavior
export const instantScrollBehavior = 'instant' as 'auto';

// Matches Virtuoso's default `atBottomThreshold`.
const bottomThreshold = 4;

type FollowLatestOutput = {
  /** Pass to `<Virtuoso scrollerRef>` so user scrolls decide whether to follow. */
  readonly scrollerRef: NonNullable<VirtuosoProps<unknown, unknown>['scrollerRef']>;
  /** Pass to `<Virtuoso followOutput>`: follows appended rows only while pinned. */
  readonly followOutput: () => 'auto' | false;
  /** Pass to `<Virtuoso totalListHeightChanged>`: follows rows that grow in place. */
  readonly totalListHeightChanged: () => void;
};

/**
 * Keeps a Virtuoso list pinned to its latest content only while the person is
 * at the bottom.
 *
 * Virtuoso's `followOutput` reacts to appended rows, but a streaming turn grows
 * its last row in place, which Virtuoso reports as "not at bottom because size
 * increased" and leaves alone. Whether to follow is therefore decided from
 * scroll events, which content growth never fires: the list follows until the
 * person scrolls up, away from the bottom, and resumes once they scroll back.
 *
 * @param virtuosoRef - The list whose last row is scrolled into view.
 * @returns Props to spread onto the Virtuoso list.
 */
export function useFollowLatestOutput(
  // oxlint-disable-next-line typescript/no-restricted-types -- `useRef<VirtuosoHandle>(null)` is how React types a handle ref.
  virtuosoRef: RefObject<VirtuosoHandle | null>,
): FollowLatestOutput {
  const isFollowingRef = useRef(true);
  const [scroller, setScroller] = useState<HTMLElement | undefined>();

  const scrollerRef: FollowLatestOutput['scrollerRef'] = useCallback((element) => {
    setScroller(element instanceof HTMLElement ? element : undefined);
  }, []);

  useEffect(() => {
    if (!scroller) {
      return;
    }
    let lastScrollTop = scroller.scrollTop;
    const handleScroll = (): void => {
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      if (scrollHeight - scrollTop - clientHeight <= bottomThreshold) {
        isFollowingRef.current = true;
      } else if (scrollTop < lastScrollTop) {
        // Only an upward scroll leaves the bottom on purpose. A downward
        // scroll that lands short of it is a jump to the bottom whose event
        // was dispatched after the content had already grown again.
        isFollowingRef.current = false;
      }
      lastScrollTop = scrollTop;
    };
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
    };
  }, [scroller]);

  const followOutput = useCallback((): 'auto' | false => (isFollowingRef.current ? 'auto' : false), []);

  const totalListHeightChanged = useCallback(() => {
    if (isFollowingRef.current) {
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: instantScrollBehavior });
    }
  }, [virtuosoRef]);

  return { scrollerRef, followOutput, totalListHeightChanged };
}
