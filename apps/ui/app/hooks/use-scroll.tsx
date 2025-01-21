import { useEffect, useState, RefObject } from 'react';

export type ScrollToProperties = {
  behavior?: 'smooth' | 'auto';
  reference: RefObject<HTMLDivElement | null>;
};

export function useScroll({ behavior, reference }: ScrollToProperties) {
  const [isScrolledTo, setIsScrolledTo] = useState(true);

  const scrollTo = () => {
    if (!isScrolledTo) {
      reference.current?.scrollIntoView({ behavior: behavior || 'smooth' });
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
