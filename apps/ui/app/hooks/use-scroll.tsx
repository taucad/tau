import { useEffect, useState, RefObject } from 'react';

export type ScrollToProperties = {
  behavior?: 'smooth' | 'auto';
  reference: RefObject<HTMLDivElement | null>;
};

export function useScroll({ behavior, reference }: ScrollToProperties) {
  const [isScrolledTo, setIsScrolledTo] = useState(false);

  const scrollTo = () => {
    if (reference.current) {
      // Find the scrollable parent container by traversing up and checking both
      // inline styles and computed styles for overflow
      let element: HTMLElement | null = reference.current;
      let scrollContainer: HTMLElement | undefined;

      while (element && !scrollContainer) {
        const style = globalThis.getComputedStyle(element);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          scrollContainer = element;
        }
        element = element.parentElement;
      }

      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: behavior || 'smooth',
        });
      }
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsScrolledTo(entry.isIntersecting);
      },
      { root: undefined, threshold: 1 },
    );

    if (reference.current) {
      observer.observe(reference.current);
    }

    return () => {
      if (reference.current) {
        observer.unobserve(reference.current);
      }
    };
  }, [reference]);

  return {
    isScrolledTo,
    scrollTo,
  };
}
