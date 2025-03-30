import { Button } from '@/components/ui/button';
import { cn } from '@/utils/ui';
import { ArrowDown } from 'lucide-react';
import { useScroll } from '@/hooks/use-scroll';
import { useRef, memo, useEffect, useCallback } from 'react';

interface ScrollDownButtonProperties {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const ScrollDownButton = memo(({ containerRef }: ScrollDownButtonProperties) => {
  const chatEndReference = useRef<HTMLDivElement | null>(null);
  const { isScrolledTo } = useScroll({
    reference: chatEndReference,
  });

  // Custom scroll function that uses the container ref
  const handleScrollTo = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [containerRef]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    // Small delay to ensure messages are rendered first
    const timeout = setTimeout(() => {
      if (containerRef.current) {
        const { scrollHeight, clientHeight, scrollTop } = containerRef.current;
        const isAlreadyAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;

        if (isAlreadyAtBottom) {
          handleScrollTo();
        }
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [containerRef, handleScrollTo]);

  return (
    <>
      <Button
        size="icon"
        variant="overlay"
        className={cn(
          'sticky bottom-4 left-1/2 flex -translate-x-1/2 justify-center rounded-full',
          isScrolledTo && 'pointer-events-none opacity-0 select-none',
          !isScrolledTo && 'animate-bounce-subtle',
        )}
        tabIndex={isScrolledTo ? -1 : 0}
        onClick={handleScrollTo}
      >
        <ArrowDown className="size-4" />
      </Button>
      <div ref={chatEndReference} className="mb-px" />
    </>
  );
});

ScrollDownButton.displayName = 'ScrollDownButton';
