import { ArrowDown } from 'lucide-react';
import { useRef, memo, useCallback } from 'react';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/utils/ui.js';
import { useScroll } from '@/hooks/use-scroll.js';

type ScrollDownButtonProperties = {
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly hasContent: boolean;
};

export const ScrollDownButton = memo(({ containerRef, hasContent }: ScrollDownButtonProperties) => {
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  const chatEndReference = useRef<HTMLDivElement | null>(null);
  const { isScrolledTo } = useScroll(
    {
      reference: chatEndReference,
    },
    [hasContent],
  );

  // Custom scroll function that uses the container ref
  const handleScrollTo = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [containerRef]);

  return (
    <>
      <Button
        size="icon"
        variant="overlay"
        className={cn(
          'sticky bottom-4 left-1/2 flex -translate-x-1/2 justify-center rounded-full',
          (isScrolledTo || !hasContent) && 'pointer-events-none opacity-0 select-none',
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
