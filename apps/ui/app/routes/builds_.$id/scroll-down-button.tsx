import { ArrowDown } from 'lucide-react';
import { memo, useCallback } from 'react';
import { Button } from '~/components/ui/button.js';
import { cn } from '~/utils/ui.js';

type ScrollDownButtonProperties = {
  readonly hasContent: boolean;
  readonly onScrollToBottom: () => void;
  readonly isVisible: boolean;
};

export const ScrollDownButton = memo(function ({
  hasContent,
  onScrollToBottom,
  isVisible,
}: ScrollDownButtonProperties) {
  const handleScrollToBottom = useCallback(() => {
    onScrollToBottom();
  }, [onScrollToBottom]);

  if (!hasContent) {
    return null;
  }

  return (
    <Button
      size="icon"
      variant="overlay"
      className={cn(
        'sticky bottom-14 left-1/2 flex -translate-x-1/2 justify-center rounded-full',
        !isVisible && 'pointer-events-none opacity-0 select-none',
        isVisible && 'animate-bounce-subtle',
      )}
      aria-label="Scroll to bottom"
      onClick={handleScrollToBottom}
    >
      <ArrowDown className="size-4" />
    </Button>
  );
});

ScrollDownButton.displayName = 'ScrollDownButton';
