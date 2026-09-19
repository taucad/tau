import { useCallback, useEffect, useRef, useState } from 'react';

const bottomTolerance = 8;

export type StickToBottomReferences = {
  /** Attach to the scrollable element. */
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React callback refs receive null on detach.
  readonly scrollRef: (element: HTMLDivElement | null) => void;
  /** Attach to the growing content inside that element. */
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React callback refs receive null on detach.
  readonly contentRef: (element: HTMLDivElement | null) => void;
};

/**
 * Pin a live, growing scroll region to its latest content until the reader scrolls away.
 * @param isEnabled - Whether the region is currently streaming and visible.
 * @returns Callback refs for the scroll container and its content.
 */
export function useStickToBottom(isEnabled: boolean): StickToBottomReferences {
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | undefined>(undefined);
  const [content, setContent] = useState<HTMLDivElement | undefined>(undefined);
  const stickToBottomRef = useRef(true);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React callback refs receive null on detach.
  const scrollRef = useCallback((element: HTMLDivElement | null): void => {
    setScrollContainer(element ?? undefined);
  }, []);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React callback refs receive null on detach.
  const contentRef = useCallback((element: HTMLDivElement | null): void => {
    setContent(element ?? undefined);
  }, []);

  useEffect(() => {
    if (!isEnabled || !scrollContainer || !content || typeof ResizeObserver === 'undefined') {
      return;
    }
    let userInteracting = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const markUserInteraction = (): void => {
      userInteracting = true;
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => {
        userInteracting = false;
      }, 150);
    };
    const updateStickiness = (): void => {
      if (!userInteracting) {
        return;
      }
      const distance = scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
      stickToBottomRef.current = distance <= bottomTolerance;
    };
    const pin = (): void => {
      if (stickToBottomRef.current) {
        // oxlint-disable-next-line react/immutability -- keeping a live transcript pinned is an imperative DOM operation.
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    };
    pin();
    const observer = new ResizeObserver(pin);
    observer.observe(content);
    scrollContainer.addEventListener('wheel', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('touchstart', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('pointerdown', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('scroll', updateStickiness, { passive: true });
    return () => {
      observer.disconnect();
      globalThis.clearTimeout(timer);
      scrollContainer.removeEventListener('wheel', markUserInteraction);
      scrollContainer.removeEventListener('touchstart', markUserInteraction);
      scrollContainer.removeEventListener('pointerdown', markUserInteraction);
      scrollContainer.removeEventListener('scroll', updateStickiness);
    };
  }, [content, isEnabled, scrollContainer]);

  return { scrollRef, contentRef };
}
