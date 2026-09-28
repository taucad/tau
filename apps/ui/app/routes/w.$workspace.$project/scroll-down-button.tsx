import { ArrowDown } from 'lucide-react';
import { memo, useCallback } from 'react';
import { Button } from '@taucad/ui/components/button';

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

  if (!hasContent || !isVisible) {
    return null;
  }

  return (
    <Button
      size='icon'
      variant='overlay'
      className='absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 justify-center rounded-full'
      aria-label='Scroll to bottom'
      onClick={handleScrollToBottom}
    >
      <ArrowDown className='size-4' />
    </Button>
  );
});

ScrollDownButton.displayName = 'ScrollDownButton';
