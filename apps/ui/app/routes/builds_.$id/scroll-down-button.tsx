import { ArrowDown } from 'lucide-react';
import { memo, useCallback } from 'react';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';

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
        'absolute bottom-28 left-1/2 flex -translate-x-1/2 justify-center rounded-full',
        !isVisible && 'pointer-events-none opacity-0 select-none',
      )}
      aria-label="Scroll to bottom"
      onClick={handleScrollToBottom}
    >
      <ArrowDown className="size-4" />
    </Button>
  );
});

ScrollDownButton.displayName = 'ScrollDownButton';
