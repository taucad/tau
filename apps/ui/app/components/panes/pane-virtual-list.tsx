import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { cn } from '@taucad/ui/utils/cn';
import { paneCollectionItemSpacing, paneSpacingClassName } from '#components/panes/pane-spacing.styles.js';

type PaneListReveal = { readonly key: string; readonly requestId: number; readonly shouldFocus?: boolean };
const tabbableSelector =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [role=spinbutton]:not([disabled])';

const isTabbable = (control: HTMLElement): boolean =>
  control.tabIndex >= 0 &&
  !control.matches(':disabled, [aria-disabled=true]') &&
  !control.closest('[hidden]') &&
  getComputedStyle(control).display !== 'none' &&
  getComputedStyle(control).visibility !== 'hidden';

/**
 * Measured collection body for workbench disclosures. Small collections keep their natural height.
 * Row state belongs to the caller; virtual rows may unmount. Reveal and optional primary-button
 * navigation use the full collection, then focus only after the requested row mounts.
 */
export function PaneVirtualList<Item>({
  data,
  getItemKey,
  itemContent,
  ariaLabel,
  className,
  itemSpacing,
  reveal,
  focusSelector = 'button, input, [role=spinbutton]',
  enableKeyboardNavigation = false,
  scrollParentSelector,
}: {
  readonly data: readonly Item[];
  readonly getItemKey: (item: Item) => string;
  readonly itemContent: (index: number, item: Item) => ReactNode;
  readonly ariaLabel: string;
  /** Virtualized viewport size. Embedded collections default to 16rem; pane bodies use h-full. */
  readonly className?: string;
  /** Gap between measured rows. Omit for controls that already own their internal row padding. */
  readonly itemSpacing?: keyof typeof paneCollectionItemSpacing;
  readonly reveal?: PaneListReveal;
  readonly focusSelector?: string;
  readonly enableKeyboardNavigation?: boolean;
  /** Natural rows reveal within this pane scroller; virtual rows use their own viewport. */
  readonly scrollParentSelector?: string;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const pendingFocus = useRef<{ key: string; selector: string; isLast: boolean } | undefined>(undefined);
  const continueTab = useRef<(index: number, isLast: boolean) => void>(undefined);
  const activeKey = useRef<string | undefined>(undefined);
  const handledReveal = useRef<PaneListReveal | undefined>(undefined);
  const focusFrame = useRef<number | undefined>(undefined);
  const items = useMemo(() => [...data], [data]);
  const keys = useMemo(() => items.map((item) => getItemKey(item)), [getItemKey, items]);
  const isVirtual = items.length > 20;

  const updateFocus = useCallback(() => {
    const rows = [...(containerRef.current?.querySelectorAll<HTMLElement>('[data-pane-list-key]') ?? [])].filter(
      (row) => row.closest('[data-slot=pane-virtual-list]') === containerRef.current,
    );
    const pending = rows.find((row) => row.dataset['paneListKey'] === pendingFocus.current?.key);
    const targets = pendingFocus.current
      ? [...(pending?.querySelectorAll<HTMLElement>(pendingFocus.current.selector) ?? [])]
      : [];
    const reachable = targets.filter((target) =>
      pendingFocus.current?.selector === tabbableSelector ? isTabbable(target) : !target.matches(':disabled'),
    );
    const target = reachable.at(pendingFocus.current?.isLast ? -1 : 0);
    if (pending && pendingFocus.current?.selector === tabbableSelector && !target) {
      const { key, isLast } = pendingFocus.current;
      pendingFocus.current = undefined;
      continueTab.current?.(keys.indexOf(key) + (isLast ? -1 : 1), isLast);
    }
    if (target) {
      activeKey.current = pendingFocus.current?.key;
      pendingFocus.current = undefined;
      target.focus({ preventScroll: true });
    }
    if (enableKeyboardNavigation) {
      const active = rows.find((row) => row.dataset['paneListKey'] === activeKey.current) ?? rows[0];
      for (const row of rows) {
        const button = row.querySelector<HTMLElement>(focusSelector);
        if (button) {
          button.tabIndex = row === active ? 0 : -1;
        }
      }
    }
  }, [enableKeyboardNavigation, focusSelector, keys]);

  const settleFocus = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    if (focusFrame.current !== undefined) {
      cancelAnimationFrame(focusFrame.current);
    }
    focusFrame.current = requestAnimationFrame(updateFocus);
  }, [updateFocus]);
  useLayoutEffect(updateFocus);
  useEffect(
    () => () => {
      if (focusFrame.current !== undefined) {
        cancelAnimationFrame(focusFrame.current);
      }
    },
    [],
  );

  const focusItem = useCallback(
    (
      index: number,
      {
        shouldFocus = true,
        selector = focusSelector,
        isLast = false,
      }: { shouldFocus?: boolean; selector?: string; isLast?: boolean } = {},
    ) => {
      const key = keys[index];
      if (key === undefined) {
        return;
      }
      pendingFocus.current = shouldFocus ? { key, selector, isLast } : undefined;
      if (isVirtual) {
        virtuosoRef.current?.scrollIntoView({ index, align: 'center', behavior: 'auto', done: settleFocus });
        updateFocus();
      } else {
        const row = [...(containerRef.current?.children ?? [])].find(
          (candidate) => candidate instanceof HTMLElement && candidate.dataset['paneListKey'] === key,
        );
        const scroller = scrollParentSelector
          ? containerRef.current?.closest<HTMLElement>(scrollParentSelector)
          : containerRef.current;
        if (row instanceof HTMLElement && scroller) {
          if (focusFrame.current !== undefined) {
            cancelAnimationFrame(focusFrame.current);
          }
          focusFrame.current = requestAnimationFrame(() => {
            const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
            if (offset < 0 || offset + row.offsetHeight > scroller.clientHeight) {
              scroller.scrollTo({ top: scroller.scrollTop + offset - (scroller.clientHeight - row.offsetHeight) / 2 });
            }
          });
        }
        updateFocus();
      }
      if (isVirtual) {
        settleFocus();
      }
    },
    [focusSelector, isVirtual, keys, scrollParentSelector, settleFocus, updateFocus],
  );

  useLayoutEffect(() => {
    continueTab.current = (index, isLast) => {
      if (keys[index] !== undefined) {
        focusItem(index, { selector: tabbableSelector, isLast });
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const outside = [...document.querySelectorAll<HTMLElement>(tabbableSelector)].filter(
        (control) =>
          isTabbable(control) &&
          !container.contains(control) &&
          Boolean(
            // oxlint-disable-next-line no-bitwise -- DOM document position is a bitmask.
            container.compareDocumentPosition(control) &
            (isLast ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING),
          ),
      );
      outside.at(isLast ? -1 : 0)?.focus({ preventScroll: true });
    };
  }, [focusItem, keys]);

  useEffect(() => {
    if (
      !reveal ||
      (handledReveal.current?.key === reveal.key && handledReveal.current.requestId === reveal.requestId)
    ) {
      return;
    }
    const index = keys.indexOf(reveal.key);
    if (index === -1) {
      return;
    }
    handledReveal.current = reveal;
    focusItem(index, { shouldFocus: reveal.shouldFocus });
  }, [focusItem, keys, reveal]);

  const renderItem = useCallback(
    (index: number, item: Item) => (
      <div
        key={getItemKey(item)}
        role='listitem'
        aria-posinset={index + 1}
        aria-setsize={items.length}
        data-pane-list-key={getItemKey(item)}
        className={cn(index > 0 && itemSpacing && paneCollectionItemSpacing[itemSpacing])}
      >
        {itemContent(index, item)}
      </div>
    ),
    [getItemKey, itemContent, itemSpacing, items.length],
  );
  const computeItemKey = useCallback((_index: number, item: Item) => getItemKey(item), [getItemKey]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLElement)) {
        return;
      }
      if (event.key === 'Tab' && !enableKeyboardNavigation) {
        let row = event.target.closest<HTMLElement>('[data-pane-list-key]');
        while (row && row.closest('[data-slot=pane-virtual-list]') !== event.currentTarget) {
          row = row.parentElement?.closest<HTMLElement>('[data-pane-list-key]') ?? null;
        }
        if (!row) {
          return;
        }
        const controls = [...row.querySelectorAll<HTMLElement>(tabbableSelector)].filter((control) =>
          isTabbable(control),
        );
        if (event.target !== controls.at(event.shiftKey ? 0 : -1)) {
          return;
        }
        const index = keys.indexOf(row.dataset['paneListKey'] ?? '');
        const nextIndex = index + (event.shiftKey ? -1 : 1);
        const nextKey = keys[nextIndex];
        if (nextKey === undefined) {
          return;
        }
        if (isVirtual) {
          event.preventDefault();
          event.stopPropagation();
          focusItem(nextIndex, { selector: tabbableSelector, isLast: event.shiftKey });
        }
        return;
      }
      if (
        !enableKeyboardNavigation ||
        !event.target.matches(focusSelector) ||
        event.target.closest('[data-slot=pane-virtual-list]') !== event.currentTarget
      ) {
        return;
      }
      const key = event.target.closest<HTMLElement>('[data-pane-list-key]')?.dataset['paneListKey'];
      const index = key === undefined ? -1 : keys.indexOf(key);
      let next: number;
      switch (event.key) {
        case 'Home': {
          next = 0;
          break;
        }
        case 'End': {
          next = keys.length - 1;
          break;
        }
        case 'ArrowUp': {
          next = Math.max(0, index - 1);
          break;
        }
        case 'ArrowDown': {
          next = Math.min(keys.length - 1, index + 1);
          break;
        }
        default: {
          return;
        }
      }
      event.preventDefault();
      event.stopPropagation();
      focusItem(next);
    },
    [enableKeyboardNavigation, focusItem, focusSelector, isVirtual, keys],
  );

  return (
    <div
      ref={containerRef}
      role='list'
      aria-label={ariaLabel}
      data-slot='pane-virtual-list'
      className={cn(
        'min-h-0',
        paneSpacingClassName,
        isVirtual ? (className ?? 'h-64') : cn('overflow-y-auto', className),
      )}
      onKeyDown={handleKeyDown}
      onFocusCapture={(event) => {
        if (event.target.closest('[data-slot=pane-virtual-list]') === event.currentTarget) {
          activeKey.current = event.target.closest<HTMLElement>('[data-pane-list-key]')?.dataset['paneListKey'];
          updateFocus();
        }
      }}
    >
      {isVirtual ? (
        <Virtuoso
          ref={virtuosoRef}
          className='size-full scroll-shadows-y [--scroll-fade-end:transparent]'
          data={items}
          computeItemKey={computeItemKey}
          itemContent={renderItem}
          itemsRendered={settleFocus}
        />
      ) : (
        items.map((item, index) => renderItem(index, item))
      )}
    </div>
  );
}
